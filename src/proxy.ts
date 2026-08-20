import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

/**
 * Само бърза преграда: липсва ли cookie, няма смисъл страницата да се рендира.
 *
 * Тук НЕ се проверява дали сесията е жива, дали профилът е одобрен и дали е
 * админ — това върви на edge runtime и не може да пита базата. Истинската
 * проверка е в requireUser()/requireAdmin() на всяка страница и action.
 *
 * (В Next 16 конвенцията "middleware" се преименува на "proxy".)
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    '/matches/:path*',
    '/leaderboard/:path*',
    '/me/:path*',
    '/profile/:path*',
    '/participants/:path*',
    '/admin/:path*',
  ],
};
