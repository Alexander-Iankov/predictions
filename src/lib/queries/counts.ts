import { count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { predictions } from '@/db/schema';

/**
 * Броячи на прогнози, взети с отделна групираща заявка.
 *
 * Умишлено НЕ се пише като корелирана подзаявка в select списъка: там drizzle
 * рендира `${matches.id}` без име на таблица, а Postgres резолвва неквалифицирано
 * "id" към колоната на подзаявката. Резултатът е заявка, която не гърми, но
 * връща една и съща константа за всички редове. Таблиците тук са малки, затова
 * една отделна заявка е и по-ясна, и по-безопасна.
 */

export async function predictionCountsByMatch(): Promise<Map<number, number>> {
  const rows = await db
    .select({ matchId: predictions.matchId, total: count() })
    .from(predictions)
    .groupBy(predictions.matchId);

  return new Map(rows.map((row) => [row.matchId, row.total]));
}

export async function predictionCountsByUser(): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: predictions.userId, total: count() })
    .from(predictions)
    .groupBy(predictions.userId);

  return new Map(rows.map((row) => [row.userId, row.total]));
}

/** Броят прогнози за един мач — за страницата на конкретен мач. */
export async function predictionCountForMatch(matchId: number): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(predictions)
    .where(eq(predictions.matchId, matchId));

  return rows[0]?.total ?? 0;
}
