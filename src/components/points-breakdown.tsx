import {
  CRITERION_GROUPS,
  CRITERION_SHORT,
  MAX_POINTS,
  POINTS,
  type Breakdown,
} from '@/lib/scoring';

/**
 * Разбивка на точките за един мач — кой критерий колко е донесъл.
 *
 * Показва спечелено от възможно за всеки ред, защото „1" само по себе си не
 * казва дали е пълен успех, или е взета едната от две точки.
 *
 * Критерий със стойност `null` не се точкува, защото източникът не е дал
 * полувреме. Това не е същото като 0 за сгрешена прогноза и се показва различно.
 */
export function PointsBreakdown({
  breakdown,
  points,
}: {
  breakdown: Breakdown;
  points: number;
}) {
  const partial = CRITERION_GROUPS.some((group) =>
    group.criteria.some((criterion) => breakdown[criterion] === null),
  );

  const possible = partial
    ? CRITERION_GROUPS.flatMap((group) => group.criteria)
        .filter((criterion) => breakdown[criterion] !== null)
        .reduce((sum, criterion) => sum + POINTS[criterion], 0)
    : MAX_POINTS;

  return (
    <details className="group rounded-xl border border-line bg-surface-sunken">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px]">
        <span aria-hidden className="text-faint transition-transform group-open:rotate-90">
          ▸
        </span>
        <span className="font-medium text-ink-soft">разбивка на точките</span>
        <span className="ml-auto font-semibold tabular-nums text-ink">
          {points}
          <span className="font-normal text-muted"> / {possible}</span>
        </span>
      </summary>

      <div className="border-t border-line px-3 py-2.5">
        <dl className="flex flex-col gap-2.5">
          {CRITERION_GROUPS.map((group) => {
            const unavailable = group.criteria.every(
              (criterion) => breakdown[criterion] === null,
            );

            return (
              <div key={group.label}>
                <dt className="mb-1 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                  {group.label}
                  {unavailable ? (
                    <span className="font-normal normal-case tracking-normal text-muted">
                      не се точкува — източникът не е дал полувремето
                    </span>
                  ) : null}
                </dt>

                <dd className="flex flex-col gap-0.5">
                  {group.criteria.map((criterion) => {
                    const earned = breakdown[criterion];
                    const max = POINTS[criterion];

                    return (
                      <div
                        key={criterion}
                        className="flex items-baseline gap-2 text-[13px]"
                      >
                        <span
                          className={earned === null ? 'text-faint' : 'text-ink-soft'}
                        >
                          {CRITERION_SHORT[criterion]}
                        </span>
                        <span
                          aria-hidden
                          className="min-w-4 flex-1 border-b border-dotted border-line-strong"
                        />
                        <span
                          className={`tabular-nums ${
                            earned === null
                              ? 'text-faint'
                              : earned > 0
                                ? 'font-semibold text-brand'
                                : 'text-muted'
                          }`}
                        >
                          {earned === null ? '–' : earned}
                          <span className="font-normal text-faint"> / {max}</span>
                        </span>
                      </div>
                    );
                  })}
                </dd>
              </div>
            );
          })}
        </dl>

        {partial ? (
          <p className="mt-2.5 border-t border-line pt-2 text-[12px] text-muted">
            Максимумът за този мач е {possible}, а не {MAX_POINTS} — критериите за полувремената
            отпадат. Щом полувремето влезе, точките се преизчисляват.
          </p>
        ) : null}
      </div>
    </details>
  );
}
