import Link from 'next/link';

const RULES = [
  ['Прогнозираш', 'първо полувреме и краен резултат за всеки мач'],
  ['Промяташ', 'колкото пъти искаш, докато прозорецът е отворен'],
  ['Заключва се', '1 час преди началото — после прогнозите на всички стават видими'],
  ['Точките', 'се смятат автоматично от официалния график'],
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-9 px-5 py-14">
      <div className="flex flex-col gap-4">
        <span className="grid size-11 place-items-center rounded-xl bg-brand text-lg font-bold text-white">
          П
        </span>

        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink">
          Прогнози за Елитна група{' '}
          <span className="whitespace-nowrap text-brand">U-17</span>
        </h1>

        <p className="text-[15px] leading-relaxed text-ink-soft">
          Родителски турнир по познаване на резултатите от мачовете на децата. Графикът и
          резултатите идват от официалния източник, точките се смятат сами.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {RULES.map(([term, rest]) => (
          <li key={term} className="flex gap-3 text-[14px] leading-relaxed">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-line" aria-hidden />
            <span className="text-muted">
              <span className="font-semibold text-ink">{term}</span> {rest}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white shadow-xs transition hover:bg-brand-hover"
        >
          Вход
        </Link>
        <Link
          href="/register"
          className="rounded-xl border border-line bg-surface px-5 py-3 text-[15px] font-semibold text-ink-soft shadow-xs transition hover:border-line-strong hover:bg-surface-sunken"
        >
          Регистрация
        </Link>
      </div>
    </main>
  );
}
