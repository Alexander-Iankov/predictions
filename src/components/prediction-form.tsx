'use client';

import { useActionState } from 'react';
import { savePredictionAction, type SaveState } from '@/lib/predictions/actions';
import { ScoreGrid } from '@/components/score-grid';
import { ActualScore, Colon } from '@/components/score-values';

const initial: SaveState = {};

export type PredictionFormProps = {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeCrestId: number | null;
  awayCrestId: number | null;
  current: { htHome: number; htAway: number; ftHome: number; ftAway: number } | null;
  /** Реалният резултат, ако мачът вече е изигран — показва се вдясно. */
  actual: {
    htHome: number | null;
    htAway: number | null;
    ftHome: number | null;
    ftAway: number | null;
  };
};

/**
 * Полетата за една прогноза — всяко точно под своя отбор.
 *
 * Формата обгражда цялата решетка, включително имената на отборите: само така
 * полето и името са в една и съща колона и остават подравнени при дълго име.
 *
 * Запазва се с изричен бутон: на телефон запис при всяко натискане на клавиш би
 * записвал половин въведено число.
 */
export function PredictionForm({
  matchId,
  homeTeam,
  awayTeam,
  homeCrestId,
  awayCrestId,
  current,
  actual,
}: PredictionFormProps) {
  const [state, action, pending] = useActionState(savePredictionAction, initial);
  const played = actual.ftHome !== null;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="matchId" value={matchId} />

      <ScoreGrid
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeCrestId={homeCrestId}
        awayCrestId={awayCrestId}
        actualHeader={played ? 'реален' : null}
        rows={[
          {
            label: 'ПП',
            home: (
              <ScoreInput
                name="htHome"
                defaultValue={current?.htHome}
                label={`${homeTeam}, първо полувреме`}
              />
            ),
            away: (
              <ScoreInput
                name="htAway"
                defaultValue={current?.htAway}
                label={`${awayTeam}, първо полувреме`}
              />
            ),
            actual: played ? (
              <>
                <ActualScore value={actual.htHome} />
                <Colon />
                <ActualScore value={actual.htAway} />
              </>
            ) : null,
          },
          {
            label: 'КР',
            home: (
              <ScoreInput
                name="ftHome"
                defaultValue={current?.ftHome}
                label={`${homeTeam}, краен резултат`}
              />
            ),
            away: (
              <ScoreInput
                name="ftAway"
                defaultValue={current?.ftAway}
                label={`${awayTeam}, краен резултат`}
              />
            ),
            actual: played ? (
              <>
                <ActualScore value={actual.ftHome} />
                <Colon />
                <ActualScore value={actual.ftAway} />
              </>
            ) : null,
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-brand-hover disabled:opacity-55"
        >
          {pending ? 'Запазване…' : current ? 'Промени' : 'Запази'}
        </button>

        {state.savedAt && !pending ? (
          <span className="text-[13px] font-medium text-brand">запазено ✓</span>
        ) : null}

        {state.error ? (
          <span className="text-[13px] text-danger" role="alert">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function ScoreInput({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue?: number;
  label: string;
}) {
  return (
    <input
      type="number"
      name={name}
      aria-label={label}
      defaultValue={defaultValue ?? ''}
      min={0}
      max={30}
      required
      inputMode="numeric"
      className="h-9 w-14 rounded-lg border border-line bg-surface text-center text-[15px] font-semibold tabular-nums text-ink outline-none transition hover:border-line-strong focus:border-brand focus:ring-2 focus:ring-brand/15"
    />
  );
}
