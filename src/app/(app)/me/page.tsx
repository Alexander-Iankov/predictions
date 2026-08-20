import Link from 'next/link';
import { requireUser } from '@/lib/auth/guards';
import { getMatchesForUser } from '@/lib/queries/matches';
import { MAX_POINTS, derive2h } from '@/lib/scoring';
import { formatSofiaDate, formatSofiaTime } from '@/lib/time';
import { PointsBreakdown } from '@/components/points-breakdown';
import { TeamCrest } from '@/components/team-crest';
import { Badge, Banner, Card, CardHeader, PageTitle, Stat } from '@/components/ui';

export const metadata = { title: 'Моите прогнози — Прогнози U-17' };

export default async function MyPredictionsPage() {
  const user = await requireUser();
  const groups = await getMatchesForUser(user.id);

  const mine = groups
    .flatMap((group) => group.matches)
    .filter((match) => match.myPrediction !== null);

  if (mine.length === 0) {
    return (
      <Banner kind="info">
        Още не си направил прогнози.{' '}
        <Link href="/matches" className="font-medium text-brand hover:underline">
          Към мачовете
        </Link>
      </Banner>
    );
  }

  const scored = mine.filter((match) => match.myPoints !== null);
  const total = scored.reduce((sum, match) => sum + (match.myPoints ?? 0), 0);
  const possible = scored.length * MAX_POINTS;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <PageTitle>Моите прогнози</PageTitle>
        <div className="flex flex-wrap gap-2">
          <Stat value={mine.length} label="прогнози" />
          <Stat value={scored.length} label="точкувани" />
          <Stat value={total} label="точки" />
          {possible > 0 ? <Stat value={`от ${possible}`} label="възможни" /> : null}
        </div>
      </div>

      <Card>
        <CardHeader title="По мачове" subtitle={`Максимум за един мач: ${MAX_POINTS} точки.`} />
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {mine.map((match) => {
            const prediction = match.myPrediction;
            if (!prediction) return null;

            const ht = { home: prediction.htHome, away: prediction.htAway };
            const ft = { home: prediction.ftHome, away: prediction.ftAway };
            const secondHalf = derive2h(ft, ht);
            const played = match.ftHome !== null;

            return (
              <li key={match.id} className="flex flex-col gap-2.5 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-full text-[12px] tabular-nums text-muted sm:w-auto">
                  {formatSofiaDate(match.kickoffAt)}
                  {match.timeKnown ? `, ${formatSofiaTime(match.kickoffAt)}` : ''}
                </span>

                <span className="flex min-w-0 items-center gap-2 text-[14px]">
                  <TeamCrest crestId={match.homeCrestId} name={match.homeTeam} size={22} />
                  <span className="truncate font-medium text-ink">{match.homeTeam}</span>
                  <span className="text-faint">—</span>
                  <TeamCrest crestId={match.awayCrestId} name={match.awayTeam} size={22} />
                  <span className="truncate font-medium text-ink">{match.awayTeam}</span>
                </span>

                <span className="text-[13px] tabular-nums text-ink-soft">
                  <Tag>ПП</Tag> {ht.home}:{ht.away} <Tag>ВП</Tag> {secondHalf.home}:{secondHalf.away}{' '}
                  <Tag>КР</Tag> {ft.home}:{ft.away}
                </span>

                {played ? (
                  <span className="text-[13px] font-medium tabular-nums text-ink">
                    реално {match.ftHome}:{match.ftAway}
                    {match.htHome !== null ? (
                      <span className="font-normal text-muted"> ({match.htHome}:{match.htAway})</span>
                    ) : null}
                  </span>
                ) : null}

                {match.myPartial ? <Badge kind="partial">без полувреме</Badge> : null}

                <span className="ml-auto flex items-center gap-3">
                  {match.myPoints === null ? (
                    <span className="text-[13px] text-muted">още не е точкуван</span>
                  ) : (
                    <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[13px] font-semibold tabular-nums text-brand">
                      {match.myPoints} т.
                    </span>
                  )}

                  {match.isRevealed ? (
                    <Link
                      href={`/matches/${match.id}`}
                      className="text-[13px] font-medium text-brand hover:underline"
                    >
                      детайли
                    </Link>
                  ) : null}
                </span>
                </div>

                {match.myPoints !== null && match.myBreakdown ? (
                  <PointsBreakdown breakdown={match.myBreakdown} points={match.myPoints} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase text-faint">{children}</span>;
}
