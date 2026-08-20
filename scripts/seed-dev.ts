/**
 * Тестови профили за локална разработка.
 *
 *   npm run seed:dev
 *
 * Паролата е една и съща за всички и е очевидно тестова. Скриптът отказва да
 * работи в продукция.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';

if (process.env.NODE_ENV === 'production') {
  console.error('seed:dev не се пуска в продукция.');
  process.exit(1);
}

const PASSWORD = 'prognozi-dev-1234';

const people = [
  { email: 'admin@example.com', firstName: 'Админ', lastName: 'Админов', role: 'admin' as const, status: 'active' as const },
  { email: 'ivan@example.com', firstName: 'Иван', lastName: 'Петров', role: 'user' as const, status: 'active' as const },
  { email: 'maria@example.com', firstName: 'Мария', lastName: 'Георгиева', role: 'user' as const, status: 'active' as const },
  { email: 'nov@example.com', firstName: 'Нов', lastName: 'Участник', role: 'user' as const, status: 'pending' as const },
];

const passwordHash = await hashPassword(PASSWORD);

for (const person of people) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, person.email))
    .limit(1);

  if (existing[0]) {
    await db.update(users).set({ ...person, passwordHash }).where(eq(users.id, existing[0].id));
    console.log(`обновен: ${person.email} (${person.status})`);
  } else {
    await db.insert(users).values({ ...person, passwordHash });
    console.log(`създаден: ${person.email} (${person.status})`);
  }
}

console.log(`\nПарола за всички: ${PASSWORD}`);
process.exit(0);
