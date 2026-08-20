/**
 * Кога прозорецът за прогнози е отворен и кога чуждите прогнози стават публични.
 *
 * Това е единственият източник на истина по въпроса. Всяко място, което пише
 * или чете прогнози, минава оттук — иначе правилото се разминава между UI и
 * сървъра и някой ще види чужда прогноза, преди да е заключена.
 */

export const LOCK_MINUTES = 60;

export type MatchStatus = 'scheduled' | 'finished' | 'postponed';

export type LockableMatch = {
  kickoffAt: Date;
  status: MatchStatus;
};

/** Моментът, в който прогнозите се затварят: 1 час преди начало. */
export function lockAt(match: LockableMatch): Date {
  return new Date(match.kickoffAt.getTime() - LOCK_MINUTES * 60_000);
}

/**
 * Може ли да се пише прогноза.
 *
 * Отложен мач е затворен: новият час не е известен, значи не знаем срока.
 * Щом админът го върне на "scheduled" с нов час, прозорецът се отваря отново.
 */
export function isOpen(match: LockableMatch, now: Date): boolean {
  if (match.status !== 'scheduled') return false;
  return now.getTime() < lockAt(match).getTime();
}

/**
 * Публични ли са прогнозите на всички.
 *
 * Отложен мач остава скрит — не е изигран, значи разкриването му би дало
 * предимство, когато се играе.
 */
export function isRevealed(match: LockableMatch, now: Date): boolean {
  if (match.status === 'postponed') return false;
  return now.getTime() >= lockAt(match).getTime();
}

export function msUntilLock(match: LockableMatch, now: Date): number {
  return Math.max(0, lockAt(match).getTime() - now.getTime());
}
