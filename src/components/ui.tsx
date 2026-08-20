import type { ComponentProps, ReactNode } from 'react';

/** Малки съставни части, за да не се преписват едни и същи класове навсякъде. */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-card border border-line bg-surface shadow-card ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function PageTitle({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">{children}</h1>
      {meta ? <span className="text-[13px] text-muted">{meta}</span> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input(props: ComponentProps<'input'>) {
  const { className = '', ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink shadow-xs outline-none transition placeholder:text-faint hover:border-line-strong focus:border-brand focus:ring-2 focus:ring-brand/15 ${className}`}
    />
  );
}

export function Button(props: ComponentProps<'button'>) {
  const { className = '', ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white shadow-xs transition hover:bg-brand-hover disabled:opacity-55 ${className}`}
    />
  );
}

export function Banner({ kind, children }: { kind: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-danger-line bg-danger-soft text-danger',
    ok: 'border-brand-line bg-brand-soft text-brand',
    info: 'border-info-line bg-info-soft text-ink-soft',
  }[kind];

  return (
    <p className={`rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed ${styles}`} role="status">
      {children}
    </p>
  );
}

export type BadgeKind = 'open' | 'locked' | 'played' | 'partial' | 'postponed' | 'neutral';

const BADGE_STYLES: Record<BadgeKind, string> = {
  open: 'border-brand-line bg-brand-soft text-brand',
  locked: 'border-line bg-surface-sunken text-muted',
  played: 'border-line-strong bg-surface-sunken text-ink-soft',
  partial: 'border-warn-line bg-warn-soft text-warn',
  postponed: 'border-warn-line bg-warn-soft text-warn',
  neutral: 'border-line bg-surface-sunken text-muted',
};

export function Badge({ kind, children }: { kind: BadgeKind; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_STYLES[kind]}`}
    >
      {children}
    </span>
  );
}

/** Малък числов показател: „12 точки", „8/9 прогнози". */
export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] shadow-xs">
      <span className="font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}
