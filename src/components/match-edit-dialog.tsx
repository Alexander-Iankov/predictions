'use client';

import { useRef } from 'react';
import { MatchDetailsForm, PredictionWindowForm } from '@/components/admin-forms';

export type MatchEditDialogProps = {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  roundLabel: string;
  /** "2026-08-21T09:30" в софийско време */
  kickoffValue: string;
  timeKnown: boolean;
  htHome: number | null;
  htAway: number | null;
  ftHome: number | null;
  ftAway: number | null;
  status: 'scheduled' | 'finished' | 'postponed';
  predictionWindow: 'auto' | 'open' | 'locked';
};

/**
 * Редакция на мач направо от списъка, без напускане на страницата.
 *
 * Ползва native `<dialog>`: браузърът сам поема фокуса, затварянето с Esc и
 * фона — неща, които иначе се дописват на ръка и обикновено се дописват грешно.
 */
export function MatchEditDialog(props: MatchEditDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="text-[13px] font-medium text-warn hover:underline"
      >
        редактирай
      </button>

      <dialog
        ref={dialog}
        // Щракване върху фона затваря — целта се пада на самия <dialog>,
        // защото съдържанието е в отделен елемент вътре.
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        className="w-[min(34rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-ink/30"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[12px] text-muted">{props.roundLabel}</p>
            <h2 className="text-[15px] font-semibold tracking-tight">
              {props.homeTeam} <span className="font-normal text-faint">—</span> {props.awayTeam}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Затвори"
            className="rounded-lg px-2 py-1 text-[18px] leading-none text-muted transition hover:bg-surface-sunken hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <PredictionWindowForm
            matchId={props.matchId}
            window={props.predictionWindow}
            isFinished={props.status === 'finished'}
          />

          <hr className="border-line" />

          <MatchDetailsForm
            matchId={props.matchId}
            kickoffValue={props.kickoffValue}
            timeKnown={props.timeKnown}
            htHome={props.htHome}
            htAway={props.htAway}
            ftHome={props.ftHome}
            ftAway={props.ftAway}
            status={props.status}
          />
        </div>
      </dialog>
    </>
  );
}
