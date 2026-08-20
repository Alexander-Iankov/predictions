import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-5 py-12">
      <Link
        href="/"
        className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-ink"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-brand text-[13px] text-white">
          П
        </span>
        Прогнози <span className="font-medium text-muted">U-17</span>
      </Link>

      {children}
    </main>
  );
}
