import { redirect } from 'next/navigation';
import { currentUser, type SessionUser } from '@/lib/auth/session';

/**
 * Проверките за достъп са тук, а не в middleware.ts.
 *
 * middleware-ът само пренасочва при липсващо cookie — той не може да пита
 * базата. Истинската проверка (жива ли е сесията, одобрен ли е акаунтът, админ
 * ли е) става на всяка страница и в всеки server action през тези функции.
 */

/** Влязъл и одобрен потребител, иначе пренасочване. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();

  if (!user) redirect('/login');
  if (user.status === 'pending') redirect('/pending');
  if (user.status === 'blocked') redirect('/blocked');

  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/matches');
  return user;
}

/**
 * За server actions: хвърля вместо да пренасочва, за да може действието да
 * върне съобщение за грешка, а не да прекъсне навигацията по средата.
 */
export async function requireUserForAction(): Promise<SessionUser> {
  const user = await currentUser();

  if (!user || user.status !== 'active') {
    throw new Error('Нужен е активен профил.');
  }

  return user;
}

export async function requireAdminForAction(): Promise<SessionUser> {
  const user = await requireUserForAction();

  if (user.role !== 'admin') {
    throw new Error('Действието е само за админ.');
  }

  return user;
}
