/**
 * Замразен кръг: обновяването от източника не пипа мачовете в него.
 *
 * Иска DATABASE_URL (docker compose up -d). Без него се пропуска.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ParsedMatch, ParsedRound } from '@/lib/scraper/parse';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('importSchedule при заключен кръг', async () => {
  const { db } = await import('@/db');
  const { matches, rounds, teams } = await import('@/db/schema');
  const { importSchedule } = await import('@/lib/scraper/import');

  const ROUND = 998;
  const PREFIX = 'ЗАКЛ ОТБОР';

  const parsedMatch = (ft: { home: number; away: number } | null): ParsedMatch => ({
    roundNumber: ROUND,
    homeTeam: `${PREFIX} А`,
    awayTeam: `${PREFIX} Б`,
    homeTeamSourceId: null,
    awayTeamSourceId: null,
    homeTeamUrl: null,
    awayTeamUrl: null,
    kickoffAt: new Date('2026-09-01T07:00:00.000Z'),
    timeKnown: true,
    ft,
    ht: null,
    rawResult: ft ? `${ft.home}:${ft.away}` : '-',
  });

  const schedule = (ft: { home: number; away: number } | null): ParsedRound[] => [
    { number: ROUND, label: 'заключен кръг', matches: [parsedMatch(ft)] },
  ];

  const currentMatch = async () => {
    const rows = await db
      .select({
        id: matches.id,
        ftHome: matches.ftHome,
        ftAway: matches.ftAway,
        kickoffAt: matches.kickoffAt,
      })
      .from(matches)
      .innerJoin(rounds, eq(rounds.id, matches.roundId))
      .where(eq(rounds.number, ROUND));

    return rows[0];
  };

  const setLocked = async (locked: boolean) => {
    await db.update(rounds).set({ lockedForUpdates: locked }).where(eq(rounds.number, ROUND));
  };

  const cleanup = async () => {
    const round = await db.select({ id: rounds.id }).from(rounds).where(eq(rounds.number, ROUND));
    if (round[0]) await db.delete(matches).where(eq(matches.roundId, round[0].id));
    await db.delete(rounds).where(eq(rounds.number, ROUND));
    await db.delete(teams).where(eq(teams.name, `${PREFIX} А`));
    await db.delete(teams).where(eq(teams.name, `${PREFIX} Б`));
  };

  beforeEach(async () => {
    await cleanup();
    // първо влизане: мачът се създава без резултат
    await importSchedule(schedule(null));
  });

  afterAll(cleanup);

  it('обновява мача, докато кръгът не е заключен', async () => {
    const stats = await importSchedule(schedule({ home: 2, away: 1 }));

    expect(stats.matchesSkipped).toBe(0);
    expect(stats.matchesUpdated).toBe(1);

    const match = await currentMatch();
    expect(`${match?.ftHome}:${match?.ftAway}`).toBe('2:1');
  });

  it('не пипа мача, когато кръгът е заключен', async () => {
    await setLocked(true);

    const stats = await importSchedule(schedule({ home: 2, away: 1 }));

    expect(stats.matchesSkipped).toBe(1);
    expect(stats.matchesUpdated).toBe(0);

    const match = await currentMatch();
    expect(match?.ftHome).toBeNull();
  });

  it('не пипа и часа на заключен кръг', async () => {
    await setLocked(true);

    const moved = schedule(null);
    moved[0]!.matches[0]!.kickoffAt = new Date('2026-09-02T10:00:00.000Z');

    await importSchedule(moved);

    const match = await currentMatch();
    expect(match?.kickoffAt.toISOString()).toBe('2026-09-01T07:00:00.000Z');
  });

  it('приема обновяване отново след отключване', async () => {
    await setLocked(true);
    await importSchedule(schedule({ home: 2, away: 1 }));
    expect((await currentMatch())?.ftHome).toBeNull();

    await setLocked(false);
    await importSchedule(schedule({ home: 2, away: 1 }));
    expect((await currentMatch())?.ftHome).toBe(2);
  });

  it('заключването не се маха от източника', async () => {
    await setLocked(true);
    await importSchedule(schedule(null));

    const round = await db
      .select({ locked: rounds.lockedForUpdates })
      .from(rounds)
      .where(eq(rounds.number, ROUND));

    expect(round[0]?.locked).toBe(true);
  });
});
