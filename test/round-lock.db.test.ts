/**
 * Обхватът на обновяването от източника.
 *
 * Две правила се пазят тук: замразеният кръг не се пипа изобщо, а резултатите
 * не се внасят никога — те са ръчни.
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

  const ORIGINAL_KICKOFF = new Date('2026-09-01T07:00:00.000Z');
  const MOVED_KICKOFF = new Date('2026-09-02T12:30:00.000Z');

  const parsedMatch = (
    kickoffAt: Date,
    ft: { home: number; away: number } | null,
  ): ParsedMatch => ({
    roundNumber: ROUND,
    homeTeam: `${PREFIX} А`,
    awayTeam: `${PREFIX} Б`,
    homeTeamSourceId: null,
    awayTeamSourceId: null,
    homeTeamUrl: null,
    awayTeamUrl: null,
    kickoffAt,
    timeKnown: true,
    ft,
    ht: null,
    rawResult: ft ? `${ft.home}:${ft.away}` : '-',
  });

  const schedule = (
    kickoffAt: Date,
    ft: { home: number; away: number } | null = null,
  ): ParsedRound[] => [
    { number: ROUND, label: 'заключен кръг', matches: [parsedMatch(kickoffAt, ft)] },
  ];

  const currentMatch = async () => {
    const rows = await db
      .select({
        id: matches.id,
        ftHome: matches.ftHome,
        ftAway: matches.ftAway,
        status: matches.status,
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
    await importSchedule(schedule(ORIGINAL_KICKOFF));
  });

  afterAll(cleanup);

  it('мести часа, докато кръгът не е заключен', async () => {
    const stats = await importSchedule(schedule(MOVED_KICKOFF));

    expect(stats.matchesSkipped).toBe(0);
    expect(stats.matchesUpdated).toBe(1);

    const match = await currentMatch();
    expect(match?.kickoffAt.toISOString()).toBe(MOVED_KICKOFF.toISOString());
  });

  it('не мести часа, когато кръгът е заключен', async () => {
    await setLocked(true);

    const stats = await importSchedule(schedule(MOVED_KICKOFF));

    expect(stats.matchesSkipped).toBe(1);
    expect(stats.matchesUpdated).toBe(0);

    const match = await currentMatch();
    expect(match?.kickoffAt.toISOString()).toBe(ORIGINAL_KICKOFF.toISOString());
  });

  /*
   * Резултатите са ръчни. Ако това правило се счупи, обновяването ще презаписва
   * вече точкувани мачове и класирането ще се мени само — точно заради това
   * поведение беше сменено.
   */
  it('не внася резултат от източника, дори кръгът да е отключен', async () => {
    await importSchedule(schedule(ORIGINAL_KICKOFF, { home: 2, away: 1 }));

    const match = await currentMatch();
    expect(match?.ftHome).toBeNull();
    expect(match?.ftAway).toBeNull();
    expect(match?.status).toBe('scheduled');
  });

  it('не изтрива ръчно въведен резултат при следващо обновяване', async () => {
    const before = await currentMatch();

    await db
      .update(matches)
      .set({ ftHome: 3, ftAway: 0, status: 'finished', ftSource: 'manual' })
      .where(eq(matches.id, before!.id));

    // Източникът показва друго — не бива да надделее.
    await importSchedule(schedule(MOVED_KICKOFF, { home: 1, away: 1 }));

    const after = await currentMatch();
    expect(`${after?.ftHome}:${after?.ftAway}`).toBe('3:0');
    expect(after?.status).toBe('finished');
  });

  /*
   * Изиграният мач замръзва и за програмата. Източникът пренарежда страницата си
   * и понякога подава друг час за минал мач; местенето би подменило кога всъщност
   * се е играло, а с това и кога прогнозите са се заключили.
   */
  it('не мести часа на мач, който вече има резултат', async () => {
    const before = await currentMatch();
    await db
      .update(matches)
      .set({ ftHome: 1, ftAway: 0, status: 'finished', ftSource: 'manual' })
      .where(eq(matches.id, before!.id));

    const stats = await importSchedule(schedule(MOVED_KICKOFF));

    expect(stats.matchesPlayed).toBe(1);
    expect(stats.matchesUpdated).toBe(0);
    expect((await currentMatch())?.kickoffAt.toISOString()).toBe(ORIGINAL_KICKOFF.toISOString());
  });

  it('замразява и мач с резултат, но забравен статус', async () => {
    const before = await currentMatch();
    await db
      .update(matches)
      .set({ ftHome: 1, ftAway: 0, ftSource: 'manual' })
      .where(eq(matches.id, before!.id));

    await importSchedule(schedule(MOVED_KICKOFF));

    expect((await currentMatch())?.kickoffAt.toISOString()).toBe(ORIGINAL_KICKOFF.toISOString());
  });

  it('мести часа, докато мачът още няма резултат', async () => {
    const stats = await importSchedule(schedule(MOVED_KICKOFF));

    expect(stats.matchesPlayed).toBe(0);
    expect(stats.matchesUpdated).toBe(1);
    expect((await currentMatch())?.kickoffAt.toISOString()).toBe(MOVED_KICKOFF.toISOString());
  });

  it('мести часа отново, след като кръгът се отключи', async () => {
    await setLocked(true);
    await importSchedule(schedule(MOVED_KICKOFF));
    expect((await currentMatch())?.kickoffAt.toISOString()).toBe(ORIGINAL_KICKOFF.toISOString());

    await setLocked(false);
    await importSchedule(schedule(MOVED_KICKOFF));
    expect((await currentMatch())?.kickoffAt.toISOString()).toBe(MOVED_KICKOFF.toISOString());
  });

  it('не изчиства ръчно въведено полувреме, което източникът не дава', async () => {
    const match = await currentMatch();
    await db
      .update(matches)
      .set({ ftHome: 2, ftAway: 1, htHome: 1, htAway: 0, htSource: 'manual' })
      .where(eq(matches.id, match!.id));

    // Източникът дава краен резултат, но без полувреме — преди това изтриваше
    // въведеното. Сега не пипа нищо.
    await importSchedule(schedule(ORIGINAL_KICKOFF, { home: 2, away: 1 }));

    const rows = await db
      .select({ htHome: matches.htHome, htSource: matches.htSource })
      .from(matches)
      .where(eq(matches.id, match!.id));

    expect(rows[0]?.htHome).toBe(1);
    expect(rows[0]?.htSource).toBe('manual');
  });

  it('пази ръчно въведеното, когато кръгът е заключен', async () => {
    const match = await currentMatch();
    await db
      .update(matches)
      .set({ ftHome: 7, ftAway: 7, ftSource: 'manual', htHome: 3, htAway: 3, htSource: 'manual' })
      .where(eq(matches.id, match!.id));

    await setLocked(true);
    await importSchedule(schedule(MOVED_KICKOFF, { home: 2, away: 1 }));

    const rows = await db
      .select({ ftHome: matches.ftHome, htHome: matches.htHome })
      .from(matches)
      .where(eq(matches.id, match!.id));

    expect(rows[0]?.ftHome).toBe(7);
    expect(rows[0]?.htHome).toBe(3);
  });

  it('пренася суровия резултат като подсказка, без да го прилага', async () => {
    await importSchedule(schedule(ORIGINAL_KICKOFF, { home: 4, away: 2 }));

    const rows = await db
      .select({ rawResult: matches.rawResult, ftHome: matches.ftHome })
      .from(matches)
      .innerJoin(rounds, eq(rounds.id, matches.roundId))
      .where(eq(rounds.number, ROUND));

    expect(rows[0]?.rawResult).toBe('4:2');
    expect(rows[0]?.ftHome).toBeNull();
  });

  it('заключването не се маха от източника', async () => {
    await setLocked(true);
    await importSchedule(schedule(ORIGINAL_KICKOFF));

    const round = await db
      .select({ locked: rounds.lockedForUpdates })
      .from(rounds)
      .where(eq(rounds.number, ROUND));

    expect(round[0]?.locked).toBe(true);
  });
});
