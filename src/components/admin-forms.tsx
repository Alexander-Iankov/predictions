'use client';

import { useActionState } from 'react';
import {
  createResetLinkAction,
  refreshAction,
  setMatchDetailsAction,
  setRoundLockAction,
  setUserRoleAction,
  setUserStatusAction,
  type AdminState,
} from '@/lib/admin/actions';
import { Banner } from '@/components/ui';

const initial: AdminState = {};

/** Общ ред със съобщение за резултата от действието. */
function Result({ state }: { state: AdminState }) {
  if (state.error) return <Banner kind="error">{state.error}</Banner>;
  if (state.message) return <Banner kind="ok">{state.message}</Banner>;
  return null;
}

export function RefreshButton({ lastSuccess }: { lastSuccess: string | null }) {
  const [state, action, pending] = useActionState(refreshAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-brand-soft px-4 py-2.5 font-semibold text-brand hover:brightness-125 disabled:opacity-50"
        >
          {pending ? 'Обновява се…' : 'Обнови от източника'}
        </button>
        <span className="text-sm text-muted">
          {lastSuccess ? `последно успешно: ${lastSuccess}` : 'още няма успешно обновяване'}
        </span>
      </div>
      <Result state={state} />
    </form>
  );
}

export function UserStatusForm({
  userId,
  status,
}: {
  userId: string;
  status: 'pending' | 'active' | 'blocked';
}) {
  const [state, action, pending] = useActionState(setUserStatusAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />

      {status !== 'active' ? (
        <SmallButton name="status" value="active" pending={pending} tone="ok">
          одобри
        </SmallButton>
      ) : null}

      {status !== 'blocked' ? (
        <SmallButton name="status" value="blocked" pending={pending} tone="err">
          блокирай
        </SmallButton>
      ) : null}

      {status === 'blocked' ? (
        <SmallButton name="status" value="pending" pending={pending} tone="muted">
          върни в чакащи
        </SmallButton>
      ) : null}

      <div className="w-full">
        <Result state={state} />
      </div>
    </form>
  );
}

export function UserRoleForm({ userId, role }: { userId: string; role: 'user' | 'admin' }) {
  const [state, action, pending] = useActionState(setUserRoleAction, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <SmallButton
        name="role"
        value={role === 'admin' ? 'user' : 'admin'}
        pending={pending}
        tone="muted"
      >
        {role === 'admin' ? 'отнеми админ' : 'направи админ'}
      </SmallButton>
      <div className="w-full">
        <Result state={state} />
      </div>
    </form>
  );
}

export function ResetLinkForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(createResetLinkAction, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <SmallButton pending={pending} tone="muted">
        линк за нова парола
      </SmallButton>
      {state.message ? (
        <code className="block break-all rounded-lg border border-line bg-surface-sunken px-2 py-1 text-xs">
          {state.message}
        </code>
      ) : null}
      {state.error ? <Banner kind="error">{state.error}</Banner> : null}
    </form>
  );
}

/**
 * Замразяване на кръг за обновяване.
 *
 * Чекбоксът праща формата веднага — отделен бутон „запази" за една отметка е
 * повече работа, отколкото полза.
 */
export function RoundLockToggle({
  roundNumber,
  roundLabel,
  locked,
}: {
  roundNumber: number;
  roundLabel: string;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(setRoundLockAction, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="roundNumber" value={roundNumber} />

      {/*
        Без скрито поле за "изключено": незначена отметка изобщо не се праща, а
        действието чете липсата като false. Скрито поле със същото име би било
        по-лошо от нищо — formData.get() връща първата стойност, тоест винаги
        неговата.
      */}
      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        <input
          type="checkbox"
          name="locked"
          value="1"
          defaultChecked={locked}
          disabled={pending}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="size-4 accent-[var(--color-brand)]"
        />
        <span>
          Замрази <span className="font-medium text-ink">{roundLabel}</span> — обновяването от
          източника да не пипа мачовете в него
        </span>
      </label>

      <Result state={state} />
    </form>
  );
}

/**
 * Пълна редакция на мач — начален час, полувреме, краен резултат и статус.
 *
 * Оттук се въвежда полувремето, което източникът не е публикувал, и оттук се
 * нагласят тестови случаи: местиш мач на след час и половина, за да видиш
 * отброяването и заключването, или слагаш резултат, за да провериш точкуването.
 */
export function MatchDetailsForm({
  matchId,
  kickoffValue,
  timeKnown,
  htHome,
  htAway,
  ftHome,
  ftAway,
  status,
}: {
  matchId: number;
  /** "2026-08-21T09:30" в софийско време */
  kickoffValue: string;
  timeKnown: boolean;
  htHome: number | null;
  htAway: number | null;
  ftHome: number | null;
  ftAway: number | null;
  status: 'scheduled' | 'finished' | 'postponed';
}) {
  const [state, action, pending] = useActionState(setMatchDetailsAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="matchId" value={matchId} />

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Начало (софийско време)
          </span>
          <input
            type="datetime-local"
            name="kickoff"
            defaultValue={kickoffValue}
            required
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-ink outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Първо полувреме
          </span>
          <span className="flex items-center gap-1.5">
            <GoalInput name="htHome" defaultValue={htHome} label="първо полувреме, домакин" />
            <span className="text-faint">:</span>
            <GoalInput name="htAway" defaultValue={htAway} label="първо полувреме, гост" />
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Краен резултат
          </span>
          <span className="flex items-center gap-1.5">
            <GoalInput name="ftHome" defaultValue={ftHome} label="краен резултат, домакин" />
            <span className="text-faint">:</span>
            <GoalInput name="ftAway" defaultValue={ftAway} label="краен резултат, гост" />
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Статус
          </span>
          <select
            name="status"
            defaultValue={status}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
          >
            <option value="scheduled">в графика</option>
            <option value="finished">изигран</option>
            <option value="postponed">отложен</option>
          </select>
        </label>

        <label className="flex items-center gap-2 pb-1.5 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            name="timeKnown"
            value="1"
            defaultChecked={timeKnown}
            className="size-4 accent-[var(--color-brand)]"
          />
          часът е обявен
        </label>

        <SmallButton pending={pending} tone="ok">
          {pending ? 'записва…' : 'запиши'}
        </SmallButton>
      </div>

      <p className="text-[12px] text-muted">
        Празен краен резултат изчиства и него, и полувремето. Резултат без полувреме е нормален —
        точкуват се само критериите за краен резултат. Ръчно въведените резултати не се презаписват
        от източника, но <strong className="font-semibold">часът се презаписва</strong> — следващото
        обновяване връща официалния.
      </p>

      <Result state={state} />
    </form>
  );
}

function GoalInput({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: number | null;
  label: string;
}) {
  return (
    <input
      type="number"
      name={name}
      aria-label={label}
      defaultValue={defaultValue ?? ''}
      min={0}
      max={99}
      placeholder="–"
      className="w-14 rounded-lg border border-line bg-surface px-2 py-1.5 text-center text-[13px] tabular-nums text-ink outline-none focus:border-brand"
    />
  );
}

function SmallButton({
  children,
  pending,
  tone,
  name,
  value,
}: {
  children: React.ReactNode;
  pending: boolean;
  tone: 'ok' | 'err' | 'muted';
  name?: string;
  value?: string;
}) {
  const tones = {
    ok: 'border-brand-line/40 text-brand hover:bg-brand-soft',
    err: 'border-danger-line/40 text-danger hover:bg-danger-soft',
    muted: 'border-line text-muted hover:border-line-strong',
  };

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
