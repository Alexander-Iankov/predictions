import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { matches, predictionScores, predictions } from '@/db/schema';
import { scorePrediction, type ActualResult } from '@/lib/scoring';

/**
 * Точкува (или преизчислява) всички прогнози за един мач.
 *
 * Извиква се след всяко обновяване от източника и след ръчно въвеждане на
 * полувреме от админа. Идемпотентна е: същият резултат дава същите точки, а
 * оттеглен резултат изтрива точките.
 */
export async function scoreMatch(matchId: number): Promise<number> {
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match) return 0;

  const rows = await db
    .select({
      id: predictions.id,
      htHome: predictions.htHome,
      htAway: predictions.htAway,
      ftHome: predictions.ftHome,
      ftAway: predictions.ftAway,
    })
    .from(predictions)
    .where(eq(predictions.matchId, matchId));

  // Мачът още не е изигран (или резултатът е оттеглен) — няма какво да се точкува.
  if (match.ftHome === null || match.ftAway === null) {
    if (rows.length > 0) {
      await db.delete(predictionScores).where(
        inArray(
          predictionScores.predictionId,
          rows.map((r) => r.id),
        ),
      );
    }
    await db.update(matches).set({ scoredAt: null }).where(eq(matches.id, matchId));
    return 0;
  }

  const actual: ActualResult = {
    ft: { home: match.ftHome, away: match.ftAway },
    ht:
      match.htHome === null || match.htAway === null
        ? null
        : { home: match.htHome, away: match.htAway },
  };

  for (const row of rows) {
    const { points, breakdown, partial } = scorePrediction(
      {
        ht: { home: row.htHome, away: row.htAway },
        ft: { home: row.ftHome, away: row.ftAway },
      },
      actual,
    );

    await db
      .insert(predictionScores)
      .values({ predictionId: row.id, points, breakdown, partial })
      .onConflictDoUpdate({
        target: predictionScores.predictionId,
        set: { points, breakdown, partial, computedAt: new Date() },
      });
  }

  await db.update(matches).set({ scoredAt: new Date() }).where(eq(matches.id, matchId));

  return rows.length;
}
