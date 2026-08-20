import { aliasedTable, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { auditLog, matches, rounds, teams, users } from '@/db/schema';
import { predictionCountsByMatch, predictionCountsByUser } from '@/lib/queries/counts';
import type { MatchStatus } from '@/lib/lock';

/**
 * Заявките тук минават през query builder-а, а не през db.execute() с чист SQL.
 * Причина: при чист SQL drizzle не прилага мапърите си за типове и колоните
 * timestamptz се връщат като низове, а не като Date — което после гърми с
 * "Invalid time value" при форматиране. Агрегатните изрази се пишат като
 * sql<number> фрагменти вътре в select-а, което пази мапването на останалите.
 */

const homeTeams = aliasedTable(teams, 'home_teams');
const awayTeams = aliasedTable(teams, 'away_teams');

export type AdminUserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin';
  status: 'pending' | 'active' | 'blocked';
  createdAt: Date;
  lastLoginAt: Date | null;
  predictionCount: number;
};

export async function listUsers(): Promise<AdminUserRow[]> {
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      // Чакащите одобрение излизат първи — това е работата, която стои на админа.
      .orderBy(
        sql`case ${users.status} when 'pending' then 0 when 'active' then 1 else 2 end`,
        asc(users.lastName),
      ),
    predictionCountsByUser(),
  ]);

  return rows.map((row) => ({ ...row, predictionCount: counts.get(row.id) ?? 0 }));
}

export type AdminMatchRow = {
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
  htHome: number | null;
  htAway: number | null;
  ftHome: number | null;
  ftAway: number | null;
  htSource: 'scrape' | 'manual' | null;
  ftSource: 'scrape' | 'manual' | null;
  rawResult: string | null;
  predictionCount: number;
};

const ADMIN_MATCH_FIELDS = {
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
  htHome: matches.htHome,
  htAway: matches.htAway,
  ftHome: matches.ftHome,
  ftAway: matches.ftAway,
  htSource: matches.htSource,
  ftSource: matches.ftSource,
  rawResult: matches.rawResult,
};

function adminMatchQuery() {
  return db
    .select(ADMIN_MATCH_FIELDS)
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .innerJoin(homeTeams, eq(homeTeams.id, matches.homeTeamId))
    .innerJoin(awayTeams, eq(awayTeams.id, matches.awayTeamId));
}

async function withPredictionCounts(
  rows: Omit<AdminMatchRow, 'predictionCount'>[],
): Promise<AdminMatchRow[]> {
  const counts = await predictionCountsByMatch();
  return rows.map((row) => ({ ...row, predictionCount: counts.get(row.id) ?? 0 }));
}

/** Първият кръг с още неизигран мач — разумно начало за редактора. */
export async function firstUnplayedRound(): Promise<number | null> {
  const rows = await db
    .select({ number: rounds.number })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .where(sql`${matches.ftHome} is null`)
    .orderBy(asc(rounds.number))
    .limit(1);

  return rows[0]?.number ?? null;
}

/** Мачовете от един кръг — за пълния редактор в админа. */
export async function matchesInRound(roundNumber: number): Promise<AdminMatchRow[]> {
  const rows = await adminMatchQuery()
    .where(eq(rounds.number, roundNumber))
    .orderBy(asc(matches.kickoffAt), asc(matches.id));

  return withPredictionCounts(rows);
}

export type AuditRow = {
  id: number;
  action: string;
  entity: string | null;
  at: Date;
  actorName: string | null;
};

export async function recentAudit(limit = 30): Promise<AuditRow[]> {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      at: auditLog.at,
      actorName: sql<string | null>`${users.firstName} || ' ' || ${users.lastName}`,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .orderBy(desc(auditLog.at))
    .limit(limit);
}
