import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { scrapeRuns } from '@/db/schema';
import { importSchedule, type ImportStats } from '@/lib/scraper/import';
import { fetchSchedulePage } from '@/lib/scraper/fetch';
import { parseSchedule, scheduleFingerprint } from '@/lib/scraper/parse';

export type RefreshOptions = {
  trigger: 'cron' | 'admin';
  userId?: string;
  /** Обнови дори ако страницата не се е променила от последния успешен път. */
  force?: boolean;
};

export type RefreshResult =
  | { ok: true; runId: number; stats: ImportStats; skipped: false }
  | { ok: true; runId: number; skipped: true; reason: string }
  | { ok: false; runId: number | null; error: string };

/** Колко време един започнал, но незавършил обход се смята за още течащ. */
const RUNNING_GRACE_MINUTES = 10;

/**
 * Дърпа графика от източника, обновява базата и записва какво е станало.
 *
 * Единствената входна точка за обновяване — ползва се и от cron-а, и от бутона
 * в админ панела, за да няма два различни пътя с различно поведение.
 */
export async function refreshSchedule(options: RefreshOptions): Promise<RefreshResult> {
  const active = await db
    .select({ id: scrapeRuns.id })
    .from(scrapeRuns)
    .where(
      and(
        eq(scrapeRuns.status, 'running'),
        gt(scrapeRuns.startedAt, new Date(Date.now() - RUNNING_GRACE_MINUTES * 60_000)),
      ),
    )
    .limit(1);

  if (active[0]) {
    return {
      ok: true,
      runId: active[0].id,
      skipped: true,
      reason: 'В момента вече върви обновяване.',
    };
  }

  const inserted = await db
    .insert(scrapeRuns)
    .values({
      trigger: options.trigger,
      triggeredByUserId: options.userId ?? null,
      status: 'running',
    })
    .returning({ id: scrapeRuns.id });

  const runId = inserted[0]?.id;
  if (runId === undefined) {
    return { ok: false, runId: null, error: 'Не може да се създаде запис за обновяването.' };
  }

  try {
    const parsed = parseSchedule(await fetchSchedulePage());
    const fingerprint = scheduleFingerprint(parsed);

    const lastSuccess = await db
      .select({ contentSha256: scrapeRuns.contentSha256 })
      .from(scrapeRuns)
      .where(eq(scrapeRuns.status, 'success'))
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(1);

    // Ако графикът е същият като при последния успешен обход, няма какво да се
    // промени. Проверката е спрямо последен *успешен*, за да не остане базата
    // недовършена, ако предишният път е паднал по средата.
    if (!options.force && lastSuccess[0]?.contentSha256 === fingerprint) {
      await db
        .update(scrapeRuns)
        .set({
          status: 'success',
          finishedAt: new Date(),
          contentSha256: fingerprint,
          matchesSeen: parsed.reduce((n, round) => n + round.matches.length, 0),
        })
        .where(eq(scrapeRuns.id, runId));

      return {
        ok: true,
        runId,
        skipped: true,
        reason: 'Графикът в източника не се е променил от последното обновяване.',
      };
    }

    const stats = await importSchedule(parsed);

    await db
      .update(scrapeRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        contentSha256: fingerprint,
        matchesSeen: stats.matchesSeen,
        matchesUpdated: stats.matchesUpdated,
        predictionsScored: stats.predictionsScored,
        error: stats.conflicts.length > 0 ? formatConflicts(stats) : null,
      })
      .where(eq(scrapeRuns.id, runId));

    return { ok: true, runId, stats, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db
      .update(scrapeRuns)
      .set({ status: 'error', finishedAt: new Date(), error: message })
      .where(eq(scrapeRuns.id, runId));

    return { ok: false, runId, error: message };
  }
}

function formatConflicts(stats: ImportStats): string {
  const lines = stats.conflicts.map(
    (c) => `${c.homeTeam} - ${c.awayTeam}: ${c.field} ръчно ${c.manual}, източник ${c.source}`,
  );
  return `Разминаване с ръчно въведени резултати:\n${lines.join('\n')}`;
}

/** Последните обходи — за админ панела. */
export async function recentRuns(limit = 20) {
  return db
    .select()
    .from(scrapeRuns)
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(limit);
}

/** Кога последно е успяло обновяване — показва се в UI-а. */
export async function lastSuccessfulRun() {
  const rows = await db
    .select({ finishedAt: scrapeRuns.finishedAt })
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.status, 'success'), sql`${scrapeRuns.finishedAt} is not null`))
    .orderBy(desc(scrapeRuns.finishedAt))
    .limit(1);

  return rows[0]?.finishedAt ?? null;
}
