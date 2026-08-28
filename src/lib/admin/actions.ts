'use server';

import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { matches, passwordResets, rounds, users } from '@/db/schema';
import { requireAdminForAction } from '@/lib/auth/guards';
import { destroyUserSessions } from '@/lib/auth/session';
import { audit } from '@/lib/admin/audit';
import { refreshSchedule } from '@/lib/refresh';
import { scoreMatch } from '@/lib/score-match';
import { formatSofiaDateTime, parseSofiaInputValue } from '@/lib/time';

export type AdminState = {
  error?: string;
  message?: string;
};

const uuid = z.uuid('Невалиден профил.');

/** Одобряване, блокиране или връщане на профил в чакащи. */
export async function setUserStatusAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdminForAction();

  const parsed = z
    .object({
      userId: uuid,
      status: z.enum(['pending', 'active', 'blocked']),
    })
    .safeParse({ userId: formData.get('userId'), status: formData.get('status') });

  if (!parsed.success) return { error: 'Невалидни данни.' };

  const { userId, status } = parsed.data;

  if (userId === admin.id) {
    return { error: 'Не можеш да смениш статуса на собствения си профил.' };
  }

  const before = await db
    .select({ status: users.status, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!before[0]) return { error: 'Профилът не е намерен.' };

  await db.update(users).set({ status }).where(eq(users.id, userId));

  // Блокирането трябва да важи веднага, не след изтичане на cookie.
  if (status !== 'active') await destroyUserSessions(userId);

  await audit({
    actorUserId: admin.id,
    action: 'user.status',
    entity: `user:${userId}`,
    before: before[0],
    after: { status },
  });

  revalidatePath('/admin');

  const labels = { pending: 'чакащ', active: 'активен', blocked: 'блокиран' };
  return { message: `${before[0].email} вече е ${labels[status]}.` };
}

/** Дава или отнема админски права. */
export async function setUserRoleAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdminForAction();

  const parsed = z
    .object({ userId: uuid, role: z.enum(['user', 'admin']) })
    .safeParse({ userId: formData.get('userId'), role: formData.get('role') });

  if (!parsed.success) return { error: 'Невалидни данни.' };
  if (parsed.data.userId === admin.id) {
    return { error: 'Не можеш да си отнемеш собствените права.' };
  }

  await db.update(users).set({ role: parsed.data.role }).where(eq(users.id, parsed.data.userId));

  await audit({
    actorUserId: admin.id,
    action: 'user.role',
    entity: `user:${parsed.data.userId}`,
    after: { role: parsed.data.role },
  });

  revalidatePath('/admin');
  return { message: 'Правата са сменени.' };
}

const RESET_HOURS = 24;

/**
 * Еднократен линк за смяна на парола.
 *
 * В v1 няма изпращане на имейли — админът копира линка и го дава на човека.
 */
export async function createResetLinkAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdminForAction();

  const parsed = uuid.safeParse(formData.get('userId'));
  if (!parsed.success) return { error: 'Невалиден профил.' };

  const token = randomBytes(32).toString('base64url');

  await db.insert(passwordResets).values({
    userId: parsed.data,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + RESET_HOURS * 60 * 60 * 1000),
  });

  await audit({
    actorUserId: admin.id,
    action: 'user.reset_link',
    entity: `user:${parsed.data}`,
  });

  return {
    message: `Линк (валиден ${RESET_HOURS} ч, за еднократна употреба): /reset/${token}`,
  };
}

/** Бутонът „Обнови от източника". */
export async function refreshAction(_prev: AdminState): Promise<AdminState> {
  const admin = await requireAdminForAction();

  const result = await refreshSchedule({ trigger: 'admin', userId: admin.id });

  revalidatePath('/admin');
  revalidatePath('/matches');
  revalidatePath('/leaderboard');

  if (!result.ok) return { error: `Обновяването се провали: ${result.error}` };
  if (result.skipped) return { message: result.reason };

  const parts = [
    `видени ${result.stats.matchesSeen}`,
    `променени ${result.stats.matchesUpdated}`,
    `точкувани прогнози ${result.stats.predictionsScored}`,
  ];

  if (result.stats.matchesSkipped > 0) {
    parts.push(`прескочени ${result.stats.matchesSkipped} от заключени кръгове`);
  }

  return { message: `Готово: ${parts.join(', ')}.` };
}

