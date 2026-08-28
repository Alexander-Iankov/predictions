import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { getMatchDetail, getRevealedPredictions } from '@/lib/queries/match-detail';
import { CRITERIA, CRITERION_LABEL, MAX_POINTS, derive2h, sign } from '@/lib/scoring';
import { formatSofiaDate, formatSofiaTime } from '@/lib/time';
import { LockCountdown } from '@/components/lock-countdown';
import { Rank, placesByPoints } from '@/components/rank';
import { TeamCrest } from '@/components/team-crest';
import { Badge, Banner, Card, CardHeader } from '@/components/ui';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = Number.isInteger(Number(id)) ? await getMatchDetail(Number(id)) : null;

  return {
    title: match
      ? `${match.homeTeam} — ${match.awayTeam} · Прогнози U-17`
      : 'Мач — Прогнози U-17',
  };
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const matchId = Number(id);
  if (!Number.isInteger(matchId)) notFound();

  const match = await getMatchDetail(matchId);
  if (!match) notFound();

  const predictions = await getRevealedPredictions(matchId);
  const played = match.ftHome !== null && match.ftAway !== null;

  // Заявката вече ги връща подредени по точки — тук само се раздават местата.
  const places = placesByPoints(predictions.map((prediction) => prediction.points));

  return (
    <div className="flex flex-col gap-4">
      <Link href="/matches" className="text-sm text-muted hover:text-brand">
        ← Всички мачове
      </Link>

      <Card>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
            <span className="font-medium text-muted">{match.roundLabel}</span>
            <span className="tabular-nums text-muted">
              {formatSofiaDate(match.kickoffAt)}
              {match.timeKnown ? `, ${formatSofiaTime(match.kickoffAt)}` : ' · часът не е обявен'}
            </span>

            {played && match.htHome === null ? (
              <Badge kind="partial">без полувреме</Badge>
            ) : null}

            {/* Отброяване има смисъл само когато срокът важи. */}
            {match.isOpen && match.timeKnown && match.predictionWindow === 'auto' ? (
              <LockCountdown lockAt={match.lockAt.toISOString()} />
            ) : null}

            {match.predictionWindow === 'open' ? (
              <Badge kind="open">отворен от админ</Badge>
            ) : null}
            {match.predictionWindow === 'locked' ? (
              <Badge kind="locked">заключен от админ</Badge>
            ) : null}
          </div>

          <h1 className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[18px] font-bold tracking-tight">
            <span className="flex items-center gap-2.5">
              <TeamCrest crestId={match.homeCrestId} name={match.homeTeam} size={34} />
              {match.homeTeam}
            </span>

            {played ? (
              <span className="rounded-lg bg-surface-sunken px-3 py-1 tabular-nums text-ink">
                {match.ftHome}
                <span className="mx-1 text-faint">:</span>
                {match.ftAway}
                {match.htHome !== null ? (
                  <span className="ml-2 text-[13px] font-medium text-muted">
                    ({match.htHome}:{match.htAway})
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-faint">—</span>
            )}

            <span className="flex items-center gap-2.5">
              <TeamCrest crestId={match.awayCrestId} name={match.awayTeam} size={34} />
              {match.awayTeam}
            </span>
          </h1>
        </div>
      </Card>

      {played && match.htHome === null ? (
        <Banner kind="info">
          Източникът не е публикувал резултат от първото полувреме. Точкуват се само критериите за
          краен резултат; щом полувремето се появи, точките се преизчисляват автоматично.
        </Banner>
      ) : null}

      {!match.isRevealed ? (
        <Banner kind="info">
          {match.predictionWindow === 'open' ? (
            <>
              Админът е отворил прогнозите за този мач. Докато е така, всеки вижда само своята —
              иначе отворилият би могъл да препише чуждите.
            </>
          ) : match.status === 'postponed' ? (
            <>
              Мачът е отложен. Прогнозите остават скрити, докато не се насрочи нов час — иначе биха
              дали предимство, когато се играе.
            </>
          ) : (
            <>
              Прогнозите на останалите се виждат от{' '}
              <span className="tabular-nums">{formatSofiaTime(match.lockAt)}</span> на{' '}
              {formatSofiaDate(match.lockAt)} — 1 час преди началото. Дотогава всеки вижда само
              своята.
            </>
          )}
        </Banner>
      ) : predictions.length === 0 ? (
        <Banner kind="info">Никой не е направил прогноза за този мач.</Banner>
      ) : (
        <Card>
          <CardHeader
            title={played ? `Резултати (${predictions.length})` : `Прогнози (${predictions.length})`}
            subtitle={
              played
                ? `Подредени по спечелени точки. Максимум за мач: ${MAX_POINTS} точки.`
                : 'Мачът още не е изигран — точките се появяват след резултата.'
            }
          />
          <div className="overflow-x-auto px-5 pb-5 pt-4">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                  {played ? <th className="pb-2.5 pr-2 font-semibold">#</th> : null}
                  <th className="pb-2.5 pr-3 font-semibold">Участник</th>
                  <th className="pb-2.5 pr-3 font-semibold">ПП</th>
                  <th className="pb-2.5 pr-3 font-semibold">ВП</th>
                  <th className="pb-2.5 pr-3 font-semibold">КР</th>
                  <th className="pb-2.5 pr-3 font-semibold">Знаци</th>
                  {played ? <th className="pb-2.5 text-right font-semibold">Точки</th> : null}
                </tr>
              </thead>
              <tbody>
                {predictions.map((prediction, index) => {
                  const ht = { home: prediction.htHome, away: prediction.htAway };
                  const ft = { home: prediction.ftHome, away: prediction.ftAway };
                  const secondHalf = derive2h(ft, ht);
                  const isMe = prediction.userId === user.id;

                  return (
                    <tr
                      key={prediction.userId}
                      className={`border-t border-line ${isMe ? 'bg-brand-soft/50' : ''}`}
                    >
                      {played ? (
                        <td className="py-2.5 pr-2">
                          <Rank place={places[index] ?? index + 1} />
                        </td>
                      ) : null}

                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/participants/${prediction.userId}`}
                          className={`hover:text-brand hover:underline ${
                            isMe ? 'font-semibold text-ink' : 'text-ink'
                          }`}
                        >
                          {prediction.firstName} {prediction.lastName}
                        </Link>
                        {isMe ? <span className="ml-1.5 text-xs text-muted">(ти)</span> : null}
                      </td>

                      <td className="py-2.5 pr-3 tabular-nums text-ink-soft">
                        {ht.home}:{ht.away}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-muted">
                        {secondHalf.home}:{secondHalf.away}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold tabular-nums text-ink">
                        {ft.home}:{ft.away}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-muted">
                        {sign(ht)} / {sign(secondHalf)} / {sign(ft)}
                      </td>

                      {played ? (
                        <td className="py-2.5 text-right">
                          {prediction.points === null ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className="text-[16px] font-bold tabular-nums text-ink">
                              {prediction.points}
                            </span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {played ? (
              <p className="mt-3.5 text-xs text-muted">
                Еднакви точки делят мястото. „ВП" е изведеното второ полувреме: КР минус ПП.
              </p>
            ) : null}
          </div>
        </Card>
      )}

      {played ? <Breakdowns predictions={predictions} /> : null}
    </div>
  );
}

function Breakdowns({
  predictions,
}: {
  predictions: Awaited<ReturnType<typeof getRevealedPredictions>>;
}) {
  const withBreakdown = predictions.filter((prediction) => prediction.breakdown !== null);
  if (withBreakdown.length === 0) return null;

  return (
    <Card>
      <details>
        <summary className="cursor-pointer list-none px-4 py-3 font-semibold">
          Разбивка по критерии
        </summary>
        <div className="overflow-x-auto border-t border-line p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faint">
                <th className="pb-2 pr-3 font-semibold">Критерий</th>
                {withBreakdown.map((prediction) => (
                  <th key={prediction.userId} className="pb-2 pr-3 text-right font-semibold">
                    {prediction.firstName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((criterion) => (
                <tr key={criterion} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-muted">{CRITERION_LABEL[criterion]}</td>
                  {withBreakdown.map((prediction) => {
                    const value = prediction.breakdown?.[criterion] ?? null;
                    return (
                      <td
                        key={prediction.userId}
                        className={`py-1.5 pr-3 text-right tabular-nums ${
                          value === null ? 'text-muted' : value > 0 ? 'text-brand' : 'text-muted'
                        }`}
                        title={value === null ? 'не се точкува — липсва полувреме' : undefined}
                      >
                        {value === null ? '–' : value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            „–" значи, че критерият не се точкува, защото източникът не е дал полувремето. Това не е
            същото като 0 точки за сгрешена прогноза.
          </p>
        </div>
      </details>
    </Card>
  );
}
