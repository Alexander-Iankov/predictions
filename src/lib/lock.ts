/**
 * Кога прозорецът за прогнози е отворен и кога чуждите прогнози стават публични.
 *
 * Това е единственият източник на истина по въпроса. Всяко място, което пише
 * или чете прогнози, минава оттук — иначе правилото се разминава между UI и
 * сървъра и някой ще види чужда прогноза, преди да е заключена.
 *
 * Същото правило, написано за SQL, е в src/lib/lock-sql.ts. Двете се менят
 * заедно и са покрити с общ тест.
 */

export const LOCK_MINUTES = 60;

export type MatchStatus = 'scheduled' | 'finished' | 'postponed';

/** Ръчно решение на админа; 'auto' значи „по часа". */
export type PredictionWindow = 'auto' | 'open' | 'locked';

export type LockableMatch = {
  kickoffAt: Date;
  status: MatchStatus;
  predictionWindow: PredictionWindow;
};

/** Моментът, в който прогнозите се затварят по правилото: 1 час преди начало. */
export function lockAt(match: Pick<LockableMatch, 'kickoffAt'>): Date {
  return new Date(match.kickoffAt.getTime() - LOCK_MINUTES * 60_000);
}

/**
 * Може ли да се пише прогноза.
 *
 * Админът може да отвори мач въпреки часа или да го заключи по-рано.
 *
 * Изигран мач не се отваря дори ръчно — там прогнозата би се писала, след като
 * резултатът вече е известен, а това не е забавяне на срок, а измама.
 *
 * Отложен мач по подразбиране е затворен: новият час не е известен, значи не
 * знаем срока. Админът може изрично да го отвори.
 */
export function isOpen(match: LockableMatch, now: Date): boolean {
  if (match.predictionWindow === 'locked') return false;
  if (match.status === 'finished') return false;

  if (match.predictionWindow === 'open') return true;

  return match.status === 'scheduled' && now.getTime() < lockAt(match).getTime();
}

/**
 * Публични ли са прогнозите на всички.
 *
 * Изведено от isOpen нарочно: щом прозорецът е отворен, прогнозите се крият;
 * щом е затворен — стават видими. Така ръчното отваряне на вече заключен мач
 * автоматично скрива прогнозите обратно, иначе отворилият би преписал чуждите.
 *
 * Отложен мач остава скрит — не е изигран, значи разкриването му би дало
 * предимство, когато се играе.
 */
export function isRevealed(match: LockableMatch, now: Date): boolean {
  if (match.status === 'postponed') return false;
  return !isOpen(match, now);
}

export function msUntilLock(match: Pick<LockableMatch, 'kickoffAt'>, now: Date): number {
  return Math.max(0, lockAt(match).getTime() - now.getTime());
}
