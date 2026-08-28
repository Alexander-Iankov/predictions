/**
 * Тества заключването срещу истинска база — правилото е в SQL заявката, затова
 * няма как да се провери с mock.
 *
 * Иска DATABASE_URL (docker compose up -d). Без него се пропуска.
 */
import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('savePredictionIfOpen', async () => {
  const { db } = await import('@/db');
  const { matches, predictions, rounds, teams, users } = await import('@/db/schema');
  const { savePredictionIfOpen } = await import('@/lib/predictions/save');

  const TEST_ROUND = 999;
  const TEST_PREFIX = 'ТЕСТ ОТБОР';

  const prediction = { ht: { home: 1, away: 0 }, ft: { home: 2, away: 1 } };

  let userId: string;
  let roundId: number;
  let homeTeamId: number;
  let awayTeamId: number;

  /**
   * Мач, който започва след `minutes` минути.
   *
   * Уникалният ключ е (кръг, домакин, гост), а всички тестове ползват една и
   * съща двойка отбори — затова тестовият кръг се изчиства преди всеки мач.
   * Прогнозите падат заедно с мача (ON DELETE CASCADE).
   */
  const makeMatch = async (
    minutes: number,
    status: 'scheduled' | 'finished' | 'postponed' = 'scheduled',
  ): Promise<number> => {
    await db.delete(matches).where(eq(matches.roundId, roundId));

    const rows = await db
      .insert(matches)
      .values({
        roundId,
        homeTeamId,
        awayTeamId,
        kickoffAt: new Date(Date.now() + minutes * 60_000),
        status,
      })
      .returning({ id: matches.id });

    const id = rows[0]?.id;
    if (id === undefined) throw new Error('мачът не се създаде');

    return id;
  };

  beforeAll(async () => {
    const insertedUser = await db
      .insert(users)
      .values({
        email: `test-lock-${Date.now()}@example.invalid`,
        passwordHash: 'нямa-значение',
        firstName: 'Тест',
        lastName: 'Заключване',
        status: 'active',
      })
      .returning({ id: users.id });
    userId = insertedUser[0]!.id;

    const insertedRound = await db
      .insert(rounds)
      .values({ number: TEST_ROUND, label: 'тестов кръг' })
      .onConflictDoUpdate({ target: rounds.number, set: { label: 'тестов кръг' } })
      .returning({ id: rounds.id });
    roundId = insertedRound[0]!.id;

    const insertedTeams = await db
      .insert(teams)
      .values([{ name: `${TEST_PREFIX} А` }, { name: `${TEST_PREFIX} Б` }])
      .onConflictDoNothing({ target: teams.name })
      .returning({ id: teams.id, name: teams.name });

    const found =
      insertedTeams.length === 2
        ? insertedTeams
        : await db.select({ id: teams.id, name: teams.name }).from(teams).where(like(teams.name, `${TEST_PREFIX}%`));

    homeTeamId = found.find((t) => t.name.endsWith('А'))!.id;
    awayTeamId = found.find((t) => t.name.endsWith('Б'))!.id;
  });

  afterAll(async () => {
    const testMatches = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.roundId, roundId));

    if (testMatches.length > 0) {
      await db.delete(predictions).where(
        inArray(
          predictions.matchId,
          testMatches.map((m) => m.id),
        ),
      );
      await db.delete(matches).where(eq(matches.roundId, roundId));
    }

    await db.delete(users).where(eq(users.id, userId));
    await db.delete(rounds).where(eq(rounds.number, TEST_ROUND));
    await db.delete(teams).where(like(teams.name, `${TEST_PREFIX}%`));
  });

  it('приема прогноза 61 минути преди началото', async () => {
    const matchId = await makeMatch(61);
    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(true);

    const saved = await db
      .select()
      .from(predictions)
      .where(and(eq(predictions.userId, userId), eq(predictions.matchId, matchId)));

    expect(saved[0]?.ftHome).toBe(2);
  });

  it('позволява промяна, докато прозорецът е отворен', async () => {
    const matchId = await makeMatch(120);

    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(true);
    expect(
      await savePredictionIfOpen(userId, matchId, { ht: { home: 0, away: 0 }, ft: { home: 3, away: 3 } }),
    ).toBe(true);

    const saved = await db
      .select()
      .from(predictions)
      .where(and(eq(predictions.userId, userId), eq(predictions.matchId, matchId)));

    expect(saved).toHaveLength(1);
    expect(saved[0]?.ftHome).toBe(3);
    expect(saved[0]?.ftAway).toBe(3);
  });

  it('отказва 59 минути преди началото', async () => {
    const matchId = await makeMatch(59);
    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(false);

    const saved = await db.select().from(predictions).where(eq(predictions.matchId, matchId));
    expect(saved).toHaveLength(0);
  });

  it('отказва след началото', async () => {
    const matchId = await makeMatch(-30);
    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(false);
  });

  it('не позволява промяна на вече заключена прогноза', async () => {
    const matchId = await makeMatch(120);
    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(true);

    // мачът се мести напред, прозорецът се затваря
    await db
      .update(matches)
      .set({ kickoffAt: new Date(Date.now() + 10 * 60_000) })
      .where(eq(matches.id, matchId));

    expect(
      await savePredictionIfOpen(userId, matchId, { ht: { home: 5, away: 5 }, ft: { home: 5, away: 5 } }),
    ).toBe(false);

    const saved = await db.select().from(predictions).where(eq(predictions.matchId, matchId));
    expect(saved[0]?.ftHome).toBe(2);
  });

  it('отказва за отложен мач', async () => {
    const matchId = await makeMatch(500, 'postponed');
    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(false);
  });

  it('отказва за изигран мач', async () => {
    const matchId = await makeMatch(500, 'finished');
    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(false);
  });

  it('приема след срока, когато админът е отворил мача', async () => {
    const matchId = await makeMatch(10);
    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(false);

    await db.update(matches).set({ predictionWindow: 'open' }).where(eq(matches.id, matchId));

    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(true);
  });

  it('отказва преди срока, когато админът е заключил мача', async () => {
    const matchId = await makeMatch(600);
    await db.update(matches).set({ predictionWindow: 'locked' }).where(eq(matches.id, matchId));

    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(false);
  });

  it('не отваря изигран мач дори ръчно', async () => {
    const matchId = await makeMatch(-600, 'finished');
    await db.update(matches).set({ predictionWindow: 'open' }).where(eq(matches.id, matchId));

    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(false);
  });

  it('отваря отложен мач, когато админът каже', async () => {
    const matchId = await makeMatch(600, 'postponed');
    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(false);

    await db.update(matches).set({ predictionWindow: 'open' }).where(eq(matches.id, matchId));

    expect(await savePredictionIfOpen(userId, matchId, prediction)).toBe(true);
  });

  it('отказва за несъществуващ мач', async () => {
    expect(await savePredictionIfOpen(userId, 2_000_000_000, prediction)).toBe(false);
  });
});
