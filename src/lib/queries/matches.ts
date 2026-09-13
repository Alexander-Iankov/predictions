import { aliasedTable, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { matches, predictionScores, predictions, rounds, teams } from '@/db/schema';
import { predictionCountsByMatch } from '@/lib/queries/counts';
import { isOpen, isRevealed, lockAt, type MatchStatus, type PredictionWindow } from '@/lib/lock';
import type { Breakdown } from '@/lib/scoring';

const homeTeams = aliasedTable(teams, 'home_teams');
const awayTeams = aliasedTable(teams, 'away_teams');

export type MatchRow = {
  id: number;
  roundNumber: number;
  roundLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeCrestId: number | null;
  awayCrestId: number | null;
  kickoffAt: Date;
  timeKnown: boolean;
  status: MatchStatus;
  predictionWindow: PredictionWindow;
  htHome: number | null;
  htAway: number | null;
  ftHome: number | null;
  ftAway: number | null;
  /** прогнозата на текущия потребител, ако има */
  myPrediction: { htHome: number; htAway: number; ftHome: number; ftAway: number } | null;
  myPoints: number | null;
  myBreakdown: Breakdown | null;
  myPartial: boolean | null;
  /** колко участници са направили прогноза — показва се само след заключване */
  predictionCount: number;
  isOpen: boolean;
  isRevealed: boolean;
  lockAt: Date;
};

export type RoundGroup = {
  number: number;
  label: string;
  matches: MatchRow[];
};

/**
 * Всички мачове с прогнозата на дадения потребител.
 *
 * Съзнателно НЕ връща чуждите прогнози — за тях има отделна заявка, която сама
 * проверява дали мачът е заключен.
 */
export async function getMatchesForUser(userId: string): Promise<RoundGroup[]> {
  const counts = await predictionCountsByMatch(userId);

  const rows = await db
    .select({
      id: matches.id,
      roundNumber: rounds.number,
      roundLabel: rounds.label,
      homeTeam: homeTeams.name,
      awayTeam: awayTeams.name,
      homeCrestId: homeTeams.crestId,
      awayCrestId: awayTeams.crestId,
      kickoffAt: matches.kickoffAt,
      timeKnown: matches.timeKnown,
      status: matches.status,
      predictionWindow: matches.predictionWindow,
      htHome: matches.htHome,
      htAway: matches.htAway,
      ftHome: matches.ftHome,
      ftAway: matches.ftAway,
      predHtHome: predictions.htHome,
      predHtAway: predictions.htAway,
      predFtHome: predictions.ftHome,
      predFtAway: predictions.ftAway,
      points: predictionScores.points,
      breakdown: predictionScores.breakdown,
      partial: predictionScores.partial,
    })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .innerJoin(homeTeams, eq(homeTeams.id, matches.homeTeamId))
    .innerJoin(awayTeams, eq(awayTeams.id, matches.awayTeamId))
    .leftJoin(
      predictions,
      sql`${predictions.matchId} = ${matches.id} and ${predictions.userId} = ${userId}`,
    )
    .leftJoin(predictionScores, eq(predictionScores.predictionId, predictions.id))
    .orderBy(asc(rounds.number), asc(matches.kickoffAt), asc(matches.id));

  const now = new Date();
  const groups = new Map<number, RoundGroup>();

  for (const row of rows) {
    const match: MatchRow = {
      id: row.id,
      roundNumber: row.roundNumber,
      roundLabel: row.roundLabel,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      homeCrestId: row.homeCrestId,
      awayCrestId: row.awayCrestId,
      kickoffAt: row.kickoffAt,
      timeKnown: row.timeKnown,
      status: row.status,
      predictionWindow: row.predictionWindow,
      htHome: row.htHome,
      htAway: row.htAway,
      ftHome: row.ftHome,
      ftAway: row.ftAway,
      myPrediction:
        row.predHtHome === null ||
        row.predHtAway === null ||
        row.predFtHome === null ||
        row.predFtAway === null
          ? null
          : {
              htHome: row.predHtHome,
              htAway: row.predHtAway,
              ftHome: row.predFtHome,
              ftAway: row.predFtAway,
            },
      myPoints: row.points,
      myBreakdown: row.breakdown,
      myPartial: row.partial,
      predictionCount: counts.get(row.id) ?? 0,
      isOpen: isOpen(row, now),
      isRevealed: isRevealed(row, now),
      lockAt: lockAt(row),
    };

    const group = groups.get(row.roundNumber);
    if (group) group.matches.push(match);
    else groups.set(row.roundNumber, { number: row.roundNumber, label: row.roundLabel, matches: [match] });
  }

  return [...groups.values()];
}

/**
 * Кой кръг да е отворен по подразбиране: първият още неизигран, тоест първият, в
 * който има мач с начален час в бъдещето. Ако всичко е минало — последният.
 *
 * Мери се по часа, а не по наличието на резултат. Резултатите се въвеждат ръчно
 * и понякога със закъснение, така че липсващ резултат не значи „предстои" — иначе
 * страницата отваря кръг, игран преди седмици, само защото админът не е стигнал
 * до него.
 */
export function currentRoundNumber(
  // Нарочно по-тесен тип от RoundGroup: функцията гледа само часовете, а така
  // тестът може да я викне без да сглобява цял мач с двайсет полета.
  groups: { number: number; matches: { kickoffAt: Date }[] }[],
  now: Date = new Date(),
): number {
  const upcoming = groups.find((group) =>
    group.matches.some((match) => match.kickoffAt.getTime() > now.getTime()),
  );

  return upcoming?.number ?? groups.at(-1)?.number ?? 1;
}
