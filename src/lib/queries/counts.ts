import { and, count, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { predictions, users } from '@/db/schema';
import { isVisibleToSql } from '@/lib/visibility-sql';

/**
 * Броячи на прогнози, взети с отделна групираща заявка.
 *
 * Умишлено НЕ се пише като корелирана подзаявка в select списъка: там drizzle
 * рендира `${matches.id}` без име на таблица, а Postgres резолвва неквалифицирано
 * "id" към колоната на подзаявката. Резултатът е заявка, която не гърми, но
 * връща една и съща константа за всички редове. Таблиците тук са малки, затова
 * една отделна заявка е и по-ясна, и по-безопасна.
 */

/**
 * `viewerId` = null значи „брой всички", за админския изглед. Иначе скритите
 * профили отпадат, за да не обещава броячът редове, които списъкът няма да
 * покаже.
 */
export async function predictionCountsByMatch(
  viewerId: string | null,
): Promise<Map<number, number>> {
  const rows = await db
    .select({ matchId: predictions.matchId, total: count() })
    .from(predictions)
    .innerJoin(users, eq(users.id, predictions.userId))
    .where(visibleOnly(viewerId))
    .groupBy(predictions.matchId);

  return new Map(rows.map((row) => [row.matchId, row.total]));
}

function visibleOnly(viewerId: string | null): SQL | undefined {
  return viewerId === null ? undefined : isVisibleToSql(viewerId);
}

export async function predictionCountsByUser(): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: predictions.userId, total: count() })
    .from(predictions)
    .groupBy(predictions.userId);

  return new Map(rows.map((row) => [row.userId, row.total]));
}

/** Броят прогнози за един мач — за страницата на конкретен мач. */
export async function predictionCountForMatch(
  matchId: number,
  viewerId: string | null,
): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(predictions)
    .innerJoin(users, eq(users.id, predictions.userId))
    .where(and(eq(predictions.matchId, matchId), visibleOnly(viewerId)));

  return rows[0]?.total ?? 0;
}
