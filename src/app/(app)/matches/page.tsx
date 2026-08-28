import Link from 'next/link';
import { requireUser } from '@/lib/auth/guards';
import { currentRoundNumber, getMatchesForUser, type MatchRow } from '@/lib/queries/matches';
import { formatSofiaDate, formatSofiaTime, toSofiaInputValue } from '@/lib/time';
import { LockCountdown } from '@/components/lock-countdown';
import { MatchEditDialog } from '@/components/match-edit-dialog';
import { PointsBreakdown } from '@/components/points-breakdown';
import { PredictionForm } from '@/components/prediction-form';
import { ScoreGrid } from '@/components/score-grid';
import { ActualScore, Colon, PredictedScore } from '@/components/score-values';
import { Badge, Banner, Card, PageTitle, Stat } from '@/components/ui';

export const metadata = { title: 'Мачове — Прогнози U-17' };

export default async function MatchesPage() {
  const user = await requireUser();
  const groups = await getMatchesForUser(user.id);
  const isAdmin = user.role === 'admin';

  if (groups.length === 0) {
    return (
      <Banner kind="info">
        Още няма мачове в базата. Админът трябва да пусне обновяване от източника.
      </Banner>
    );
  }

  const openRound = currentRoundNumber(groups);
  const all = groups.flatMap((group) => group.matches);
  const open = all.filter((match) => match.isOpen);
  const missing = open.filter((match) => match.myPrediction === null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <PageTitle>Мачове</PageTitle>
        <div className="flex flex-wrap gap-2">
          <Stat value={open.length} label="отворени за прогноза" />
          {missing.length > 0 ? <Stat value={missing.length} label="непопълнени" /> : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <RoundCard
            key={group.number}
            group={group}
            defaultOpen={group.number === openRound}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    </div>
  );
}

function RoundCard({
  group,
  defaultOpen,
  isAdmin,
}: {
  group: { number: number; label: string; matches: MatchRow[] };
  defaultOpen: boolean;
  isAdmin: boolean;
}) {
  const openCount = group.matches.filter((match) => match.isOpen).length;
  const played = group.matches.every((match) => match.ftHome !== null);

  return (
    <Card>
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer items-center gap-3 px-5 py-4">
          <span
            aria-hidden
            className="text-faint transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          <span className="font-semibold tracking-tight text-ink">{group.label}</span>
          <span className="ml-auto">
            {openCount > 0 ? (
              <Badge kind="open">{openCount} отворени</Badge>
            ) : played ? (
              <Badge kind="played">изигран</Badge>
            ) : (
              <Badge kind="locked">заключен</Badge>
            )}
          </span>
        </summary>

        <ul className="divide-y divide-line border-t border-line">
          {group.matches.map((match) => (
            <li key={match.id} className="px-5 py-4">
              <MatchRowView match={match} isAdmin={isAdmin} />
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function MatchRowView({ match, isAdmin }: { match: MatchRow; isAdmin: boolean }) {
  const played = match.ftHome !== null && match.ftAway !== null;

  const actual = {
    htHome: match.htHome,
    htAway: match.htAway,
    ftHome: match.ftHome,
    ftAway: match.ftAway,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 1. кога, състояние, колко остава */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[13px] tabular-nums text-muted">
          {formatSofiaDate(match.kickoffAt)}
          {match.timeKnown ? (
            <>
              <span className="mx-1.5 text-faint">·</span>
              <span className="font-medium text-ink-soft">{formatSofiaTime(match.kickoffAt)}</span>
            </>
          ) : (
            <span className="ml-1.5 text-faint">часът не е обявен</span>
          )}
        </span>

        <StatusBadge match={match} />

        {match.isOpen && match.timeKnown && match.predictionWindow === 'auto' ? (
          <LockCountdown lockAt={match.lockAt.toISOString()} />
        ) : null}

        <span className="ml-auto flex items-center gap-3 text-[13px] font-medium">
          {match.isRevealed ? (
            <Link href={`/matches/${match.id}`} className="text-brand hover:underline">
              {played ? 'резултати' : 'всички прогнози'} ({match.predictionCount})
            </Link>
          ) : null}

          {isAdmin ? (
            <MatchEditDialog
              matchId={match.id}
              homeTeam={match.homeTeam}
              awayTeam={match.awayTeam}
              roundLabel={match.roundLabel}
              kickoffValue={toSofiaInputValue(match.kickoffAt)}
              timeKnown={match.timeKnown}
              htHome={match.htHome}
              htAway={match.htAway}
              ftHome={match.ftHome}
              ftAway={match.ftAway}
              status={match.status}
              predictionWindow={match.predictionWindow}
            />
          ) : null}
        </span>
      </div>

      {/* 2. отборите, 3. полувреме, 4. краен резултат — в обща решетка */}
      {match.isOpen ? (
        <PredictionForm
          matchId={match.id}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          homeCrestId={match.homeCrestId}
          awayCrestId={match.awayCrestId}
          current={match.myPrediction}
          actual={actual}
        />
      ) : (
        <LockedScores match={match} played={played} />
      )}

      {!match.timeKnown && !played ? (
        <p className="text-xs text-muted">
          Прогнозите се затварят най-късно{' '}
          <span className="font-medium tabular-nums text-ink-soft">
            {formatSofiaTime(match.lockAt)}
          </span>{' '}
          на {formatSofiaDate(match.lockAt)}.
        </p>
      ) : null}

      {match.myPoints !== null && match.myBreakdown ? (
        <PointsBreakdown breakdown={match.myBreakdown} points={match.myPoints} />
      ) : null}
    </div>
  );
}

/** Заключен мач: моята прогноза под всеки отбор, реалният резултат вдясно. */
function LockedScores({ match, played }: { match: MatchRow; played: boolean }) {
  const prediction = match.myPrediction;

  const cell = (value: number | undefined) => <PredictedScore value={value ?? null} />;

  return (
    <div className="flex flex-col gap-2">
      <ScoreGrid
        homeTeam={match.homeTeam}
        awayTeam={match.awayTeam}
        homeCrestId={match.homeCrestId}
        awayCrestId={match.awayCrestId}
        actualHeader={played ? 'реален' : null}
        rows={[
          {
            label: 'ПП',
            home: cell(prediction?.htHome),
            away: cell(prediction?.htAway),
            actual: played ? (
              <>
                <ActualScore value={match.htHome} />
                <Colon />
                <ActualScore value={match.htAway} />
              </>
            ) : null,
          },
          {
            label: 'КР',
            home: cell(prediction?.ftHome),
            away: cell(prediction?.ftAway),
            actual: played ? (
              <>
                <ActualScore value={match.ftHome} />
                <Colon />
                <ActualScore value={match.ftAway} />
              </>
            ) : null,
          },
        ]}
      />

      {!prediction ? (
        <p className="text-[13px] text-muted">не си направил прогноза за този мач</p>
      ) : null}
    </div>
  );
}

function StatusBadge({ match }: { match: MatchRow }) {
  if (match.status === 'postponed') return <Badge kind="postponed">отложен</Badge>;

  if (match.ftHome !== null) {
    return match.htHome === null ? (
      <Badge kind="partial">без полувреме</Badge>
    ) : (
      <Badge kind="played">изигран</Badge>
    );
  }

  // Ръчното решение се показва честно: участниците виждат защо срокът не е
  // обичайният, вместо да гадаят.
  if (match.predictionWindow === 'open') return <Badge kind="open">отворен от админ</Badge>;
  if (match.predictionWindow === 'locked') return <Badge kind="locked">заключен от админ</Badge>;

  if (match.isOpen) return <Badge kind="open">отворен</Badge>;

  return <Badge kind="locked">заключен</Badge>;
}
