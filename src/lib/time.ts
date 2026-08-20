/**
 * Часовете в източника са местно българско време. В базата всичко е UTC.
 * Тук няма библиотека — Intl носи tzdata, а нужните операции са две.
 */

export const SOFIA_TZ = 'Europe/Sofia';

/**
 * Мачове от далечни кръгове са публикувани само с дата, без час. Дотогава
 * приемаме най-ранния час, който изобщо се играе в тази група (09:00), за да
 * не се случи прозорецът за прогнози да е още отворен, когато мачът вече върви.
 * Щом източникът обяви точния час, дневното обновяване го замества.
 */
export const FALLBACK_KICKOFF_HOUR = 9;

const BG_MONTHS = [
  'януари',
  'февруари',
  'март',
  'април',
  'май',
  'юни',
  'юли',
  'август',
  'септември',
  'октомври',
  'ноември',
  'декември',
];

/**
 * Разликата в милисекунди между стенния часовник на `date` в зоната `tz` и UTC.
 * Положителна за зони на изток от Гринуич (София: +2ч зимно, +3ч лятно време).
 */
function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const f: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') f[part.type] = Number(part.value);
  }

  const asIfUtc = Date.UTC(
    f.year ?? 0,
    (f.month ?? 1) - 1,
    f.day ?? 1,
    // някои ICU версии дават 24 вместо 0 за полунощ при hour12:false
    (f.hour ?? 0) % 24,
    f.minute ?? 0,
    f.second ?? 0,
  );

  return asIfUtc - date.getTime();
}

/** Стенно време в дадена зона → точен момент (UTC). */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string = SOFIA_TZ,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);

  // Първо приближение с отместването, което важи "около" този момент, после
  // една корекция — нужна е само в двата часа на смяна на времето.
  let ts = naive - tzOffsetMs(new Date(naive), tz);
  const corrected = naive - tzOffsetMs(new Date(ts), tz);
  if (corrected !== ts) ts = corrected;

  return new Date(ts);
}

export type BulgarianDate = {
  year: number;
  month: number;
  day: number;
  /** null, когато източникът е обявил само дата */
  hour: number | null;
  minute: number | null;
};

/**
 * Разпознава редовете за дата от източника:
 *   "15 август 2026 г., събота, 09:30 ч:"   → с час
 *   "12 декември 2026 г., събота:"          → само дата
 */
export function parseBulgarianDate(text: string): BulgarianDate | null {
  // `\s` покрива и non-breaking space, който източникът ползва на места.
  const normalized = text.replace(/\s+/g, ' ');

  const match = /(\d{1,2})\s+([а-я]+)\s+(\d{4})\s*г\./iu.exec(normalized);
  if (!match) return null;

  const [, dayRaw, monthRaw, yearRaw] = match;
  const monthIndex = BG_MONTHS.indexOf((monthRaw ?? '').toLowerCase());
  if (monthIndex === -1) return null;

  // Часът се търси само след датата, за да не хване число от нея.
  const timeMatch = /(\d{1,2}):(\d{2})\s*ч/u.exec(normalized.slice(match.index + match[0].length));

  return {
    year: Number(yearRaw),
    month: monthIndex + 1,
    day: Number(dayRaw),
    hour: timeMatch ? Number(timeMatch[1]) : null,
    minute: timeMatch ? Number(timeMatch[2]) : null,
  };
}

/** Дата от източника → момент в UTC. Без обявен час: FALLBACK_KICKOFF_HOUR. */
export function bulgarianDateToUtc(date: BulgarianDate): Date {
  return zonedToUtc(
    date.year,
    date.month,
    date.day,
    date.hour ?? FALLBACK_KICKOFF_HOUR,
    date.minute ?? 0,
  );
}

const DATE_FMT = new Intl.DateTimeFormat('bg-BG', {
  timeZone: SOFIA_TZ,
  day: 'numeric',
  month: 'long',
  weekday: 'short',
});

const TIME_FMT = new Intl.DateTimeFormat('bg-BG', {
  timeZone: SOFIA_TZ,
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_TIME_FMT = new Intl.DateTimeFormat('bg-BG', {
  timeZone: SOFIA_TZ,
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatSofiaDate(date: Date): string {
  return DATE_FMT.format(date);
}

export function formatSofiaTime(date: Date): string {
  return TIME_FMT.format(date);
}

export function formatSofiaDateTime(date: Date): string {
  return DATE_TIME_FMT.format(date);
}

/**
 * Оставащо време до заключването, за човек.
 *
 * Колкото по-близо е срокът, толкова по-точно се показва: от "3 дни 4 ч" до
 * "07:32" в последния час — тогава секундите вече имат значение.
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'затворено';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days} ${days === 1 ? 'ден' : 'дни'} ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Под един час прозорецът се затваря скоро — UI-ът го показва различно. */
export const URGENT_MS = 60 * 60 * 1000;

/**
 * sv-SE форматира като "2026-08-21 09:30" — най-близкото до ISO, което Intl
 * дава готово.
 */
const INPUT_FMT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: SOFIA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Момент → стойност за `<input type="datetime-local">` в софийско време.
 *
 * Полето работи със стенно време без зона, затова и двете посоки минават през
 * София изрично — иначе стойността би зависела от часовника на устройството, с
 * което админът пише.
 */
export function toSofiaInputValue(date: Date): string {
  return INPUT_FMT.format(date).replace(' ', 'T');
}

/** "2026-08-21T09:30" като софийско стенно време → момент в UTC. */
export function parseSofiaInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;

  return zonedToUtc(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
  );
}
