/**
 * Създава (или повишава) админ профил.
 *
 *   ADMIN_EMAIL=ти@example.com ADMIN_PASSWORD='...' npm run seed:admin
 *
 * Паролата се подава от теб — скриптът не измисля пароли. Ако профилът вече
 * съществува, той се повишава до админ и се активира, а паролата се сменя само
 * ако е подадена нова.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const firstName = process.env.ADMIN_FIRST_NAME?.trim() || 'Админ';
const lastName = process.env.ADMIN_LAST_NAME?.trim() || 'Профил';

if (!email) {
  console.error('Липсва ADMIN_EMAIL.');
  process.exit(1);
}

const existing = await db
  .select({ id: users.id, role: users.role })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

const found = existing[0];

if (found) {
  await db
    .update(users)
    .set({
      role: 'admin',
      status: 'active',
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    })
    .where(eq(users.id, found.id));

  console.log(
    `Профилът ${email} е админ и е активен${password ? ' (паролата е сменена)' : ''}.`,
  );
  process.exit(0);
}

if (!password) {
  console.error('Профилът не съществува — нужен е ADMIN_PASSWORD, за да се създаде.');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Паролата трябва да е поне 8 знака.');
  process.exit(1);
}

await db.insert(users).values({
  email,
  passwordHash: await hashPassword(password),
  firstName,
  lastName,
  role: 'admin',
  status: 'active',
});

console.log(`Създаден админ профил: ${email}`);
process.exit(0);