/**
 * Замразява или размразява кръг за обновяване от източника.
 *
 * Полезно, когато резултатите в кръга са уточнени ръчно и източникът не бива да
 * ги връща назад. Заключва само вече съществуващите мачове — нов мач в кръга ще
 * бъде създаден, иначе заключването би скрило мач, който никой не е виждал.
 */
export async function setRoundLockAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdminForAction();

  const parsed = z
    .object({
      roundNumber: z.coerce.number().int().positive(),
      locked: z.enum(['0', '1']),
    })
    .safeParse({
      roundNumber: formData.get('roundNumber'),
      locked: formData.get('locked') === '1' ? '1' : '0',
    });

  if (!parsed.success) return { error: 'Невалидни данни.' };

  const locked = parsed.data.locked === '1';

  const updated = await db
    .update(rounds)
    .set({ lockedForUpdates: locked })
    .where(eq(rounds.number, parsed.data.roundNumber))
    .returning({ label: rounds.label });

  if (!updated[0]) return { error: 'Кръгът не е намерен.' };

  await audit({
    actorUserId: admin.id,
    action: 'round.lock',
    entity: `round:${parsed.data.roundNumber}`,
    after: { lockedForUpdates: locked },
  });

  revalidateAdminPaths();

  return {
    message: locked
      ? `${updated[0].label} е замразен — обновяването няма да го пипа.`
      : `${updated[0].label} отново се обновява от източника.`,
  };
}

/**
 * Ръчно отваряне или заключване на прозореца за прогнози на един мач.
 *
 * Полезно, когато мач е преместен в последния момент или прогнозите трябва да
 * спрат по-рано.
 *
 * Отварянето на вече заключен мач автоматично СКРИВА прогнозите обратно (виж
 * isRevealed в lock.ts) — иначе този, за когото е отворено, би преписал чуждите.
 */
export async function setPredictionWindowAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdminForAction();

  const parsed = z
    .object({
      matchId: z.coerce.number().int().positive(),
      window: z.enum(['auto', 'open', 'locked']),
    })
    .safeParse({ matchId: formData.get('matchId'), window: formData.get('window') });

  if (!parsed.success) return { error: 'Невалидни данни.' };

  const { matchId, window } = parsed.data;

  const rows = await db
    .select({ status: matches.status, predictionWindow: matches.predictionWindow })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  const before = rows[0];
  if (!before) return { error: 'Мачът не е намерен.' };

  if (window === 'open' && before.status === 'finished') {
    return { error: 'Изигран мач не се отваря — прогнозата би се писала след резултата.' };
  }

  await db
    .update(matches)
    .set({ predictionWindow: window, updatedAt: new Date() })
    .where(eq(matches.id, matchId));

  await audit({
    actorUserId: admin.id,
    action: 'match.prediction_window',
    entity: `match:${matchId}`,
    before: { predictionWindow: before.predictionWindow },
    after: { predictionWindow: window },
  });

  revalidateAdminPaths();

  const messages = {
    auto: 'Прозорецът пак следва правилото — затваря 1 час преди началото.',
    open: 'Прозорецът е отворен ръчно. Прогнозите на всички са скрити, докато е така.',
    locked: 'Прозорецът е заключен ръчно. Прогнозите станаха видими.',
  };

  return { message: messages[window] };
}

/** Празно поле значи „изчисти", а не „нула". */
const optionalGoals = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .refine((value) => value === null || /^\d{1,2}$/.test(value), 'Головете трябва да са число.')
  .transform((value) => (value === null ? null : Number(value)));

/**
 * Пълна редакция на мач: начален час, полувреме, краен резултат и статус.
 *
 * Съществува заради тестването — с нея се нагласят мачове, за да се провери
 * заключването, отброяването и точкуването, без да се чака истински мач. Но е и
 * единственият начин да се въведе полувреме, което източникът не е публикувал.
 *
 * ВНИМАНИЕ: въведеното тук НЕ е защитено от обновяването. Източникът е истината
 * и следващият обход привежда часа и резултатите към него, включително изчиства
 * стойност, която източникът не дава. За да се запази ръчно въведеното, кръгът
 * трябва да се замрази (виж setRoundLockAction).
 */
