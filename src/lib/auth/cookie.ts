/**
 * Само името на cookie-то, в отделен модул без зависимости.
 *
 * middleware.ts върви на edge runtime, където няма node:crypto и няма как да се
 * говори с базата. Ако вземеше константата от session.ts, щеше да влачи целия
 * модул и заявката щеше да пада с "Native module not found: node:crypto".
 */
export const SESSION_COOKIE = 'prognozi_session';
