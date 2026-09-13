import { sql, type SQL } from 'drizzle-orm';

/**
 * Същото правило като в src/lib/visibility.ts, но за WHERE клауза.
 *
 * Филтърът стои в заявката, а не в страницата: така скрит профил няма как да
 * излезе от сървъра при пропуск в UI-а. Пише се веднъж тук, защото местата,
 * които го ползват, са няколко и биха се разминали.
 *
 * `alias` е името на таблицата с потребители в конкретната заявка.
 */

/** Огледало на isCompetitor(): вижда се от другите и влиза в класирането. */
export function isCompetitorSql(alias = 'users'): SQL {
  const u = sql.raw(`"${alias}"`);

  return sql`(${u}.role = 'user')`;
}

/**
 * Огледало на isVisibleTo(): състезател или самият зрител.
 *
 * Заради втората половина скритият профил вижда собствените си прогнози в
 * общия списък, без да го вижда някой друг.
 */
export function isVisibleToSql(viewerId: string, alias = 'users'): SQL {
  const u = sql.raw(`"${alias}"`);

  return sql`(${isCompetitorSql(alias)} or ${u}.id = ${viewerId})`;
}
