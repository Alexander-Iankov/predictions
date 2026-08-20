/**
 * Точкуване на прогнозите. Чиста логика без база и без дати — цялата е покрита
 * с тестове в test/scoring.test.ts.
 *
 * Участникът прогнозира само първо полувреме (ПП) и краен резултат (КР).
 * Второто полувреме (ВП) се извежда: ВП = КР − ПП. Затова прогноза, в която
 * КР е по-малък от ПП за някой отбор, е невалидна.
 */

export type Goals = { home: number; away: number };

/** 1 = домакинът напред, X = равен, 2 = гостите напред */
export type Sign = '1' | 'X' | '2';

export type Prediction = { ht: Goals; ft: Goals };

/** ht е null, когато източникът не е публикувал резултат от полувремето. */
export type ActualResult = { ht: Goals | null; ft: Goals };

export const CRITERIA = [
  'sign_ht',
  'goals_ht_home',
  'goals_ht_away',
  'exact_ht',
  'sign_2h',
  'goals_2h_home',
  'goals_2h_away',
  'exact_2h',
  'sign_ft',
  'goals_ft_home',
  'goals_ft_away',
  'exact_ft',
] as const;

export type Criterion = (typeof CRITERIA)[number];

export const POINTS: Record<Criterion, number> = {
  sign_ht: 1,
  goals_ht_home: 1,
  goals_ht_away: 1,
  exact_ht: 2,
  sign_2h: 1,
  goals_2h_home: 1,
  goals_2h_away: 1,
  exact_2h: 2,
  sign_ft: 1,
  goals_ft_home: 1,
  goals_ft_away: 1,
  exact_ft: 3,
};

/** Максимумът за един мач: 16 точки. */
export const MAX_POINTS: number = CRITERIA.reduce((sum, c) => sum + POINTS[c], 0);

/**
 * Критериите, групирани по полувреме — за разбивката, която участникът вижда.
 *
 * Вътре в групата името е кратко („знак", „голове на домакина"), защото
 * заглавието на групата вече казва за кое полувреме става дума.
 */
