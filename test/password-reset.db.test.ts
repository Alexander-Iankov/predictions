/**
 * Потокът „забравена парола" срещу истинска база.
 *
 * Иска DATABASE_URL (docker compose up -d). Без него се пропуска.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('заявка за нова парола', async () => {
  const { db } = await import('@/db');
  const { passwordResets, users } = await import('@/db/schema');
  const { requestPasswordResetAction } = await import('@/lib/auth/actions');

  const email = `reset-test-${Date.now()}@example.invalid`;
  let userId: string;

  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  const liveTokens = async () =>
    db
      .select({ id: passwordResets.id })
      .from(passwordResets)
      .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));

  const allTokens = async () =>
    db.select().from(passwordResets).where(eq(passwordResets.userId, userId));

  beforeEach(async () => {
    await db.delete(users).where(eq(users.email, email));

    const inserted = await db
      .insert(users)
      .values({
        email,
        passwordHash: 'няма значение',
        firstName: 'Тест',
        lastName: 'Парола',
        status: 'active',
      })
      .returning({ id: users.id });

    userId = inserted[0]!.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, email));
  });

  it('издава линк за съществуващ профил', async () => {
    await requestPasswordResetAction({}, form({ email }));
    expect(await liveTokens()).toHaveLength(1);
  });

  it('отговаря еднакво за непознат имейл и не издава нищо', async () => {
    const known = await requestPasswordResetAction({}, form({ email }));
    const unknown = await requestPasswordResetAction(
      {},
      form({ email: 'няма-такъв@example.invalid' }),
    );

    expect(unknown).toEqual(known);
    expect(unknown).toEqual({ ok: true });
  });

  it('отговаря еднакво и при невалиден имейл', async () => {
    expect(await requestPasswordResetAction({}, form({ email: 'това-не-е-имейл' }))).toEqual({
      ok: true,
    });
  });

  it('не издава линк за блокиран профил', async () => {
    await db.update(users).set({ status: 'blocked' }).where(eq(users.id, userId));

    expect(await requestPasswordResetAction({}, form({ email }))).toEqual({ ok: true });
    expect(await allTokens()).toHaveLength(0);
  });

  it('обезсилва предишния линк, когато издаде нов', async () => {
    await requestPasswordResetAction({}, form({ email }));
    await requestPasswordResetAction({}, form({ email }));

    expect(await allTokens()).toHaveLength(2);
    // само последният остава използваем
    expect(await liveTokens()).toHaveLength(1);
  });

  it('спира след 3 заявки за час, без да го издава навън', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect(await requestPasswordResetAction({}, form({ email }))).toEqual({ ok: true });
    }

    expect(await allTokens()).toHaveLength(3);
  });
});

describe.skipIf(!hasDb)('смяна на парола по линк', async () => {
  const { db } = await import('@/db');
  const { passwordResets, sessions, users } = await import('@/db/schema');
  const { resetPasswordAction, isResetTokenValid } = await import('@/lib/auth/actions');
  const { verifyPassword } = await import('@/lib/auth/password');
  const { createHash, randomBytes } = await import('node:crypto');

  const email = `reset-use-${Date.now()}@example.invalid`;
  let userId: string;
  let token: string;

  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  /** Слага линк директно, за да не зависи тестът от изпращането на поща. */
  const giveToken = async (minutesValid: number) => {
    token = randomBytes(32).toString('base64url');
    await db.insert(passwordResets).values({
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + minutesValid * 60_000),
    });
  };

  beforeEach(async () => {
    await db.delete(users).where(eq(users.email, email));

    const inserted = await db
      .insert(users)
      .values({
        email,
        passwordHash: 'няма значение',
        firstName: 'Тест',
        lastName: 'Смяна',
        status: 'active',
      })
      .returning({ id: users.id });

    userId = inserted[0]!.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, email));
  });

  it('сменя паролата и изразходва линка', async () => {
    await giveToken(60);
    expect(await isResetTokenValid(token)).toBe(true);

    expect(await resetPasswordAction({}, form({ token, password: 'нова-парола-123' }))).toEqual({
      ok: true,
    });

    const after = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
    expect(await verifyPassword('нова-парола-123', after[0]!.hash)).toBe(true);
    expect(await isResetTokenValid(token)).toBe(false);
  });

  it('не приема същия линк втори път', async () => {
    await giveToken(60);
    await resetPasswordAction({}, form({ token, password: 'първа-парола-123' }));

    const second = await resetPasswordAction({}, form({ token, password: 'втора-парола-123' }));
    expect(second.ok).toBeUndefined();
    expect(second.error).toContain('изтекъл или вече е използван');

    // паролата остава първата
    const after = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
    expect(await verifyPassword('първа-парола-123', after[0]!.hash)).toBe(true);
  });

  it('не приема изтекъл линк', async () => {
    await giveToken(-1);
    expect(await isResetTokenValid(token)).toBe(false);

    const result = await resetPasswordAction({}, form({ token, password: 'нова-парола-123' }));
    expect(result.error).toContain('изтекъл или вече е използван');
  });

  it('отказва твърде къса парола', async () => {
    await giveToken(60);
    const result = await resetPasswordAction({}, form({ token, password: 'къса' }));

    expect(result.error).toContain('8 знака');
    // линкът остава използваем, щом нищо не е сменено
    expect(await isResetTokenValid(token)).toBe(true);
  });

  it('изхвърля всички сесии на профила', async () => {
    await giveToken(60);
    await db.insert(sessions).values({
      userId,
      tokenHash: `сесия-${Date.now()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await resetPasswordAction({}, form({ token, password: 'нова-парола-123' }));

    const left = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(left).toHaveLength(0);
  });
});
