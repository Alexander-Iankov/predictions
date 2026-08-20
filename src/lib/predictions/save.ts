import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { LOCK_MINUTES } from '@/lib/lock';
import type { Prediction } from '@/lib/scoring';

/**
 * Записва прогноза, ако прозорецът е отворен. Връща false, ако е затворен.
 *
 * Проверката за час е част от SELECT-а, който подава реда за вкарване, и ползва
 * времето на базата. Затова няма пролука между "проверих" и "записах", и няма
 * значение дали часовникът на приложението е малко напред спрямо базата.
 *
 * Ако SELECT-ът не върне ред (мачът не съществува, не е "scheduled" или срокът е
 * минал), ON CONFLICT изобщо не се стига — нищо не се променя.
 */
export async function savePredictionIfOpen(
  userId: string,
  matchId: number,
  prediction: Prediction,
): Promise<boolean> {
  const result = await db.execute(sql`
    insert into predictions (user_id, match_id, ht_home, ht_away, ft_home, ft_away)
    select ${userId}::uuid,
           m.id,
           ${prediction.ht.home},
           ${prediction.ht.away},
           ${prediction.ft.home},
           ${prediction.ft.away}
      from matches m
     where m.id = ${matchId}
       and m.status = 'scheduled'
       and m.kickoff_at - make_interval(mins => ${LOCK_MINUTES}) > now()
    on conflict (user_id, match_id) do update
       set ht_home = excluded.ht_home,
           ht_away = excluded.ht_away,
           ft_home = excluded.ft_home,
           ft_away = excluded.ft_away,
           updated_at = now()
     returning id
  `);

  return result.rows.length > 0;
}
