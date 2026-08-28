import { describe, expect, it } from 'vitest';
import { LOCK_MINUTES, isOpen, isRevealed, lockAt, msUntilLock } from '@/lib/lock';
import { formatRemaining } from '@/lib/time';

const kickoffAt = new Date('2026-08-15T07:00:00.000Z'); // 10:00 българско време
const minutesBefore = (n: number) => new Date(kickoffAt.getTime() - n * 60_000);

const auto = 'auto' as const;
const scheduled = { kickoffAt, status: 'scheduled' as const, predictionWindow: auto };

describe('lockAt', () => {
  it('е точно 1 час преди началото', () => {
    expect(LOCK_MINUTES).toBe(60);
    expect(lockAt(scheduled).toISOString()).toBe('2026-08-15T06:00:00.000Z');
  });
});

describe('isOpen', () => {
  it('е отворено 61 минути преди началото', () => {
    expect(isOpen(scheduled, minutesBefore(61))).toBe(true);
  });

  it('е затворено 59 минути преди началото', () => {
    expect(isOpen(scheduled, minutesBefore(59))).toBe(false);
  });

  it('е затворено точно в момента на заключване', () => {
    expect(isOpen(scheduled, minutesBefore(60))).toBe(false);
  });

  it('е затворено след началото', () => {
    expect(isOpen(scheduled, new Date('2026-08-15T08:00:00.000Z'))).toBe(false);
  });

  it('е затворено за изигран мач', () => {
    expect(isOpen({ kickoffAt, status: 'finished', predictionWindow: auto }, minutesBefore(600))).toBe(false);
  });

  it('е затворено за отложен мач — новият час не е известен', () => {
    expect(isOpen({ kickoffAt, status: 'postponed', predictionWindow: auto }, minutesBefore(600))).toBe(false);
  });
});

describe('isRevealed', () => {
  it('крие прогнозите преди заключването', () => {
    expect(isRevealed(scheduled, minutesBefore(61))).toBe(false);
  });

  it('показва прогнозите от момента на заключване', () => {
    expect(isRevealed(scheduled, minutesBefore(60))).toBe(true);
    expect(isRevealed(scheduled, minutesBefore(0))).toBe(true);
  });

  it('държи отложен мач скрит, за да няма предимство, когато се играе', () => {
    expect(isRevealed({ kickoffAt, status: 'postponed', predictionWindow: auto }, minutesBefore(0))).toBe(false);
  });

  it('показва изигран мач', () => {
    expect(isRevealed({ kickoffAt, status: 'finished', predictionWindow: auto }, minutesBefore(0))).toBe(true);
  });
});

describe('ръчно отваряне и заключване от админ', () => {
  const forced = (
    predictionWindow: 'open' | 'locked',
    status: 'scheduled' | 'finished' | 'postponed' = 'scheduled',
  ) => ({ kickoffAt, status, predictionWindow });

  it('отворен от админ приема прогноза и след срока', () => {
    expect(isOpen(forced('open'), minutesBefore(10))).toBe(true);
    expect(isOpen(forced('open'), new Date('2026-08-15T09:00:00.000Z'))).toBe(true);
  });

  it('отворен от админ работи и за отложен мач', () => {
    expect(isOpen(forced('open', 'postponed'), minutesBefore(0))).toBe(true);
  });

  it('изигран мач не се отваря дори ръчно', () => {
    // Иначе прогнозата би се писала, след като резултатът вече е известен.
    expect(isOpen(forced('open', 'finished'), minutesBefore(600))).toBe(false);
  });

  it('заключен от админ отказва и много преди срока', () => {
    expect(isOpen(forced('locked'), minutesBefore(600))).toBe(false);
  });

  it('отвореният от админ мач СКРИВА прогнозите обратно', () => {
    // Ключово: ако останеха видими, отворилият би преписал чуждите.
    expect(isRevealed(forced('open'), minutesBefore(0))).toBe(false);
    expect(isRevealed(forced('open'), new Date('2026-08-15T09:00:00.000Z'))).toBe(false);
  });

  it('заключеният от админ мач показва прогнозите веднага', () => {
    expect(isRevealed(forced('locked'), minutesBefore(600))).toBe(true);
  });

  it('отложен мач остава скрит и когато е заключен ръчно', () => {
    expect(isRevealed(forced('locked', 'postponed'), minutesBefore(0))).toBe(false);
  });

  it('видимостта е точно обратното на отвореността, освен при отложен', () => {
    const cases = [forced('open'), forced('locked'), scheduled, forced('open', 'finished')];

    for (const match of cases) {
      const now = minutesBefore(30);
      expect(isRevealed(match, now), JSON.stringify(match)).toBe(!isOpen(match, now));
    }
  });
});

describe('msUntilLock', () => {
  it('брои надолу до заключването', () => {
    expect(msUntilLock(scheduled, minutesBefore(90))).toBe(30 * 60_000);
  });

  it('не става отрицателно', () => {
    expect(msUntilLock(scheduled, minutesBefore(0))).toBe(0);
  });
});

describe('formatRemaining', () => {
  const seconds = (n: number) => n * 1000;
  const minutes = (n: number) => seconds(n * 60);
  const hours = (n: number) => minutes(n * 60);
  const days = (n: number) => hours(n * 24);

  it('под час показва минути и секунди', () => {
    expect(formatRemaining(minutes(45) + seconds(12))).toBe('45:12');
    expect(formatRemaining(seconds(7))).toBe('0:07');
    expect(formatRemaining(minutes(59) + seconds(59))).toBe('59:59');
  });

  it('над час показва часове и минути', () => {
    expect(formatRemaining(hours(5) + minutes(12))).toBe('5 ч 12 мин');
    expect(formatRemaining(hours(1))).toBe('1 ч 0 мин');
  });

  it('над ден показва дни и часове', () => {
    expect(formatRemaining(days(3) + hours(4))).toBe('3 дни 4 ч');
  });

  it('членува правилно единствения ден', () => {
    expect(formatRemaining(days(1) + hours(2))).toBe('1 ден 2 ч');
    expect(formatRemaining(days(2))).toBe('2 дни 0 ч');
  });

  it('изтекъл срок е "затворено"', () => {
    expect(formatRemaining(0)).toBe('затворено');
    expect(formatRemaining(-1000)).toBe('затворено');
  });

  it('съвпада с msUntilLock', () => {
    expect(formatRemaining(msUntilLock(scheduled, minutesBefore(90)))).toBe('30:00');
  });
});