export async function setMatchDetailsAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdminForAction();

  const parsed = z
    .object({
      matchId: z.coerce.number().int().positive(),
      kickoff: z.string().trim().min(1, 'Трябва начален час.'),
      timeKnown: z.enum(['0', '1']),
      htHome: optionalGoals,
      htAway: optionalGoals,
      ftHome: optionalGoals,
      ftAway: optionalGoals,
      status: z.enum(['scheduled', 'finished', 'postponed']),
    })
    .safeParse({
      matchId: formData.get('matchId'),
      kickoff: formData.get('kickoff'),
      timeKnown: formData.get('timeKnown') === '1' ? '1' : '0',
      htHome: formData.get('htHome'),
      htAway: formData.get('htAway'),
      ftHome: formData.get('ftHome'),
      ftAway: formData.get('ftAway'),
      status: formData.get('status'),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Невалидни данни.' };
  }

  const { matchId, kickoff, timeKnown, htHome, htAway, ftHome, ftAway, status } = parsed.data;

  if ((ftHome === null) !== (ftAway === null)) {
    return { error: 'Крайният резултат се въвежда и за двата отбора, или за никой.' };
  }

  if ((htHome === null) !== (htAway === null)) {
    return { error: 'Полувремето се въвежда и за двата отбора, или за никой.' };
  }

  const kickoffAt = parseSofiaInputValue(kickoff);
  if (!kickoffAt) return { error: 'Началният час не е четим.' };

  const rows = await db
    .select({
      kickoffAt: matches.kickoffAt,
      timeKnown: matches.timeKnown,
      status: matches.status,
      htHome: matches.htHome,
      htAway: matches.htAway,
      htSource: matches.htSource,
      ftHome: matches.ftHome,
      ftAway: matches.ftAway,
      ftSource: matches.ftSource,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  const before = rows[0];
  if (!before) return { error: 'Мачът не е намерен.' };

  const clearingFt = ftHome === null;

  // Резултат без полувреме е нормално — източникът често го дава така. Обратното
  // не е: полувреме без краен резултат не може да се точкува.
  if (clearingFt && htHome !== null) {
    return { error: 'Полувреме без краен резултат не може. Първо въведи крайния.' };
  }

  // Базата има същото ограничение; без тази проверка заявката би паднала с
  // неразбираемо съобщение от Postgres.
  if (!clearingFt && htHome !== null && htAway !== null) {
    if (htHome > ftHome || htAway > (ftAway ?? 0)) {
      return {
        error: `Полувремето ${htHome}:${htAway} не може да е повече от крайния резултат ${ftHome}:${ftAway}.`,
      };
    }
  }

  // Изчистването на крайния резултат отнася и полувремето със себе си.
  const nextHtHome = clearingFt ? null : htHome;
  const nextHtAway = clearingFt ? null : htAway;

  /**
   * „Ръчно" се маркира само това, което наистина е сменено.
   *
   * Формата подава всички полета наведнъж, затова редакция само на полувремето
   * иначе би обявила и крайния резултат за ръчен — и източникът повече нямаше да
   * го поправи, ако резултатът се промени след протест.
   */
  const ftChanged = ftHome !== before.ftHome || ftAway !== before.ftAway;
  const htChanged = nextHtHome !== before.htHome || nextHtAway !== before.htAway;

  await db
    .update(matches)
    .set({
      kickoffAt,
      timeKnown: timeKnown === '1',
      status,
      htHome: nextHtHome,
      htAway: nextHtAway,
      htSource: nextHtHome === null ? null : htChanged ? 'manual' : before.htSource,
      ftHome,
      ftAway,
      ftSource: clearingFt ? null : ftChanged ? 'manual' : before.ftSource,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, matchId));

  await audit({
    actorUserId: admin.id,
    action: 'match.details',
    entity: `match:${matchId}`,
    before,
    after: {
      kickoffAt,
      timeKnown: timeKnown === '1',
      status,
      htHome: nextHtHome,
      htAway: nextHtAway,
      ftHome,
      ftAway,
    },
  });

  const scored = await scoreMatch(matchId);
  revalidateAdminPaths();

  const parts = [`начало ${formatSofiaDateTime(kickoffAt)}`];

  if (clearingFt) {
    if (before.ftHome !== null) parts.push('резултатът е изчистен');
  } else {
    parts.push(
      nextHtHome === null
        ? `резултат ${ftHome}:${ftAway}, без полувреме`
        : `резултат ${ftHome}:${ftAway} (${nextHtHome}:${nextHtAway})`,
    );
  }

  if (scored > 0) parts.push(`преизчислени ${scored} прогнози`);

  return { message: `Записано: ${parts.join(', ')}.` };
}

function revalidateAdminPaths(): void {
  revalidatePath('/admin');
  revalidatePath('/admin/matches');
  revalidatePath('/matches');
  revalidatePath('/leaderboard');
  revalidatePath('/me');
}
