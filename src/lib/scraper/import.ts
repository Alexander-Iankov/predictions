import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { matches, rounds, teamAliases, teams } from '@/db/schema';
import { scoreMatch } from '@/lib/score-match';
import type { ParsedMatch, ParsedRound } from '@/lib/scraper/parse';

export type ImportStats = {
  matchesSeen: number;
  matchesUpdated: number;
  predictionsScored: number;
  /** мачове, прескочени заради заключен кръг */
  matchesSkipped: number;
  /** мачове, прескочени, защото вече са изиграни */
  matchesPlayed: number;
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
  ftHome: number | null;
  rawResult: string | null;
};

/**
 * Изигран ли е мачът според админа.
 *
 * Двете условия са заедно нарочно: статусът е изричното решение, а въведеният
 * краен резултат е същото решение, изразено чрез данните. Ако се разчита само
 * на едното, мач с резултат, но забравен статус, пак би си сменял датата.
 */
function isPlayed(match: ExistingMatch): boolean {
  return match.status === 'finished' || match.ftHome !== null;
}

/**
 * Какво точно да се промени по вече съществуващ мач — или null, ако нищо.
 *
 * Обновяването търси само нови дати и часове, и само за **неизиграните**
 * мачове. Резултатите — полувреме, краен резултат и статусът "изигран" — се
 * въвеждат единствено ръчно от админа и източникът никога не ги презаписва.
 *
 * Изиграният мач не се пипа изобщо, защото датата му вече е история. Източникът
 * пренарежда страницата си и понякога подава друг час за минал мач; местенето би
 * подменило кога всъщност се е играло, а заедно с това и кога прогнозите са се
 * заключили.
 */
function buildUpdate(
  existing: ExistingMatch,
  parsed: ParsedMatch,
): Partial<typeof matches.$inferInsert> | null {
  if (isPlayed(existing)) return null;

  const set: Partial<typeof matches.$inferInsert> = {};

  if (existing.kickoffAt.getTime() !== parsed.kickoffAt.getTime()) {
    set.kickoffAt = parsed.kickoffAt;
  }
  if (existing.timeKnown !== parsed.timeKnown) {
    set.timeKnown = parsed.timeKnown;
  }

  // Суровият текст от страницата е само подсказка за админа какво да въведе —
  // не участва в точкуването. Затова се опреснява, докато мачът чака въвеждане.
  if ((existing.rawResult ?? '') !== parsed.rawResult) {
    set.rawResult = parsed.rawResult;
  }

  if (Object.keys(set).length === 0) return null;

  set.updatedAt = new Date();

  return set;
}

/**
 * Вкарва програмата от източника в базата.
 *
 * Резултати не се внасят — нито за нови мачове, нито за съществуващи. Точкува
 * се само това, което админът е въвел ръчно и което още не е точкувано.
 */
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
      ftHome: matches.ftHome,
      rawResult: matches.rawResult,
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
    matchesSkipped: 0,
    matchesPlayed: 0,
  };

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
          // Нов мач влиза само като програма, дори източникът вече да показва
          // резултат: правилото „резултатите са ръчни" не бива да има изключения,
          // иначе никой няма да помни кое откъде е дошло.
          status: 'scheduled',
          rawResult: match.rawResult,
        })
        // Ако друго обновяване е вкарало същия мач между четенето и записа,
        // тук не се хвърля грешка — той просто вече съществува.
        .onConflictDoNothing({
          target: [matches.roundId, matches.homeTeamId, matches.awayTeamId],
        })
        .returning({ id: matches.id });

      if (inserted[0] === undefined) continue;

      stats.matchesUpdated += 1;
      continue;
    }

    if (isPlayed(existing)) {
      stats.matchesPlayed += 1;
      continue;
    }

    const update = buildUpdate(existing, match);
    if (update === null) continue;

    await db.update(matches).set(update).where(eq(matches.id, existing.id));
    stats.matchesUpdated += 1;
  }

  // Мачове с ръчно въведен резултат, които още не са точкувани — например
  // защото прогноза е дошла, след като резултатът е бил въведен.
  const unscored = await db
    .select({ id: matches.id })
    .from(matches)
    .where(sql`${matches.ftHome} is not null and ${matches.scoredAt} is null`);

  for (const match of unscored) {
    stats.predictionsScored += await scoreMatch(match.id);
  }

  return stats;
}
