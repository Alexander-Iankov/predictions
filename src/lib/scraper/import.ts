import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { matches, rounds, teamAliases, teams } from '@/db/schema';
import { scoreMatch } from '@/lib/score-match';
import type { ParsedMatch, ParsedRound } from '@/lib/scraper/parse';

export type ImportStats = {
  matchesSeen: number;
  matchesUpdated: number;
  predictionsScored: number;
  /** мачове, при които вече точкуван резултат се е променил */
  resultsChanged: number;
  /** мачове, прескочени заради заключен кръг */
  matchesSkipped: number;
};

type SeenTeam = { name: string; crestId: number | null; sourceUrl: string | null };

/**
 * name → id за отборите, като се уважават псевдонимите за преименувани отбори.
 * Таблицата е с 16 реда, затова се чете цялата — по-просто от условни заявки.
 */
async function resolveTeams(seen: SeenTeam[]): Promise<Map<string, number>> {
  const byName = new Map<string, SeenTeam>();
  for (const team of seen) byName.set(team.name, team);

  const aliases = await db
    .select({ alias: teamAliases.alias, teamId: teamAliases.teamId })
    .from(teamAliases);
  const aliasMap = new Map(aliases.map((a) => [a.alias, a.teamId]));

  // Псевдонимите не се вкарват като нови отбори — те сочат към съществуващ.
  const fresh = [...byName.values()].filter((team) => !aliasMap.has(team.name));
  if (fresh.length > 0) {
    await db
      .insert(teams)
      .values(fresh)
      .onConflictDoUpdate({
        target: teams.name,
        // Ако източникът е добавил емблема или е сменил линка, взима се новото.
        set: { crestId: sql`excluded.crest_id`, sourceUrl: sql`excluded.source_url` },
      });
  }

  const all = await db.select({ id: teams.id, name: teams.name }).from(teams);
  const map = new Map<string, number>(all.map((t) => [t.name, t.id]));
  for (const [alias, teamId] of aliasMap) map.set(alias, teamId);

  const missing = [...byName.keys()].filter((name) => !map.has(name));
  if (missing.length > 0) {
    throw new Error(`Отбори, които не могат да се свържат: ${missing.join(', ')}`);
  }

  return map;
}

type RoundInfo = { id: number; locked: boolean };

async function resolveRounds(parsed: ParsedRound[]): Promise<Map<number, RoundInfo>> {
  await db
    .insert(rounds)
    .values(parsed.map((r) => ({ number: r.number, label: r.label })))
    .onConflictDoUpdate({
      target: rounds.number,
      // Заключването нарочно не се пипа тук — то е решение на админа, а не на
      // източника.
      set: { label: sql`excluded.label` },
    });

  const existing = await db
    .select({ id: rounds.id, number: rounds.number, locked: rounds.lockedForUpdates })
    .from(rounds);

  return new Map(existing.map((r) => [r.number, { id: r.id, locked: r.locked }]));
}

type ExistingMatch = {
  id: number;
  roundId: number;
  homeTeamId: number;
  awayTeamId: number;
  kickoffAt: Date;
  timeKnown: boolean;
  status: 'scheduled' | 'finished' | 'postponed';
  htHome: number | null;
  htAway: number | null;
  ftHome: number | null;
  ftAway: number | null;
  htSource: 'scrape' | 'manual' | null;
  ftSource: 'scrape' | 'manual' | null;
  rawResult: string | null;
  scoredAt: Date | null;
};

type MatchUpdate = {
  set: Partial<typeof matches.$inferInsert>;
  resultChanged: boolean;
};

/**
 * Какво точно да се промени по вече съществуващ мач — или null, ако нищо.
 *
 * Източникът е истината: час, дата и резултати се привеждат към него, дори това
 * да означава да се изчисти ръчно въведена стойност, която източникът не дава.
 * Единствената защита е замразяването на кръга — там мачът изобщо не се стига
 * дотук.
 *
 * Изключение е само статусът "отложен": източникът не изразява отлагане, така
 * че няма какво да се следва и ръчното решение остава.
 */
function buildUpdate(existing: ExistingMatch, parsed: ParsedMatch): MatchUpdate | null {
  const set: Partial<typeof matches.$inferInsert> = {};
  let resultChanged = false;

  if (existing.kickoffAt.getTime() !== parsed.kickoffAt.getTime()) {
    set.kickoffAt = parsed.kickoffAt;
  }
  if (existing.timeKnown !== parsed.timeKnown) {
    set.timeKnown = parsed.timeKnown;
  }
  if ((existing.rawResult ?? '') !== parsed.rawResult) {
    set.rawResult = parsed.rawResult;
  }

  const ftHome = parsed.ft?.home ?? null;
  const ftAway = parsed.ft?.away ?? null;

  if (existing.ftHome !== ftHome || existing.ftAway !== ftAway) {
    set.ftHome = ftHome;
    set.ftAway = ftAway;
    set.ftSource = parsed.ft ? 'scrape' : null;
    resultChanged = true;
  }

  const htHome = parsed.ht?.home ?? null;
  const htAway = parsed.ht?.away ?? null;

  if (existing.htHome !== htHome || existing.htAway !== htAway) {
    set.htHome = htHome;
    set.htAway = htAway;
    set.htSource = parsed.ht ? 'scrape' : null;
    resultChanged = true;
  }

  if (existing.status !== 'postponed') {
    const nextStatus = parsed.ft ? 'finished' : 'scheduled';
    if (existing.status !== nextStatus) set.status = nextStatus;
  }

  if (Object.keys(set).length === 0) return null;

  set.updatedAt = new Date();

  return { set, resultChanged };
}

