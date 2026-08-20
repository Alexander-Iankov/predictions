'use server';

import { createHash, randomBytes } from 'node:crypto';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import { passwordResets, users } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  createSession,
  currentUser,
  destroyCurrentSession,
  destroyUserSessions,
} from '@/lib/auth/session';
import { appUrl, sendMail } from '@/lib/email/send';

export type AuthState = {
  error?: string;
  ok?: boolean;
};

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Имейлът не изглежда валиден.'));

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} трябва да е поне 2 знака.`)
    .max(50, `${label} е твърде дълго.`);

const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(8, 'Паролата трябва да е поне 8 знака.')
    .max(200, 'Паролата е твърде дълга.'),
  firstName: name('Името'),
  lastName: name('Фамилията'),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Въведи парола.'),
});

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Данните не са валидни.';
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
  });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (existing[0]) {
    return { error: 'Вече има профил с този имейл.' };
  }

  await db.insert(users).values({
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    // Всеки нов профил чака админът да го одобри.
    status: 'pending',
  });

  return { ok: true };
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const rows = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      status: users.status,
    })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  const user = rows[0];

  // Проверката се прави и когато няма такъв профил, за да не се познава по
  // времето за отговор кои имейли съществуват.
  const valid = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : await verifyPassword(parsed.data.password, DUMMY_HASH);

  if (!user || !valid) {
    return { error: 'Грешен имейл или парола.' };
  }

  if (user.status === 'pending') {
    return { error: 'Профилът още чака одобрение от админ.' };
  }

  if (user.status === 'blocked') {
    return { error: 'Профилът е блокиран.' };
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);

  redirect('/matches');
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect('/');
}

/**
 * Смяна на парола от самия потребител.
 *
 * Иска и текущата парола: сесията може да е оставена отворена на чуждо
 * устройство, а знанието на старата парола е това, което отличава собственика.
 *
 * След смяната всички сесии падат и веднага се отваря нова за текущия браузър —
 * така другите устройства излизат, но този тук не се изхвърля.
 */
export async function changePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const user = await currentUser();
  if (!user || user.status !== 'active') {
    return { error: 'Нужен е активен профил.' };
  }

  const parsed = z
    .object({
      currentPassword: z.string().min(1, 'Въведи текущата парола.'),
      password: z
        .string()
        .min(8, 'Новата парола трябва да е поне 8 знака.')
        .max(200, 'Паролата е твърде дълга.'),
    })
    .safeParse({
      currentPassword: formData.get('currentPassword'),
      password: formData.get('password'),
    });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const stored = rows[0];
  if (!stored) return { error: 'Профилът не е намерен.' };

  if (!(await verifyPassword(parsed.data.currentPassword, stored.passwordHash))) {
    return { error: 'Текущата парола е грешна.' };
  }

  if (await verifyPassword(parsed.data.password, stored.passwordHash)) {
    return { error: 'Новата парола е същата като старата.' };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, user.id));

  await destroyUserSessions(user.id);
  await createSession(user.id);

  return { ok: true };
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Линкът, поискан от самия потребител, живее кратко. */
const SELF_RESET_MINUTES = 60;

/** Повече от толкова заявки на час означава, че някой залива чужда поща. */
const MAX_RESETS_PER_HOUR = 3;

/**
 * „Забравена парола" — изпраща линк на имейла.
 *
 * Отговорът е един и същ независимо дали такъв профил съществува: иначе
 * страницата се превръща в справочник кой е регистриран.
 */
export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = email.safeParse(formData.get('email'));

  // И при невалиден имейл отговорът е същият, за да не се различават случаите.
  if (parsed.success) {
    await issueResetLink(parsed.data);
  }

  return { ok: true };
}

async function issueResetLink(address: string): Promise<void> {
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, status: users.status })
    .from(users)
    .where(eq(users.email, address))
    .limit(1);

  const user = rows[0];

  // Няма такъв профил или е блокиран — нищо не се изпраща, но отвън изглежда
  // както при успех.
  if (!user || user.status === 'blocked') return;

  const recent = await db
    .select({ total: count() })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.userId, user.id),
        gt(passwordResets.createdAt, new Date(Date.now() - 60 * 60_000)),
      ),
    );

  if ((recent[0]?.total ?? 0) >= MAX_RESETS_PER_HOUR) return;

  // Старите неизползвани линкове падат — иначе всеки досегашен имейл остава
  // валиден ключ към профила.
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));

  const token = randomBytes(32).toString('base64url');

  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + SELF_RESET_MINUTES * 60_000),
  });

  const link = `${appUrl()}/reset/${token}`;

  await sendMail({
    to: address,
    subject: 'Нова парола за Прогнози U-17',
    text: [
      `Здравей, ${user.firstName}!`,
      '',
      'Някой поиска нова парола за профила ти в Прогнози U-17.',
      'Отвори този линк, за да зададеш нова:',
      '',
      link,
      '',
      `Линкът е валиден ${SELF_RESET_MINUTES} минути и може да се използва само веднъж.`,
      'Ако не си ти, просто изтрий това писмо — паролата ти остава същата.',
    ].join('\n'),
    html: [
      `<p>Здравей, ${escapeHtml(user.firstName)}!</p>`,
      '<p>Някой поиска нова парола за профила ти в Прогнози U-17.</p>',
      `<p><a href="${link}">Задай нова парола</a></p>`,
      `<p style="color:#6b7688;font-size:13px">Линкът е валиден ${SELF_RESET_MINUTES} минути и може да се използва само веднъж. Ако не си ти, просто изтрий това писмо — паролата ти остава същата.</p>`,
    ].join('\n'),
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Валиден ли е линкът за смяна на парола (без да го изразходва). */
export async function isResetTokenValid(token: string): Promise<boolean> {
  const rows = await db
    .select({ id: passwordResets.id })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, hashResetToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Смяна на парола по еднократен линк, издаден от админа.
 *
 * След смяната всички сесии на профила падат — ако линкът е бил нужен, защото
 * някой чужд е влязъл, той трябва да бъде изхвърлен.
 */
export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z
    .object({
      token: z.string().min(10),
      password: z
        .string()
        .min(8, 'Паролата трябва да е поне 8 знака.')
        .max(200, 'Паролата е твърде дълга.'),
    })
    .safeParse({ token: formData.get('token'), password: formData.get('password') });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const rows = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, hashResetToken(parsed.data.token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const reset = rows[0];
  if (!reset) {
    return { error: 'Линкът е изтекъл или вече е използван. Поискай нов от „Забравена парола".' };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, reset.userId));

  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(eq(passwordResets.id, reset.id));

  await destroyUserSessions(reset.userId);

  return { ok: true };
}

/**
 * Хеш на случайна парола, срещу който се проверява при непознат имейл. Стойността
 * е без значение — важното е, че сравнението отнема същото време.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'ZAtiIvSU4vwaBRLM7uEqQvDdc1p1gG6Xer3o0Ck5DiTGDLnpJmYnUxL5uUlUwqjE7hLSY9OhBcSTJcuJ7pRoUw==';
