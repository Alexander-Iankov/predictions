/**
 * Смяна на парола от профила.
 *
 * Действието чете сесията от cookie, затова тук `next/headers` е подменен с
 * прост заместител — така се тества истинската логика (проверка на текущата
 * парола, изхвърляне на другите сесии), а не как Next чете заявката.
 *
 * Иска DATABASE_URL (docker compose up -d). Без него се пропуска.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

/** Токенът на „текущия браузър" — мокът по-долу го чете при всяко викане. */
const jar = { token: '' };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.token ? { name, value: jar.token } : undefined),
    set: (name: string, value: string) => {
      jar.token = value;
    },
    delete: () => {
      jar.token = '';
    },
  }),
}));

describe.skipIf(!hasDb)('changePasswordAction', async () => {
  const { db } = await import('@/db');
  const { sessions, users } = await import('@/db/schema');
  const { changePasswordAction } = await import('@/lib/auth/actions');
  const { hashPassword, verifyPassword } = await import('@/lib/auth/password');

  const email = `change-pass-${Date.now()}@example.invalid`;
  const CURRENT = 'текуща-парола-123';

  let userId: string;

  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  const storedHash = async () => {
    const rows = await db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId));
    return rows[0]!.hash;
  };

  const sessionCount = async () =>
    (await db.select().from(sessions).where(eq(sessions.userId, userId))).length;

  /** Слага сесия в базата и я обявява за текуща в подменените cookies. */
  const login = async () => {
    const token = randomBytes(32).toString('base64url');
    await db.insert(sessions).values({
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    jar.token = token;
  };

  beforeEach(async () => {
    await db.delete(users).where(eq(users.email, email));

    const inserted = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(CURRENT),
        firstName: 'Тест',
        lastName: 'Парола',
        status: 'active',
      })
      .returning({ id: users.id });

    userId = inserted[0]!.id;
    await login();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, email));
    jar.token = '';
  });

  it('сменя паролата при вярна текуща', async () => {
    const result = await changePasswordAction(
      {},
      form({ currentPassword: CURRENT, password: 'нова-парола-456' }),
    );

    expect(result).toEqual({ ok: true });
    expect(await verifyPassword('нова-парола-456', await storedHash())).toBe(true);
    expect(await verifyPassword(CURRENT, await storedHash())).toBe(false);
  });

  it('отказва при грешна текуща парола', async () => {
    const before = await storedHash();

    const result = await changePasswordAction(
      {},
      form({ currentPassword: 'грешна', password: 'нова-парола-456' }),
    );

    expect(result.error).toContain('Текущата парола е грешна');
    expect(await storedHash()).toBe(before);
  });

  it('отказва нова парола, еднаква със старата', async () => {
    const result = await changePasswordAction(
      {},
      form({ currentPassword: CURRENT, password: CURRENT }),
    );

    expect(result.error).toContain('същата като старата');
  });

  it('отказва твърде къса парола', async () => {
    const before = await storedHash();

    const result = await changePasswordAction(
      {},
      form({ currentPassword: CURRENT, password: 'къса' }),
    );

    expect(result.error).toContain('8 знака');
    expect(await storedHash()).toBe(before);
  });

  it('изхвърля другите сесии, но оставя текущата', async () => {
    // втори "браузър" на същия профил
    await db.insert(sessions).values({
      userId,
      tokenHash: `друга-сесия-${Date.now()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(await sessionCount()).toBe(2);

    await changePasswordAction({}, form({ currentPassword: CURRENT, password: 'нова-парола-456' }));

    // старите две падат, отваря се една нова за този браузър
    expect(await sessionCount()).toBe(1);
  });

  it('не пипа нищо при отказ', async () => {
    const before = await sessionCount();
    await changePasswordAction({}, form({ currentPassword: 'грешна', password: 'нова-парола-456' }));

    expect(await sessionCount()).toBe(before);
  });
});
