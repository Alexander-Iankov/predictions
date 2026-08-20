import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import {
  getProfile,
  getProfileStats,
  getRevealedPredictionsOf,
  lastRoundWithPredictions,
  type ProfilePrediction,
} from '@/lib/queries/profile';
import { MAX_POINTS, derive2h } from '@/lib/scoring';
import { formatSofiaDate, formatSofiaTime } from '@/lib/time';
import { PointsBreakdown } from '@/components/points-breakdown';
import { ScoreGrid } from '@/components/score-grid';
import { ActualScore, Colon, PredictedScore } from '@/components/score-values';
import { Badge, Banner, Card, CardHeader, PageTitle, Stat } from '@/components/ui';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile(id).catch(() => null);

  return {
    title: profile
      ? `${profile.firstName} ${profile.lastName} — Прогнози U-17`
      : 'Участник — Прогнози U-17',
  };
}

export default async function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const { id } = await params;

  const profile = await getProfile(id);
  if (!profile || profile.status !== 'active') notFound();

  const [stats, lastRound] = await Promise.all([
    getProfileStats(profile.id),
    lastRoundWithPredictions(profile.id),
  ]);

  const [lastRoundPredictions, allRevealed] = await Promise.all([
    lastRound === null
      ? Promise.resolve([])
      : getRevealedPredictionsOf(profile.id, { roundNumber: lastRound }),
    getRevealedPredictionsOf(profile.id),
  ]);

  const isMe = profile.id === viewer.id;
  const earlier = allRevealed.filter((row) => row.roundNumber !== lastRound);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <PageTitle>
            {profile.firstName} {profile.lastName}
          </PageTitle>
          {isMe ? <Badge kind="neutral">това си ти</Badge> : null}
          <Link href="/leaderboard" className="text-[13px] font-medium text-brand hover:underline">
            ← Класиране
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <Stat value={stats.points} label="точки" />
          <Stat value={stats.played} label="изиграни мача" />
          <Stat value={stats.predictions} label="прогнози" />
          <Stat value={stats.exactFt} label="точни крайни резултата" />
          <Stat value={stats.exactHt} label="точни полувремена" />
        </div>
      </div>

      {stats.predictions === 0 ? (
        <Banner kind="info">Този участник още не е направил прогнози.</Banner>
      ) : null}

      {lastRound !== null && lastRoundPredictions.length > 0 ? (
        <Card>
          <CardHeader
            title={`Последен кръг — ${lastRoundPredictions[0]?.roundLabel ?? ''}`}
            subtitle={`Прогноза, реален резултат и спечелени точки. Максимум за мач: ${MAX_POINTS} точки.`}
          />
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {lastRoundPredictions.map((row) => (
              <li key={row.matchId} className="px-5 py-4">
                <PredictionRow row={row} showBreakdown />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {earlier.length > 0 ? (
        <Card>
          <details>
            <summary className="cursor-pointer px-5 py-4 font-semibold tracking-tight text-ink">
              По-ранни кръгове ({earlier.length})
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {earlier.map((row) => (
                <li key={row.matchId} className="px-5 py-4">
                  <PredictionRow row={row} showBreakdown={false} />
                </li>
              ))}
            </ul>
          </details>
        </Card>
      ) : null}

      {stats.predictions > 0 && allRevealed.length === 0 ? (
        <Banner kind="info">
          Прогнозите на този участник още не са публични — стават видими 1 час преди началото на
          съответния мач.
        </Banner>
      ) : null}
    </div>
  );
}

function PredictionRow({ row, showBreakdown }: { row: ProfilePrediction; showBreakdown: boolean }) {
  const played = row.ftHome !== null && row.ftAway !== null;
  const predicted2h = derive2h(
    { home: row.predFtHome, away: row.predFtAway },
    { home: row.predHtHome, away: row.predHtAway },
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[12px] text-muted">{row.roundLabel}</span>
        <span className="text-[12px] tabular-nums text-muted">
          {formatSofiaDate(row.kickoffAt)}
          {row.timeKnown ? `, ${formatSofiaTime(row.kickoffAt)}` : ''}
        </span>

        {played && row.htHome === null ? <Badge kind="partial">без полувреме</Badge> : null}
        {!played ? <Badge kind="locked">още не е изигран</Badge> : null}

        <span className="ml-auto flex items-center gap-3">
          {row.points !== null ? (
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[13px] font-semibold tabular-nums text-brand">
              {row.points} т.
            </span>
          ) : null}
          <Link
            href={`/matches/${row.matchId}`}
            className="text-[13px] font-medium text-brand hover:underline"
          >
            мачът
          </Link>
        </span>
      </div>

      <ScoreGrid
        homeTeam={row.homeTeam}
        awayTeam={row.awayTeam}
        homeCrestId={row.homeCrestId}
        awayCrestId={row.awayCrestId}
        actualHeader={played ? 'реален' : null}
        rows={[
          {
            label: 'ПП',
            home: <PredictedScore value={row.predHtHome} />,
            away: <PredictedScore value={row.predHtAway} />,
            actual: played ? (
              <>
                <ActualScore value={row.htHome} />
                <Colon />
                <ActualScore value={row.htAway} />
              </>
            ) : null,
          },
          {
            label: 'КР',
            home: <PredictedScore value={row.predFtHome} />,
            away: <PredictedScore value={row.predFtAway} />,
            actual: played ? (
              <>
                <ActualScore value={row.ftHome} />
                <Colon />
                <ActualScore value={row.ftAway} />
              </>
            ) : null,
          },
        ]}
      />

      <p className="text-[12px] text-muted">
        изведено второ полувреме: {predicted2h.home}:{predicted2h.away}
      </p>

      {showBreakdown && row.points !== null && row.breakdown ? (
        <PointsBreakdown breakdown={row.breakdown} points={row.points} />
      ) : null}
    </div>
  );
}
