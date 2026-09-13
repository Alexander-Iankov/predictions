/**
 * Правилото за видимост е написано два пъти: в TypeScript (visibility.ts) и в
 * SQL (visibility-sql.ts). Този тест ги пуска един срещу друг за всички роли.
 *
 * Разминаване тук значи или скрит профил, изтекъл в класирането, или участник,
 * изчезнал от него — и двете се забелязват чак когато някой се оплаче.
 *
 * Иска DATABASE_URL (docker compose up -d). Без него се пропуска.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isCompetitor, isVisibleTo, type UserRole } from '@/lib/visibility';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('SQL видимостта съвпада с TypeScript видимостта', async () => {
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { getLeaderboard } = await import('@/lib/queries/leaderboard');
  const { isCompetitorSql, isVisibleToSql } = await import('@/lib/visibility-sql');

  const ROLES: UserRole[] = ['user', 'admin', 'test'];
  const PREFIX = 'vis-test-';

  const ids: Record<UserRole, string> = { user: '', admin: '', test: '' };

  beforeAll(async () => {
    await cleanup();

    for (const role of ROLES) {
      const inserted = await db
        .insert(users)
        .values({
          email: `${PREFIX}${role}@example.com`,
          passwordHash: 'x',
          firstName: 'Видим',
          lastName: `Профил-${role}`,
          role,
          status: 'active',
        })
        .returning({ id: users.id });

      ids[role] = inserted[0]!.id;
    }
  });

  afterAll(cleanup);

  async function cleanup() {
    await db.delete(users).where(sql`${users.email} like ${`${PREFIX}%`}`);
  }

  it('isCompetitorSql дава същото като isCompetitor', async () => {
    for (const role of ROLES) {
      const rows = await db
        .select({ competitor: sql<boolean>`${isCompetitorSql()}` })
        .from(users)
        .where(sql`${users.id} = ${ids[role]}`);

      expect(rows[0]?.competitor, `роля ${role}`).toBe(isCompetitor(role));
    }
  });

  it('isVisibleToSql дава същото като isVisibleTo за всяка двойка роли', async () => {
    for (const viewer of ROLES) {
      for (const target of ROLES) {
        const rows = await db
          .select({ visible: sql<boolean>`${isVisibleToSql(ids[viewer])}` })
          .from(users)
          .where(sql`${users.id} = ${ids[target]}`);

        expect(rows[0]?.visible, `${viewer} гледа ${target}`).toBe(
          isVisibleTo({ id: ids[target], role: target }, ids[viewer]),
        );
      }
    }
  });

  it('класирането съдържа участника и не съдържа служебните профили', async () => {
    const rows = await getLeaderboard();
    const present = new Set(rows.map((row) => row.userId));

    expect(present.has(ids.user)).toBe(true);
    expect(present.has(ids.test)).toBe(false);
    expect(present.has(ids.admin)).toBe(false);
  });
});
