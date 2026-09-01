'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { setUserPasswordAction, type AdminState } from '@/lib/admin/actions';
import { Banner } from '@/components/ui';

const initial: AdminState = {};

/**
 * Задаване на нова парола на конкретен профил от админ панела.
 *
 * Ползва native `<dialog>` като редакцията на мач: браузърът поема фокуса,
 * Esc и фона сам. Паролата се показва по желание — админът трябва да я
 * продиктува на човека, а познатите точки не помагат за това.
 */
export function UserPasswordDialog({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, action, pending] = useActionState(setUserPasswordAction, initial);

  // След успех полетата се изчистват, за да не остане паролата в страницата,
  // ако прозорецът се отвори пак за друг човек.
  useEffect(() => {
    if (state.message) {
      form.current?.reset();
      setVisible(false);
    }
  }, [state.message]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-line-strong hover:text-ink-soft"
      >
        смени парола
      </button>

      <dialog
        ref={dialog}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        className="w-[min(26rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-ink/30"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[12px] text-muted">Нова парола за</p>
            <h2 className="text-[15px] font-semibold tracking-tight">{name}</h2>
            <p className="text-[12px] text-muted">{email}</p>
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

        <form ref={form} action={action} className="flex flex-col gap-3 px-5 py-4">
          <input type="hidden" name="userId" value={userId} />

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Нова парола
            </span>
            <input
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Повтори
            </span>
            <input
              name="repeat"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={visible}
              onChange={(event) => setVisible(event.currentTarget.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            покажи паролата
          </label>

          <p className="text-[12px] text-muted">
            Поне 8 знака. Човекът ще бъде изхвърлен от всички устройства и трябва да влезе наново.
            Кажи му паролата лично — тя не се изпраща по имейл.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-brand-hover disabled:opacity-55"
            >
              {pending ? 'Сменя се…' : 'Смени паролата'}
            </button>

            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="text-[13px] text-muted hover:text-ink"
            >
              Отказ
            </button>
          </div>

          {state.error ? <Banner kind="error">{state.error}</Banner> : null}
          {state.message ? <Banner kind="ok">{state.message}</Banner> : null}
        </form>
      </dialog>
    </>
  );
}
