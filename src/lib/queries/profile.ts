import { aliasedTable, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { matches, predictionScores, predictions, rounds, teams, users } from '@/db/schema';
import { LOCK_MINUTES, type MatchStatus } from '@/lib/lock';
import type { Breakdown } from '@/lib/scoring';

const homeTeams = aliasedTable(teams, 'home_teams');
const awayTeams = aliasedTable(teams, 'away_teams');

export type ProfileHeader = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'user' | 'admin';
  status: 'pending' | 'active' | 'blocked';
  createdAt: Date;
  lastLoginAt: Date | null;
};

export async function getProfile(userId: string): Promise<ProfileHeader | null> {
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0] ?? null;
}

export type ProfileStats = {
  /** сума от точките за всички точкувани прогнози */
  points: number;
  /** прогнози за мачове, които вече са изиграни и точкувани */
  played: number;
  /** всички направени прогнози, включително за предстоящи мачове */
  predictions: number;
  /** познати точни крайни резултати */
  exactFt: number;
  /** познати точни полувремена */
  exactHt: number;
  /** точкувани мачове, за които източникът не е дал полувреме */
  partial: number;
};

/**
 * Числата за публичния профил.
 *
 * „Изиграни" брои прогнозите за завършени мачове, а не всички мачове в
 * първенството — иначе числото би казвало нещо за календара, не за участника.
 */
export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const rows = await db
    .select({
      points: sql<number>`coalesce(sum(${predictionScores.points}), 0)::int`,
      played: sql<number>`count(${predictionScores.predictionId})::int`,
      predictions: sql<number>`count(${predictions.id})::int`,
      exactFt: sql<number>`count(*) filter (
        where ${matches.ftHome} is not null
          and ${predictions.ftHome} = ${matches.ftHome}
          and ${predictions.ftAway} = ${matches.ftAway}
      )::int`,
      exactHt: sql<number>`count(*) filter (
        where ${matches.htHome} is not null
          and ${predictions.htHome} = ${matches.htHome}
          and ${predictions.htAway} = ${matches.htAway}
      )::int`,
      partial: sql<number>`count(*) filter (where ${predictionScores.partial})::int`,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .leftJoin(predictionScores, eq(predictionScores.predictionId, predictions.id))
    .where(eq(predictions.userId, userId));

  return (
    rows[0] ?? { points: 0, played: 0, predictions: 0, exactFt: 0, exactHt: 0, partial: 0 }
  );
}

export type ProfilePrediction = {
  matchId: number;
  roundNumber: number;
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
  predHtHome: number;
  predHtAway: number;
  predFtHome: number;
  predFtAway: number;
  points: number | null;
  breakdown: Breakdown | null;
};

/**
 * Прогнозите на един участник — САМО за мачове, чийто прозорец вече е затворен.
 *
 * Условието за заключване е вътре в заявката, точно както при страницата на
 * отделен мач: така чужда прогноза за отворен мач няма как да излезе от сървъра,
 * независимо кой вика функцията и какво прави страницата.
 */
export async function getRevealedPredictionsOf(
  userId: string,
  options: { roundNumber?: number; limit?: number } = {},
): Promise<ProfilePrediction[]> {
  const roundFilter =
    options.roundNumber === undefined
      ? sql``
      : sql`and ${rounds.number} = ${options.roundNumber}`;

  const query = db
    .select({
      matchId: matches.id,
      roundNumber: rounds.number,
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
      predHtHome: predictions.htHome,
      predHtAway: predictions.htAway,
      predFtHome: predictions.ftHome,
      predFtAway: predictions.ftAway,
      points: predictionScores.points,
      breakdown: predictionScores.breakdown,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .innerJoin(homeTeams, eq(homeTeams.id, matches.homeTeamId))
    .innerJoin(awayTeams, eq(awayTeams.id, matches.awayTeamId))
    .leftJoin(predictionScores, eq(predictionScores.predictionId, predictions.id))
    .where(
      sql`${predictions.userId} = ${userId}
          and ${matches.status} <> 'postponed'
          and ${matches.kickoffAt} - make_interval(mins => ${LOCK_MINUTES}) <= now()
          ${roundFilter}`,
    )
    .orderBy(desc(rounds.number), asc(matches.kickoffAt));

  return options.limit === undefined ? query : query.limit(options.limit);
}

/** Последният кръг, в който участникът има вече заключена прогноза. */
export async function lastRoundWithPredictions(userId: string): Promise<number | null> {
  const rows = await db
    .select({ number: rounds.number })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .where(
      sql`${predictions.userId} = ${userId}
          and ${matches.status} <> 'postponed'
          and ${matches.kickoffAt} - make_interval(mins => ${LOCK_MINUTES}) <= now()`,
    )
    .orderBy(desc(rounds.number))
    .limit(1);

  return rows[0]?.number ?? null;
}