/** Вкарва парснатия график в базата и преизчислява точките, където трябва. */
export async function importSchedule(parsed: ParsedRound[]): Promise<ImportStats> {
  const allMatches = parsed.flatMap((round) => round.matches);

  const teamMap = await resolveTeams(
    allMatches.flatMap((m) => [
      { name: m.homeTeam, crestId: m.homeTeamSourceId, sourceUrl: m.homeTeamUrl },
      { name: m.awayTeam, crestId: m.awayTeamSourceId, sourceUrl: m.awayTeamUrl },
    ]),
  );
  const roundMap = await resolveRounds(parsed);

  const existingRows: ExistingMatch[] = await db
    .select({
      id: matches.id,
      roundId: matches.roundId,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      kickoffAt: matches.kickoffAt,
      timeKnown: matches.timeKnown,
      status: matches.status,
      htHome: matches.htHome,
      htAway: matches.htAway,
      ftHome: matches.ftHome,
      ftAway: matches.ftAway,
      htSource: matches.htSource,
      ftSource: matches.ftSource,
      rawResult: matches.rawResult,
      scoredAt: matches.scoredAt,
    })
    .from(matches);

  const key = (roundId: number, homeId: number, awayId: number) => `${roundId}|${homeId}|${awayId}`;
  const existingMap = new Map(
    existingRows.map((row) => [key(row.roundId, row.homeTeamId, row.awayTeamId), row]),
  );

  const stats: ImportStats = {
    matchesSeen: allMatches.length,
    matchesUpdated: 0,
    predictionsScored: 0,
    resultsChanged: 0,
    matchesSkipped: 0,
  };

  const toScore: number[] = [];

  for (const match of allMatches) {
    const round = roundMap.get(match.roundNumber);
    const homeTeamId = teamMap.get(match.homeTeam);
    const awayTeamId = teamMap.get(match.awayTeam);

    if (round === undefined || homeTeamId === undefined || awayTeamId === undefined) {
      throw new Error(
        `Не може да се свърже мач: кръг ${match.roundNumber}, ${match.homeTeam} - ${match.awayTeam}`,
      );
    }

    const roundId = round.id;
    const existing = existingMap.get(key(roundId, homeTeamId, awayTeamId));

    // Заключеният кръг се пропуска изцяло — но само за вече съществуващи мачове.
    // Ако мачът е нов, той се създава: иначе заключването би скрило мач, който
    // никой не е виждал, вместо да запази вече уточнени данни.
    if (round.locked && existing) {
      stats.matchesSkipped += 1;
      continue;
    }

    if (!existing) {
      const inserted = await db
        .insert(matches)
        .values({
          roundId,
          homeTeamId,
          awayTeamId,
          kickoffAt: match.kickoffAt,
          timeKnown: match.timeKnown,
          status: match.ft ? 'finished' : 'scheduled',
          htHome: match.ht?.home ?? null,
          htAway: match.ht?.away ?? null,
          ftHome: match.ft?.home ?? null,
          ftAway: match.ft?.away ?? null,
          htSource: match.ht ? 'scrape' : null,
          ftSource: match.ft ? 'scrape' : null,
          rawResult: match.rawResult,
        })
        // Ако друго обновяване е вкарало същия мач между четенето и записа,
        // тук не се хвърля грешка — той просто вече съществува.
        .onConflictDoNothing({
          target: [matches.roundId, matches.homeTeamId, matches.awayTeamId],
        })
        .returning({ id: matches.id });

      const id = inserted[0]?.id;
      if (id === undefined) continue;

      stats.matchesUpdated += 1;
      if (match.ft) toScore.push(id);
      continue;
    }

    const update = buildUpdate(existing, match);
    if (update === null) continue;

    await db.update(matches).set(update.set).where(eq(matches.id, existing.id));
    stats.matchesUpdated += 1;

    if (update.resultChanged) {
      if (existing.scoredAt !== null) stats.resultsChanged += 1;
      toScore.push(existing.id);
    }
  }

  // Мачове с резултат, които още не са точкувани — например защото прогнозите
  // са направени след като резултатът е влязъл.
  const unscored = await db
    .select({ id: matches.id })
    .from(matches)
    .where(sql`${matches.ftHome} is not null and ${matches.scoredAt} is null`);

  for (const matchId of new Set([...toScore, ...unscored.map((m) => m.id)])) {
    stats.predictionsScored += await scoreMatch(matchId);
  }

  return stats;
}
