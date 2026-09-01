import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/guards';
import { listUsers, recentAudit } from '@/lib/queries/admin';
import { lastSuccessfulRun, recentRuns } from '@/lib/refresh';
import { formatSofiaDateTime } from '@/lib/time';
import { RefreshButton, ResetLinkForm, UserRoleForm, UserStatusForm } from '@/components/admin-forms';
import { UserPasswordDialog } from '@/components/user-password-dialog';
import { Badge, Banner, Card, CardHeader } from '@/components/ui';

export const metadata = { title: 'Админ — Прогнози U-17' };

export default async function AdminPage() {
  const admin = await requireAdmin();

  const [users, runs, lastSuccess, audit] = await Promise.all([
    listUsers(),
    recentRuns(10),
    lastSuccessfulRun(),
    recentAudit(15),
  ]);

  const pending = users.filter((user) => user.status === 'pending');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Админ</h1>
        <Link href="/admin/matches" className="text-sm text-brand hover:underline">
          Резултати и полувремена →
        </Link>
      </div>

      <Card>
        <CardHeader
          title="Обновяване от източника"
          subtitle="Кронът минава веднъж дневно към 07:00 българско време. Тук се дърпа веднага."
        />
        <div className="p-5">
          <RefreshButton
            lastSuccess={lastSuccess ? formatSofiaDateTime(lastSuccess) : null}
          />
        </div>
      </Card>

      {pending.length > 0 ? (
        <Banner kind="info">
          {pending.length}{' '}
          {pending.length === 1 ? 'профил чака одобрение' : 'профила чакат одобрение'}.
        </Banner>
      ) : null}

      <Card>
        <CardHeader title={`Профили (${users.length})`} />
        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faint">
                <th className="pb-2 pr-3 font-semibold">Име</th>
                <th className="pb-2 pr-3 font-semibold">Имейл</th>
                <th className="pb-2 pr-3 font-semibold">Статус</th>
                <th className="pb-2 pr-3 text-right font-semibold">Прогнози</th>
                <th className="pb-2 pr-3 font-semibold">Последно влизане</th>
                <th className="pb-2 font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3">
                    {user.firstName} {user.lastName}
                    {user.role === 'admin' ? (
                      <span className="ml-1 text-xs text-warn">админ</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-muted">{user.email}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{user.predictionCount}</td>
                  <td className="py-2 pr-3 text-xs text-muted">
                    {user.lastLoginAt ? formatSofiaDateTime(user.lastLoginAt) : '—'}
                  </td>
                  <td className="py-2">
                    {user.id === admin.id ? (
                      // Няма как да си блокираш или разадминиш собствения профил —
                      // затова и бутоните ги няма, вместо да отказват при клик.
                      <span className="text-xs text-muted">това си ти</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <UserStatusForm userId={user.id} status={user.status} />
                        <UserRoleForm userId={user.id} role={user.role} />
                        <UserPasswordDialog
                          userId={user.id}
                          name={`${user.firstName} ${user.lastName}`}
                          email={user.email}
                        />
                        <ResetLinkForm userId={user.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Последни обновявания" />
        <div className="overflow-x-auto p-4">
          {runs.length === 0 ? (
            <p className="text-sm text-muted">Още няма обновявания.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-faint">
                  <th className="pb-2 pr-3 font-semibold">Кога</th>
                  <th className="pb-2 pr-3 font-semibold">Как</th>
                  <th className="pb-2 pr-3 font-semibold">Статус</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Видени</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Променени</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Точкувани</th>
                  <th className="pb-2 font-semibold">Бележка</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      {formatSofiaDateTime(run.startedAt)}
                    </td>
                    <td className="py-2 pr-3 text-muted">{run.trigger}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          run.status === 'success'
                            ? 'text-brand'
                            : run.status === 'error'
                              ? 'text-danger'
                              : 'text-warn'
                        }
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{run.matchesSeen}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{run.matchesUpdated}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{run.predictionsScored}</td>
                    <td className="py-2 max-w-xs whitespace-pre-wrap break-words text-xs text-muted">
                      {run.error ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer list-none px-4 py-3 font-semibold">
            Дневник на ръчните промени
          </summary>
          <div className="border-t border-line p-4">
            {audit.length === 0 ? (
              <p className="text-sm text-muted">Още няма ръчни промени.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {audit.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap gap-x-3 text-muted">
                    <span className="text-xs tabular-nums">{formatSofiaDateTime(entry.at)}</span>
                    <span className="text-ink">{entry.actorName ?? 'изтрит профил'}</span>
                    <span>{entry.action}</span>
                    <span className="text-xs">{entry.entity}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'active' | 'blocked' }) {
  if (status === 'active') return <Badge kind="open">активен</Badge>;
  if (status === 'pending') return <Badge kind="partial">чака</Badge>;
  return <Badge kind="postponed">блокиран</Badge>;
}
