import { aliasedTable, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { matches, predictionScores, predictions, rounds, teams, users } from '@/db/schema';
import { LOCK_MINUTES, isOpen, isRevealed, lockAt, type MatchStatus } from '@/lib/lock';
import type { Breakdown } from '@/lib/scoring';

const homeTeams = aliasedTable(teams, 'home_teams');
const awayTeams = aliasedTable(teams, 'away_teams');

export type MatchDetail = {
  id: number;
  roundLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeCrestId: number | null;
  awayCrestId: number | null;
  kickoffAt: Date;
  timeKnown: boolean;
  status: MatchStatus;
  htHome: number | null;
  htAway: number | null;
  ftHome: number | null;
  ftAway: number | null;
  lockAt: Date;
  isOpen: boolean;
  isRevealed: boolean;
};

export type ParticipantPrediction = {
  userId: string;
  firstName: string;
  lastName: string;
  htHome: number;
  htAway: number;
  ftHome: number;
  ftAway: number;
  points: number | null;
  breakdown: Breakdown | null;
  partial: boolean | null;
};

export async function getMatchDetail(matchId: number): Promise<MatchDetail | null> {
  const rows = await db
    .select({
      id: matches.id,
      roundLabel: rounds.label,
      homeTeam: homeTeams.name,
      awayTeam: awayTeams.name,
      homeCrestId: homeTeams.crestId,
      awayCrestId: awayTeams.crestId,
      kickoffAt: matches.kickoffAt,
      timeKnown: matches.timeKnown,
      status: matches.status,
      htHome: matches.htHome,
      htAway: matches.htAway,
      ftHome: matches.ftHome,
      ftAway: matches.ftAway,
    })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .innerJoin(homeTeams, eq(homeTeams.id, matches.homeTeamId))
    .innerJoin(awayTeams, eq(awayTeams.id, matches.awayTeamId))
    .where(eq(matches.id, matchId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const now = new Date();
  return {
    ...row,
    lockAt: lockAt(row),
    isOpen: isOpen(row, now),
    isRevealed: isRevealed(row, now),
  };
}

/**
 * Прогнозите на всички участници за един мач.
 *
 * Условието за заключване е ВЪТРЕ в заявката, не в страницата. Преди
 * заключването резултатът е празен списък — няма как чужда прогноза да излезе
 * от сървъра, независимо какво прави UI-ът или кой вика функцията.
 */
export async function getRevealedPredictions(matchId: number): Promise<ParticipantPrediction[]> {
  return db
    .select({
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      htHome: predictions.htHome,
      htAway: predictions.htAway,
      ftHome: predictions.ftHome,
      ftAway: predictions.ftAway,
      points: predictionScores.points,
      breakdown: predictionScores.breakdown,
      partial: predictionScores.partial,
    })
    .from(predictions)
    .innerJoin(users, eq(users.id, predictions.userId))
    .leftJoin(predictionScores, eq(predictionScores.predictionId, predictions.id))
    .where(
      sql`${predictions.matchId} = ${matchId} and exists (
        select 1
          from ${matches} m
         where m.id = ${predictions.matchId}
           and m.status <> 'postponed'
           and m.kickoff_at - make_interval(mins => ${LOCK_MINUTES}) <= now()
      )`,
    )
    .orderBy(sql`${predictionScores.points} desc nulls last`, asc(users.lastName));
}