export const CRITERION_GROUPS = [
  {
    label: 'Първо полувреме',
    short: 'ПП',
    criteria: ['sign_ht', 'goals_ht_home', 'goals_ht_away', 'exact_ht'],
  },
  {
    label: 'Второ полувреме',
    short: 'ВП',
    criteria: ['sign_2h', 'goals_2h_home', 'goals_2h_away', 'exact_2h'],
  },
  {
    label: 'Краен резултат',
    short: 'КР',
    criteria: ['sign_ft', 'goals_ft_home', 'goals_ft_away', 'exact_ft'],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  short: string;
  criteria: ReadonlyArray<Criterion>;
}>;

export const CRITERION_SHORT: Record<Criterion, string> = {
  sign_ht: 'знак',
  goals_ht_home: 'голове на домакина',
  goals_ht_away: 'голове на гостите',
  exact_ht: 'точен резултат',
  sign_2h: 'знак',
  goals_2h_home: 'голове на домакина',
  goals_2h_away: 'голове на гостите',
  exact_2h: 'точен резултат',
  sign_ft: 'знак',
  goals_ft_home: 'голове на домакина',
  goals_ft_away: 'голове на гостите',
  exact_ft: 'точен резултат',
};

export const CRITERION_LABEL: Record<Criterion, string> = {
  sign_ht: 'знак на първо полувреме',
  goals_ht_home: 'голове на домакина, първо полувреме',
  goals_ht_away: 'голове на гостите, първо полувреме',
  exact_ht: 'точен резултат, първо полувреме',
  sign_2h: 'знак на второ полувреме',
  goals_2h_home: 'голове на домакина, второ полувреме',
  goals_2h_away: 'голове на гостите, второ полувреме',
  exact_2h: 'точен резултат, второ полувреме',
  sign_ft: 'знак на краен резултат',
  goals_ft_home: 'голове на домакина, краен резултат',
  goals_ft_away: 'голове на гостите, краен резултат',
  exact_ft: 'точен краен резултат',
};

/**
 * Стойността на всеки критерий. `null` значи "не се точкува" — източникът не е
 * дал полувреме. Това умишлено се различава от 0 ("сгрешил"), защото UI-ът и
 * класирането трябва да могат да покажат разликата.
 */
export type Breakdown = Record<Criterion, number | null>;

export type ScoreResult = {
  points: number;
  breakdown: Breakdown;
  /** true, когато ПП липсва и част от критериите са пропуснати */
  partial: boolean;
};

export function sign(goals: Goals): Sign {
  if (goals.home > goals.away) return '1';
  if (goals.home < goals.away) return '2';
  return 'X';
}

/** ВП = КР − ПП */
export function derive2h(ft: Goals, ht: Goals): Goals {
  return { home: ft.home - ht.home, away: ft.away - ht.away };
}

export type PredictionProblem =
  | 'ht_home_gt_ft_home'
  | 'ht_away_gt_ft_away'
  | 'negative'
  | 'not_integer'
  | 'too_large';

/** Горна граница на едно поле — пази базата от абсурдни числа. */
export const MAX_GOALS = 30;

export function validatePrediction(prediction: Prediction): PredictionProblem[] {
  const problems: PredictionProblem[] = [];
  const all = [
    prediction.ht.home,
    prediction.ht.away,
    prediction.ft.home,
    prediction.ft.away,
  ];

  if (all.some((n) => !Number.isInteger(n))) problems.push('not_integer');
  if (all.some((n) => n < 0)) problems.push('negative');
  if (all.some((n) => n > MAX_GOALS)) problems.push('too_large');

  // Само ако числата са смислени — иначе съобщението подвежда.
  if (problems.length === 0) {
    if (prediction.ht.home > prediction.ft.home) problems.push('ht_home_gt_ft_home');
    if (prediction.ht.away > prediction.ft.away) problems.push('ht_away_gt_ft_away');
  }

  return problems;
}

export const PROBLEM_MESSAGE: Record<PredictionProblem, string> = {
  ht_home_gt_ft_home:
    'Головете на домакина в първото полувреме не могат да са повече от крайния резултат.',
  ht_away_gt_ft_away:
    'Головете на гостите в първото полувреме не могат да са повече от крайния резултат.',
  negative: 'Головете не могат да са отрицателно число.',
  not_integer: 'Головете трябва да са цяло число.',
  too_large: `Головете не могат да са повече от ${MAX_GOALS}.`,
};

function emptyBreakdown(): Breakdown {
  return Object.fromEntries(CRITERIA.map((c) => [c, null])) as Breakdown;
}

function award(breakdown: Breakdown, criterion: Criterion, hit: boolean): void {
  breakdown[criterion] = hit ? POINTS[criterion] : 0;
}

/**
 * Точкува една прогноза срещу реалния резултат.
 *
 * Критериите са кумулативни: точен резултат носи и знака, и головете на всеки
 * отбор, и бонуса за точния резултат.
 */
export function scorePrediction(prediction: Prediction, actual: ActualResult): ScoreResult {
  const breakdown = emptyBreakdown();

  // Краен резултат — винаги се точкува, щом има мач с резултат.
  award(breakdown, 'sign_ft', sign(prediction.ft) === sign(actual.ft));
  award(breakdown, 'goals_ft_home', prediction.ft.home === actual.ft.home);
  award(breakdown, 'goals_ft_away', prediction.ft.away === actual.ft.away);
  award(
    breakdown,
    'exact_ft',
    prediction.ft.home === actual.ft.home && prediction.ft.away === actual.ft.away,
  );

  // Полувремената — само ако източникът ги е дал.
  if (actual.ht !== null) {
    const actualHt = actual.ht;
    const predicted2h = derive2h(prediction.ft, prediction.ht);
    const actual2h = derive2h(actual.ft, actualHt);

    award(breakdown, 'sign_ht', sign(prediction.ht) === sign(actualHt));
    award(breakdown, 'goals_ht_home', prediction.ht.home === actualHt.home);
    award(breakdown, 'goals_ht_away', prediction.ht.away === actualHt.away);
    award(
      breakdown,
      'exact_ht',
      prediction.ht.home === actualHt.home && prediction.ht.away === actualHt.away,
    );

    award(breakdown, 'sign_2h', sign(predicted2h) === sign(actual2h));
    award(breakdown, 'goals_2h_home', predicted2h.home === actual2h.home);
    award(breakdown, 'goals_2h_away', predicted2h.away === actual2h.away);
    award(
      breakdown,
      'exact_2h',
      predicted2h.home === actual2h.home && predicted2h.away === actual2h.away,
    );
  }

  const points = CRITERIA.reduce((sum, c) => sum + (breakdown[c] ?? 0), 0);

  return { points, breakdown, partial: actual.ht === null };
}
