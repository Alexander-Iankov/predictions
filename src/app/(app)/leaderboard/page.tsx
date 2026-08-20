import Link from 'next/link';
import { requireUser } from '@/lib/auth/guards';
import { getLeaderboard, getRoundOptions } from '@/lib/queries/leaderboard';
import { Rank } from '@/components/rank';
import { Banner, Card, CardHeader, PageTitle } from '@/components/ui';

export const metadata = { title: 'Класиране — Прогнози U-17' };

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const user = await requireUser();
  const { round } = await searchParams;

  const roundNumber = round && /^\d+$/.test(round) ? Number(round) : undefined;
  const [rows, rounds] = await Promise.all([getLeaderboard(roundNumber), getRoundOptions()]);

  const anyPoints = rows.some((row) => row.scored > 0);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle meta={roundNumber ? `кръг ${roundNumber}` : 'всички кръгове'}>Класиране</PageTitle>

      <nav className="flex flex-wrap gap-1.5 text-[13px]">
        <RoundLink active={roundNumber === undefined} label="Общо" href="/leaderboard" />
        {rounds.map((option) => (
          <RoundLink
            key={option.number}
            active={roundNumber === option.number}
            label={option.label.replace(' кръг', '')}
            href={`/leaderboard?round=${option.number}`}
          />
        ))}
      </nav>

      {!anyPoints ? (
        <Banner kind="info">
          Още няма точкувани прогнози
          {roundNumber ? ' в този кръг' : ''}. Точките се появяват, след като мачовете се изиграят и
          резултатите влязат от източника.
        </Banner>
      ) : null}

      <Card>
        <CardHeader
          title={roundNumber ? `Кръг ${roundNumber}` : 'Общо класиране'}
          subtitle="При равни точки водят повече познати точни крайни резултати, после точни полувремена."
        />

        <div className="overflow-x-auto px-5 pb-5 pt-4">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="pb-2.5 pr-2 font-semibold">#</th>
                <th className="pb-2.5 pr-3 font-semibold">Участник</th>
                <th className="pb-2.5 pr-3 text-right font-semibold">Точки</th>
                <th className="pb-2.5 pr-3 text-right font-semibold">Точни КР</th>
                <th className="pb-2.5 pr-3 text-right font-semibold">Точни ПП</th>
                <th className="pb-2.5 text-right font-semibold">Прогнози</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isMe = row.userId === user.id;

                return (
                  <tr
                    key={row.userId}
                    className={`border-t border-line ${isMe ? 'bg-brand-soft/50' : ''}`}
                  >
                    <td className="py-2.5 pr-2">
                      <Rank place={index + 1} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/participants/${row.userId}`}
                        className={`hover:text-brand hover:underline ${
                          isMe ? 'font-semibold text-ink' : 'text-ink'
                        }`}
                      >
                        {row.firstName} {row.lastName}
                      </Link>
                      {isMe ? <span className="ml-1.5 text-xs text-muted">(ти)</span> : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-[16px] font-bold tabular-nums text-ink">
                      {row.points}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">
                      {row.exactFt}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">
                      {row.exactHt}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted">
                      {row.scored}/{row.made}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="mt-3.5 text-xs text-muted">
            „Прогнози" показва колко от направените прогнози са вече точкувани.
          </p>
        </div>
      </Card>
    </div>
  );
}

function RoundLink({ active, label, href }: { active: boolean; label: string; href: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-2.5 py-1 font-medium transition ${
        active
          ? 'border-brand-line bg-brand-soft text-brand'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink-soft'
      }`}
    >
      {label}
    </Link>
  );
}
