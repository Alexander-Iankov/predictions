import { sql, type SQL } from 'drizzle-orm';
import { LOCK_MINUTES } from '@/lib/lock';

/**
 * Същото правило като в src/lib/lock.ts, но за WHERE клауза.
 *
 * Съществува, защото проверките не бива да се правят в приложението: условието
 * трябва да е част от заявката, за да няма пролука между „проверих" и
 * „записах", и за да не може чужда прогноза да излезе от сървъра при грешка в
 * UI-а. Пише се веднъж тук и се ползва навсякъде — иначе трите места, които го
 * ползват, ще се разминат.
 *
 * `alias` е името на таблицата с мачове в конкретната заявка.
 */

export function isOpenSql(alias = 'matches'): SQL {
  const m = sql.raw(`"${alias}"`);

  return sql`(
    ${m}.prediction_window <> 'locked'
    and ${m}.status <> 'finished'
    and (
      ${m}.prediction_window = 'open'
      or (
        ${m}.prediction_window = 'auto'
        and ${m}.status = 'scheduled'
        and ${m}.kickoff_at - make_interval(mins => ${LOCK_MINUTES}) > now()
      )
    )
  )`;
}

/** Огледало на isRevealed(): затворен прозорец и мачът не е отложен. */
export function isRevealedSql(alias = 'matches'): SQL {
  const m = sql.raw(`"${alias}"`);

  return sql`(${m}.status <> 'postponed' and not ${isOpenSql(alias)})`;
}
