import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/guards';
import { logoutAction } from '@/lib/auth/actions';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/matches" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-[13px] text-white">
              П
            </span>
            <span className="text-ink">
              Прогнози <span className="font-medium text-muted">U-17</span>
            </span>
          </Link>

          <nav className="flex items-center gap-5 text-[14px]">
            <NavLink href="/matches">Мачове</NavLink>
            <NavLink href="/leaderboard">Класиране</NavLink>
            <NavLink href="/me">Моите</NavLink>
            {user.role === 'admin' ? <NavLink href="/admin">Админ</NavLink> : null}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-[13px]">
            <Link
              href="/profile"
              className="hidden text-muted transition hover:text-brand sm:inline"
            >
              {user.firstName} {user.lastName}
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg px-2 py-1 text-muted transition hover:bg-surface-sunken hover:text-danger"
              >
                Изход
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink-soft transition hover:text-brand">
      {children}
    </Link>
  );
}
