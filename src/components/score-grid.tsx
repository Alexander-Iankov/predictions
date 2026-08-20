import type { ReactNode } from 'react';
import { TeamCrest } from '@/components/team-crest';

export type ScoreGridRow = {
  label: string;
  home: ReactNode;
  away: ReactNode;
  /** реалният резултат вдясно; null, докато мачът не е изигран */
  actual: ReactNode | null;
};

/**
 * Решетката на един мач: отборите на един ред, а под всеки от тях — неговите
 * полета за полувреме и краен резултат.
 *
 * Имената и полетата задължително минават през една и съща решетка, иначе
 * подравняването им е на око и се разпада при по-дълго име. Затова компонентът
 * приема готови клетки — формата слага полета за въвеждане, заключеният мач
 * слага числа, а колоните остават общи.
 */
export function ScoreGrid({
  homeTeam,
  awayTeam,
  homeCrestId,
  awayCrestId,
  rows,
  actualHeader,
}: {
  homeTeam: string;
  awayTeam: string;
  homeCrestId: number | null;
  awayCrestId: number | null;
  rows: ScoreGridRow[];
  /** заглавие над дясната колона; null скрива колоната */
  actualHeader: string | null;
}) {
  return (
    <div
      className="grid items-center gap-x-2 gap-y-2"
      style={{
        gridTemplateColumns: `auto minmax(0,1fr) minmax(0,1fr)${actualHeader ? ' auto' : ''}`,
      }}
    >
      <span aria-hidden />
      <TeamCell name={homeTeam} crestId={homeCrestId} />
      <TeamCell name={awayTeam} crestId={awayCrestId} />
      {actualHeader ? (
        <span className="w-[4.5rem] text-center text-[11px] font-semibold uppercase tracking-wider text-faint">
          {actualHeader}
        </span>
      ) : null}

      {rows.map((row) => (
        <Row key={row.label} row={row} withActual={actualHeader !== null} />
      ))}
    </div>
  );
}

function Row({ row, withActual }: { row: ScoreGridRow; withActual: boolean }) {
  return (
    <>
      <span className="w-7 text-[11px] font-semibold uppercase tracking-wider text-faint">
        {row.label}
      </span>
      <span className="flex justify-center">{row.home}</span>
      <span className="flex justify-center">{row.away}</span>
      {withActual ? (
        <span className="flex w-[4.5rem] items-center justify-center gap-1.5">{row.actual}</span>
      ) : null}
    </>
  );
}

function TeamCell({ name, crestId }: { name: string; crestId: number | null }) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-1 text-center sm:flex-row sm:justify-center sm:gap-2">
      <TeamCrest crestId={crestId} name={name} size={24} />
      <span className="text-[13px] font-semibold leading-tight text-ink sm:text-[14px]">{name}</span>
    </span>
  );
}
