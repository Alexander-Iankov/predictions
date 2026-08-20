import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { pruneExpiredSessions } from '@/lib/auth/session';
import { refreshSchedule } from '@/lib/refresh';

/**
 * Дневното обновяване на графика.
 *
 * Vercel Hobby позволява cron само веднъж дневно, затова тук се минава един път
 * (виж vercel.json), а останалото се дърпа ръчно от админ панела.
 *
 * Ендпойнтът е публичен URL, затова иска CRON_SECRET. Vercel го подава сам като
 * `Authorization: Bearer $CRON_SECRET`.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = env().CRON_SECRET;

  // Без зададен secret ендпойнтът не работи — по-добре да не се обновява,
  // отколкото всеки да може да го дърпа.
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Няма достъп.' }, { status: 401 });
  }

  const result = await refreshSchedule({ trigger: 'cron' });

  // Изтеклите сесии не са спешни, но кронът е точното място да се чистят.
  await pruneExpiredSessions();

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}
