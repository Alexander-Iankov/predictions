/**
 * Числата в решетката на мача — прогноза, реален резултат и двоеточието.
 *
 * Фиксирана ширина на всяко число, за да не подскача колоната при две цифри.
 */

/** Разделителят между головете на двата отбора. */
export function Colon() {
  return (
    <span aria-hidden className="text-faint">
      :
    </span>
  );
}

/** Число от реалния резултат. */
export function ActualScore({ value }: { value: number | null }) {
  return (
    <span
      className={`w-6 text-center text-[15px] font-bold tabular-nums ${
        value === null ? 'text-faint' : 'text-ink'
      }`}
    >
      {value ?? '–'}
    </span>
  );
}

/** Число от моята прогноза, когато полетата вече не се редактират. */
export function PredictedScore({ value }: { value: number | null }) {
  return (
    <span
      className={`inline-grid h-9 w-14 place-items-center rounded-lg bg-surface-sunken text-[15px] font-semibold tabular-nums ${
        value === null ? 'text-faint' : 'text-brand'
      }`}
    >
      {value ?? '–'}
    </span>
  );
}
