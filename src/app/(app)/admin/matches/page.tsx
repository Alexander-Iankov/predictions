import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/guards';
import { firstUnplayedRound, matchesInRound, type AdminMatchRow } from '@/lib/queries/admin';
import { getRoundOptions } from '@/lib/queries/leaderboard';
import { formatSofiaDate, formatSofiaTime, toSofiaInputValue } from '@/lib/time';
import {
  MatchDetailsForm,
  PredictionWindowForm,
  RoundLockToggle,
} from '@/components/admin-forms';
import { TeamCrest } from '@/components/team-crest';
import { Badge, Banner, Card, CardHeader, PageTitle } from '@/components/ui';

export const metadata = { title: 'Мачове — Админ' };

export default async function AdminMatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  await requireAdmin();

  const { round } = await searchParams;
  const [rounds, unplayed] = await Promise.all([getRoundOptions(), firstUnplayedRound()]);

  // По подразбиране: първият кръг, в който има още неизигран мач.
  const requested = round && /^\d+$/.test(round) ? Number(round) : null;
  const selected = requested ?? unplayed ?? rounds[0]?.number ?? 1;
  const selectedRound = rounds.find((option) => option.number === selected);
  const roundMatches = await matchesInRound(selected);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle>Мачове</PageTitle>
        <Link href="/admin" className="text-[13px] font-medium text-brand hover:underline">
          ← Админ
        </Link>
      </div>

      <Card>
        <CardHeader
          title="Редакция"
          subtitle="Въведи полувреме, което източникът не е дал, или премести мач и сложи резултат, за да провериш нещо. Точките се преизчисляват веднага."
        />

        <div className="flex flex-col gap-3 px-5 pt-4">
          <nav className="flex flex-wrap gap-1.5 text-[13px]">
            {rounds.map((option) => (
              <Link
                key={option.number}
                href={`/admin/matches?round=${option.number}`}
                className={`rounded-full border px-2.5 py-1 font-medium transition ${
                  option.number === selected
                    ? 'border-brand-line bg-brand-soft text-brand'
                    : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink-soft'
                }`}
              >
                {option.label.replace(' кръг', '')}
                {option.lockedForUpdates ? <span className="ml-1">🔒</span> : null}
              </Link>
            ))}
          </nav>

          {selectedRound ? (
            <RoundLockToggle
              roundNumber={selectedRound.number}
              roundLabel={selectedRound.label}
              locked={selectedRound.lockedForUpdates}
            />
          ) : null}
        </div>

        <ul className="mt-4 divide-y divide-line border-t border-line">
          {roundMatches.map((match) => (
            <li key={match.id} className="flex flex-col gap-3 px-5 py-4">
              <MatchHeading match={match} />
              <MatchEditor match={match} />
            </li>
          ))}
        </ul>
      </Card>

      <Banner kind="info">
        Промените тук са ръчни и влизат в дневника на админ панела. Обновяването от източника
        привежда час, дата и резултати към неговите данни — единственото, което ги пази, е
        замразяването на кръга.
      </Banner>
    </div>
  );
}

/** Една и съща форма и в двата раздела — една логика, едно поведение. */
function MatchEditor({ match }: { match: AdminMatchRow }) {
  return (
    <div className="flex flex-col gap-3">
      <PredictionWindowForm
        matchId={match.id}
        window={match.predictionWindow}
        isFinished={match.status === 'finished'}
      />

      <MatchDetailsForm
        matchId={match.id}
        kickoffValue={toSofiaInputValue(match.kickoffAt)}
        timeKnown={match.timeKnown}
        htHome={match.htHome}
        htAway={match.htAway}
        ftHome={match.ftHome}
        ftAway={match.ftAway}
        status={match.status}
      />
    </div>
  );
}

function MatchHeading({ match }: { match: AdminMatchRow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-[12px] text-muted">{match.roundLabel}</span>
      <span className="text-[12px] tabular-nums text-muted">
        {formatSofiaDate(match.kickoffAt)}
        {match.timeKnown ? `, ${formatSofiaTime(match.kickoffAt)}` : ' · часът не е обявен'}
      </span>

      <span className="flex min-w-0 items-center gap-2 text-[14px]">
        <TeamCrest crestId={match.homeCrestId} name={match.homeTeam} size={22} />
        <span className="truncate font-medium text-ink">{match.homeTeam}</span>
        <span className="text-faint">—</span>
        <TeamCrest crestId={match.awayCrestId} name={match.awayTeam} size={22} />
        <span className="truncate font-medium text-ink">{match.awayTeam}</span>
      </span>

      {match.ftHome !== null ? (
        <span className="font-bold tabular-nums text-ink">
          {match.ftHome}:{match.ftAway}
          {match.htHome !== null ? (
            <span className="ml-1 text-[12px] font-normal text-muted">
              ({match.htHome}:{match.htAway})
            </span>
          ) : null}
        </span>
      ) : null}

      {match.status === 'postponed' ? <Badge kind="postponed">отложен</Badge> : null}
      {match.ftHome !== null && match.htHome === null ? (
        <Badge kind="partial">без полувреме</Badge>
      ) : null}
      {match.htSource === 'manual' || match.ftSource === 'manual' ? (
        <Badge kind="neutral">ръчно</Badge>
      ) : null}

      <span className="ml-auto text-[12px] text-muted">{match.predictionCount} прогнози</span>
    </div>
  );
}
