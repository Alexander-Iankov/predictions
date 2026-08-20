import { describe, expect, it } from 'vitest';
import {
  CRITERIA,
  CRITERION_GROUPS,
  CRITERION_SHORT,
  MAX_POINTS,
  POINTS,
  derive2h,
  scorePrediction,
  sign,
  validatePrediction,
  type ActualResult,
  type Prediction,
} from '@/lib/scoring';

const p = (htHome: number, htAway: number, ftHome: number, ftAway: number): Prediction => ({
  ht: { home: htHome, away: htAway },
  ft: { home: ftHome, away: ftAway },
});

const a = (
  htHome: number | null,
  htAway: number | null,
  ftHome: number,
  ftAway: number,
): ActualResult => ({
  ht: htHome === null || htAway === null ? null : { home: htHome, away: htAway },
  ft: { home: ftHome, away: ftAway },
});

describe('sign', () => {
  it('различава домакин, равен и гост', () => {
    expect(sign({ home: 2, away: 1 })).toBe('1');
    expect(sign({ home: 1, away: 1 })).toBe('X');
    expect(sign({ home: 0, away: 3 })).toBe('2');
  });
});

describe('derive2h', () => {
  it('изважда полувремето от крайния резултат', () => {
    expect(derive2h({ home: 3, away: 2 }, { home: 2, away: 1 })).toEqual({ home: 1, away: 1 });
  });
});

describe('MAX_POINTS', () => {
  it('е 16', () => {
    expect(MAX_POINTS).toBe(16);
  });

  it('се получава при напълно позната прогноза', () => {
    const result = scorePrediction(p(1, 0, 3, 2), a(1, 0, 3, 2));
    expect(result.points).toBe(16);
    expect(result.partial).toBe(false);
  });
});

describe('примерът от заданието', () => {
  // Прогноза ПП 2:1 и КР 3:2 → изведено ВП 1:1.
  // Реално ПП 1:0, ВП 2:2, КР 3:2.
  const result = scorePrediction(p(2, 1, 3, 2), a(1, 0, 3, 2));

  it('дава точките по критерии', () => {
    expect(result.breakdown).toEqual({
      // знаците: прогноза 1 / X / 1 срещу реални 1 / X / 1 — и трите познати
      sign_ht: 1,
      sign_2h: 1,
      sign_ft: 1,
      // ПП 2:1 срещу 1:0 — нито един отбор познат
      goals_ht_home: 0,
      goals_ht_away: 0,
      exact_ht: 0,
      // ВП 1:1 срещу 2:2 — нито един отбор познат
      goals_2h_home: 0,
      goals_2h_away: 0,
      exact_2h: 0,
      // КР 3:2 срещу 3:2 — и двата отбора познати, плюс бонусът
      goals_ft_home: 1,
      goals_ft_away: 1,
      exact_ft: 3,
    });
  });

  it('дава 8 точки', () => {
    // Заданието изчислява 9, но там 1 точка е дадена за "голове на втория отбор
    // първо полувреме" при прогноза 1 гол срещу реален 0 гола. По правилото
    // "познаване голове на единия отбор" това е 0 точки, откъдето 8.
    expect(result.points).toBe(8);
  });
});

describe('липсващо полувреме', () => {
  const result = scorePrediction(p(2, 1, 3, 2), a(null, null, 3, 2));

  it('точкува само крайния резултат', () => {
    expect(result.points).toBe(1 + 1 + 1 + 3);
  });

  it('маркира критериите за ПП и ВП като непроверими, не като сгрешени', () => {
    expect(result.breakdown.sign_ht).toBeNull();
    expect(result.breakdown.goals_ht_home).toBeNull();
    expect(result.breakdown.exact_ht).toBeNull();
    expect(result.breakdown.sign_2h).toBeNull();
    expect(result.breakdown.exact_2h).toBeNull();
    expect(result.partial).toBe(true);
  });

  it('не бърка "непроверимо" със "сгрешено"', () => {
    const wrong = scorePrediction(p(2, 1, 5, 0), a(0, 0, 3, 2));
    expect(wrong.breakdown.sign_ht).toBe(0);
    expect(wrong.partial).toBe(false);
  });
});

describe('точен резултат на полувреме без точен краен', () => {
  it('дава точки за ПП и за знака, но не и за КР', () => {
    const result = scorePrediction(p(1, 0, 2, 0), a(1, 0, 4, 0));
    expect(result.breakdown.exact_ht).toBe(2);
    expect(result.breakdown.goals_ht_home).toBe(1);
    expect(result.breakdown.goals_ht_away).toBe(1);
    expect(result.breakdown.sign_ht).toBe(1);
    expect(result.breakdown.exact_ft).toBe(0);
    // ВП: прогноза 1:0 срещу реално 3:0 — само знакът и головете на гостите
    expect(result.breakdown.sign_2h).toBe(1);
    expect(result.breakdown.goals_2h_away).toBe(1);
    expect(result.breakdown.goals_2h_home).toBe(0);
    expect(result.points).toBe(1 + 1 + 1 + 2 + 1 + 0 + 1 + 0 + 1 + 0 + 1 + 0);
  });
});

describe('CRITERION_GROUPS', () => {
  const grouped = CRITERION_GROUPS.flatMap((group) => group.criteria);

  it('покрива всеки критерий точно веднъж', () => {
    expect([...grouped].sort()).toEqual([...CRITERIA].sort());
  });

  it('сумата на групите е максимумът за мач', () => {
    const total = grouped.reduce((sum, criterion) => sum + POINTS[criterion], 0);
    expect(total).toBe(MAX_POINTS);
  });

  it('всеки критерий има кратко име', () => {
    for (const criterion of CRITERIA) {
      expect(CRITERION_SHORT[criterion], criterion).toBeTruthy();
    }
  });
});

describe('validatePrediction', () => {
  it('приема нормална прогноза', () => {
    expect(validatePrediction(p(1, 0, 2, 1))).toEqual([]);
  });

  it('приема равен резултат без голове', () => {
    expect(validatePrediction(p(0, 0, 0, 0))).toEqual([]);
  });

  it('отказва краен резултат, по-малък от полувремето', () => {
    expect(validatePrediction(p(2, 0, 1, 0))).toEqual(['ht_home_gt_ft_home']);
    expect(validatePrediction(p(0, 3, 0, 1))).toEqual(['ht_away_gt_ft_away']);
  });

  it('отказва отрицателни и нецели числа', () => {
    expect(validatePrediction(p(-1, 0, 1, 0))).toContain('negative');
    expect(validatePrediction(p(0.5, 0, 1, 0))).toContain('not_integer');
  });

  it('отказва абсурдно големи числа', () => {
    expect(validatePrediction(p(0, 0, 99, 0))).toContain('too_large');
  });
});
