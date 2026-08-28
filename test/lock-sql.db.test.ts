/**
 * Правилото за прозореца е написано два пъти: в TypeScript (lock.ts) и в SQL
 * (lock-sql.ts). Този тест ги пуска един срещу друг върху всички комбинации.
 *
 * Ако се разминат, някой ще може да пише прогноза, която UI-ът смята за
 * заключена, или ще види чужда прогноза преждевременно. Затова разминаване тук
 * е по-важно от всеки друг тест в проекта.
 *
 * Иска DATABASE_URL (docker compose up -d). Без него се пропуска.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isOpen, isRevealed, type LockableMatch } from '@/lib/lock';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('SQL правилото съвпада с TypeScript правилото', async () => {
  const { db } = await import('@/db');
  const { matches, rounds, teams } = await import('@/db/schema');
  const { isOpenSql, isRevealedSql } = await import('@/lib/lock-sql');

  const ROUND = 997;
  const PREFIX = 'SQL ОТБОР';

  let roundId: number;
  let homeTeamId: number;
  let awayTeamId: number;
  let matchId: number;

  const statuses = ['scheduled', 'finished', 'postponed'] as const;
  const windows = ['auto', 'open', 'locked'] as const;
  /** минути до началото: далеч преди срока, точно преди, след срока, отминал */
  const offsets = [600, 61, 30, -30];

  beforeAll(async () => {
    await cleanup();

    const insertedRound = await db
      .insert(rounds)
      .values({ number: ROUND, label: 'sql кръг' })
      .returning({ id: rounds.id });
    roundId = insertedRound[0]!.id;

    const insertedTeams = await db
      .insert(teams)
      .values([{ name: `${PREFIX} А` }, { name: `${PREFIX} Б` }])
      .returning({ id: teams.id, name: teams.name });

    homeTeamId = insertedTeams.find((t) => t.name.endsWith('А'))!.id;
    awayTeamId = insertedTeams.find((t) => t.name.endsWith('Б'))!.id;

    const insertedMatch = await db
      .insert(matches)
      .values({ roundId, homeTeamId, awayTeamId, kickoffAt: new Date() })
      .returning({ id: matches.id });
    matchId = insertedMatch[0]!.id;
  });

  afterAll(cleanup);

  async function cleanup() {
    const round = await db.select({ id: rounds.id }).from(rounds).where(eq(rounds.number, ROUND));
    if (round[0]) await db.delete(matches).where(eq(matches.roundId, round[0].id));
    await db.delete(rounds).where(eq(rounds.number, ROUND));
    await db.delete(teams).where(eq(teams.name, `${PREFIX} А`));
    await db.delete(teams).where(eq(teams.name, `${PREFIX} Б`));
  }

  it('дава същия отговор за всички 36 комбинации', async () => {
    const mismatches: string[] = [];

    for (const status of statuses) {
      for (const predictionWindow of windows) {
        for (const minutes of offsets) {
          const kickoffAt = new Date(Date.now() + minutes * 60_000);

          await db
            .update(matches)
            .set({ kickoffAt, status, predictionWindow })
            .where(eq(matches.id, matchId));

          const rows = await db
            .select({
              open: sql<boolean>`${isOpenSql()}`,
              revealed: sql<boolean>`${isRevealedSql()}`,
            })
            .from(matches)
            .where(eq(matches.id, matchId));

          const fromSql = rows[0]!;
          const match: LockableMatch = { kickoffAt, status, predictionWindow };
          const now = new Date();

          const expectedOpen = isOpen(match, now);
          const expectedRevealed = isRevealed(match, now);

          const where = `${status}/${predictionWindow}/${minutes}мин`;
          if (fromSql.open !== expectedOpen) {
            mismatches.push(`${where}: isOpen ts=${expectedOpen} sql=${fromSql.open}`);
          }
          if (fromSql.revealed !== expectedRevealed) {
            mismatches.push(`${where}: isRevealed ts=${expectedRevealed} sql=${fromSql.revealed}`);
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
