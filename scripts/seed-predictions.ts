/**
 * Тестови прогнози за вече изиграните мачове, за да има какво да се гледа в
 * класирането и в детайлите на мач.
 *
 *   npm run seed:predictions
 *
 * Пише директно в базата и умишлено заобикаля заключването — това е фикстура за
 * разработка, не пътят, по който минава истинска прогноза. Отказва в продукция.
 */
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { matches, predictions, users } from '@/db/schema';
import { scoreMatch } from '@/lib/score-match';

if (process.env.NODE_ENV === 'production') {
  console.error('seed:predictions не се пуска в продукция.');
  process.exit(1);
}

const active = await db
  .select({ id: users.id, firstName: users.firstName })
  .from(users)
  .where(eq(users.status, 'active'));

const played = await db
  .select({
    id: matches.id,
    ftHome: matches.ftHome,
    ftAway: matches.ftAway,
    htHome: matches.htHome,
    htAway: matches.htAway,
  })
  .from(matches)
  .where(isNotNull(matches.ftHome));

console.log(`${active.length} активни профила, ${played.length} изиграни мача.`);

/**
 * Различна степен на "познаване" за всеки участник, за да не са всички точки
 * еднакви: първият познава точно, вторият бърка с един гол, третият по-грубо.
 */
const skew = [0, 1, 2];

for (const [index, person] of active.entries()) {
  const offset = skew[index % skew.length] ?? 0;

  for (const match of played) {
    const ftHome = Math.max(0, (match.ftHome ?? 0) - offset);
    const ftAway = match.ftAway ?? 0;
    const htHome = Math.min(match.htHome ?? 0, ftHome);
    const htAway = Math.min(match.htAway ?? 0, ftAway);

    await db
      .insert(predictions)
      .values({ userId: person.id, matchId: match.id, htHome, htAway, ftHome, ftAway })
      .onConflictDoUpdate({
        target: [predictions.userId, predictions.matchId],
        set: { htHome, htAway, ftHome, ftAway, updatedAt: new Date() },
      });
  }

  console.log(`  ${person.firstName}: ${played.length} прогнози (отклонение ${offset})`);
}

let scored = 0;
for (const match of played) {
  scored += await scoreMatch(match.id);
}

console.log(`Точкувани ${scored} прогнози.`);
process.exit(0);
