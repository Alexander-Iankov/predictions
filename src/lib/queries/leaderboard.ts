import { asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { rounds } from '@/db/schema';

export type LeaderboardRow = {
  userId: string;
  firstName: string;
  lastName: string;
  points: number;
  /** прогнози, които вече са точкувани */
  scored: number;
  /** всички направени прогнози, включително за неизиграни мачове */
  made: number;
  exactFt: number;
  exactHt: number;
  /** точкувани мачове, при които полувремето липсва */
  partial: number;
};

/**
 * Класирането.
 *
 * При равни точки: повече познати точни крайни резултати, после точни
 * полувремена, после по фамилия — за да е подредбата стабилна, а не случайна.
 *
 * Точните познавания се броят като се сравнят прогнозата и резултата, а не по
 * стойността на бонуса в разбивката: така смяна на точките за точен резултат не
 * чупи подредбата.
 *
 * Филтърът по кръг е в условието на join-а, а не в WHERE: иначе участник без
 * прогнози в този кръг би изчезнал от таблицата, вместо да излезе с 0 точки.
 */
export async function getLeaderboard(roundNumber?: number): Promise<LeaderboardRow[]> {
  const roundFilter =
    roundNumber === undefined
      ? sql``
      : sql`and p.match_id in (
              select m2.id
                from matches m2
                join rounds r2 on r2.id = m2.round_id
               where r2.number = ${roundNumber}
            )`;

  const result = await db.execute<LeaderboardRow>(sql`
    select u.id                                      as "userId",
           u.first_name                              as "firstName",
           u.last_name                               as "lastName",
           coalesce(sum(ps.points), 0)::int          as points,
           count(ps.prediction_id)::int              as scored,
           count(p.id)::int                          as made,
           count(*) filter (
             where m.ft_home is not null
               and p.ft_home = m.ft_home
               and p.ft_away = m.ft_away
           )::int                                    as "exactFt",
           count(*) filter (
             where m.ht_home is not null
               and p.ht_home = m.ht_home
               and p.ht_away = m.ht_away
           )::int                                    as "exactHt",
           count(*) filter (where ps.partial)::int   as partial
      from users u
      left join predictions p
             on p.user_id = u.id
            ${roundFilter}
      left join matches m on m.id = p.match_id
      left join prediction_scores ps on ps.prediction_id = p.id
     where u.status = 'active'
     group by u.id, u.first_name, u.last_name
     order by points desc, "exactFt" desc, "exactHt" desc, u.last_name asc
  `);

  return result.rows;
}

export type RoundOption = { number: number; label: string; lockedForUpdates: boolean };

export async function getRoundOptions(): Promise<RoundOption[]> {
  return db
    .select({
      number: rounds.number,
      label: rounds.label,
      lockedForUpdates: rounds.lockedForUpdates,
    })
    .from(rounds)
    .orderBy(asc(rounds.number));
}
