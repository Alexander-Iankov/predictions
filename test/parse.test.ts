import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  parseResult,
  parseSchedule,
  scheduleFingerprint,
  type ParsedMatch,
  type ParsedRound,
} from '@/lib/scraper/parse';
import {
  parseBulgarianDate,
  parseSofiaInputValue,
  toSofiaInputValue,
  zonedToUtc,
} from '@/lib/time';

const FIXTURE = fileURLToPath(new URL('./fixtures/u17-2026-08-19.html', import.meta.url));

let rounds: ParsedRound[];
let matches: ParsedMatch[];

const find = (home: string, away: string): ParsedMatch => {
  const match = matches.find((m) => m.homeTeam.startsWith(home) && m.awayTeam.startsWith(away));
  if (!match) throw new Error(`Мачът ${home} - ${away} не е намерен`);
  return match;
};

beforeAll(() => {
  rounds = parseSchedule(readFileSync(FIXTURE, 'utf8'));
  matches = rounds.flatMap((round) => round.matches);
});

describe('структура', () => {
  it('намира 15 кръга', () => {
    expect(rounds).toHaveLength(15);
    expect(rounds.map((r) => r.number)).toEqual([...Array(15)].map((_, i) => i + 1));
  });

  it('взема заглавието на кръга от източника', () => {
    expect(rounds[0]?.label).toBe('I кръг');
    expect(rounds[14]?.label).toBe('XV кръг');
  });

  it('намира 120 мача, по 8 на кръг', () => {
    expect(matches).toHaveLength(120);
    for (const round of rounds) {
      expect(round.matches, `кръг ${round.number}`).toHaveLength(8);
    }
  });

  it('пропуска блока "Актуални мачове" и не дублира мачове', () => {
    const keys = matches.map((m) => `${m.roundNumber}|${m.homeTeam}|${m.awayTeam}`);
    expect(new Set(keys).size).toBe(120);
  });

  it('вижда 16 различни отбора', () => {
    const teams = new Set(matches.flatMap((m) => [m.homeTeam, m.awayTeam]));
    expect(teams.size).toBe(16);
  });
});

describe('резултати', () => {
  it('чете краен резултат заедно с полувремето', () => {
    const match = find('Славия 1913', 'Национал');
    expect(match.ft).toEqual({ home: 0, away: 1 });
    expect(match.ht).toEqual({ home: 0, away: 0 });
  });

  it('чете краен резултат, когато полувремето липсва', () => {
    const match = find('Арда 1924', 'Нефтохимик');
    expect(match.ft).toEqual({ home: 1, away: 2 });
    expect(match.ht).toBeNull();
  });

  it('оставя неизиграните мачове без резултат', () => {
    const match = find('Локомотив 1926', 'Лудогорец 1945');
    expect(match.ft).toBeNull();
    expect(match.ht).toBeNull();
  });

  it('в целия fixture има 8 изиграни мача, от които 4 с полувреме', () => {
    expect(matches.filter((m) => m.ft !== null)).toHaveLength(8);
    expect(matches.filter((m) => m.ht !== null)).toHaveLength(4);
  });
});

describe('час на започване', () => {
  it('превръща българското време в UTC (август = UTC+3)', () => {
    const match = find('Славия 1913', 'Национал');
    // 14 август 2026, петък, 09:30 ч българско време
    expect(match.kickoffAt.toISOString()).toBe('2026-08-14T06:30:00.000Z');
    expect(match.timeKnown).toBe(true);
  });

  it('наследява датата и часа от предходния <u> ред', () => {
    // ЦСКА - Пирин 22 няма собствен ред с дата; важи "15 август, 10:30 ч"
    const match = find('ЦСКА (София)', 'Пирин 22');
    expect(match.kickoffAt.toISOString()).toBe('2026-08-15T07:30:00.000Z');
    expect(match.timeKnown).toBe(true);
  });

  it('при обявена само дата приема 09:00 българско време (декември = UTC+2)', () => {
    const match = find('Академик', 'Черно море');
    // XV кръг: "12 декември 2026 г., събота:" — без час
    expect(match.timeKnown).toBe(false);
    expect(match.kickoffAt.toISOString()).toBe('2026-12-12T07:00:00.000Z');
  });

  it('кръгове 1-4 имат обявени часове, 5-15 още не', () => {
    const known = new Set(
      matches.filter((m) => m.timeKnown).map((m) => m.roundNumber),
    );
    expect([...known].sort((x, y) => x - y)).toEqual([1, 2, 3, 4]);
  });

  it('подрежда мачовете хронологично след сортиране', () => {
    const sorted = [...matches].sort((x, y) => x.kickoffAt.getTime() - y.kickoffAt.getTime());
    expect(sorted[0]?.roundNumber).toBe(1);
    expect(sorted.at(-1)?.roundNumber).toBe(15);
  });
});

describe('scheduleFingerprint', () => {
  const html = () => readFileSync(FIXTURE, 'utf8');

  it('дава един и същ отпечатък за същата страница', () => {
    expect(scheduleFingerprint(parseSchedule(html()))).toBe(
      scheduleFingerprint(parseSchedule(html())),
    );
  });

  it('не се влияе от cache-busting timestamp-а в HTML-а', () => {
    // Точно това чупеше хеша на цялата страница: източникът мени тези стойности
    // при всяка заявка, без графикът да се е променил.
    const noisy = html()
      .replace(/style\.css\?\d+/, 'style.css?9999999999')
      .replace(/<!-- Time: [\d.]+ seconds -->/, '<!-- Time: 1.23456 seconds -->');

    expect(scheduleFingerprint(parseSchedule(noisy))).toBe(
      scheduleFingerprint(parseSchedule(html())),
    );
  });

  it('не се влияе от промени в блока "Актуални мачове"', () => {
    // Този блок дублира мачове от кръговете и се пропуска при парсване, затова
    // промяна в него не бива да значи "графикът се смени".
    const changedTopBlock = html().replace(/ {2}- <\/strong>/, '  2:1 (1:0) </strong>');

    expect(changedTopBlock).not.toBe(html());
    expect(scheduleFingerprint(parseSchedule(changedTopBlock))).toBe(
      scheduleFingerprint(parseSchedule(html())),
    );
  });

  it('се променя, когато влезе нов резултат', () => {
    const rounds = parseSchedule(html());
    const before = scheduleFingerprint(rounds);

    const match = rounds.at(-1)?.matches[0];
    if (!match) throw new Error('няма мач за промяна');
    match.ft = { home: 2, away: 1 };

    expect(scheduleFingerprint(rounds)).not.toBe(before);
  });

  it('се променя, когато мач се премести', () => {
    const rounds = parseSchedule(html());
    const before = scheduleFingerprint(rounds);

    const match = rounds[0]?.matches[0];
    if (!match) throw new Error('няма мач за промяна');
    match.kickoffAt = new Date(match.kickoffAt.getTime() + 60 * 60_000);

    expect(scheduleFingerprint(rounds)).not.toBe(before);
  });
});

describe('parseResult', () => {
  it('разпознава формите от източника', () => {
    expect(parseResult('4:1 (1:0)')).toEqual({ ft: { home: 4, away: 1 }, ht: { home: 1, away: 0 } });
    expect(parseResult('1:2')).toEqual({ ft: { home: 1, away: 2 }, ht: null });
    expect(parseResult('-')).toEqual({ ft: null, ht: null });
    expect(parseResult('')).toEqual({ ft: null, ht: null });
  });
});

describe('parseBulgarianDate', () => {
  it('чете дата с час', () => {
    expect(parseBulgarianDate('15 август 2026 г., събота, 09:30 ч:')).toEqual({
      year: 2026,
      month: 8,
      day: 15,
      hour: 9,
      minute: 30,
    });
  });

  it('чете дата без час', () => {
    expect(parseBulgarianDate('12 декември 2026 г., събота:')).toEqual({
      year: 2026,
      month: 12,
      day: 12,
      hour: null,
      minute: null,
    });
  });

  it('връща null за текст без дата', () => {
    expect(parseBulgarianDate('Актуални мачове:')).toBeNull();
  });
});

describe('полето за дата и час в админа', () => {
  it('показва момента в софийско време — лятно', () => {
    expect(toSofiaInputValue(new Date('2026-08-15T07:30:00.000Z'))).toBe('2026-08-15T10:30');
  });

  it('показва момента в софийско време — зимно', () => {
    expect(toSofiaInputValue(new Date('2026-12-12T07:00:00.000Z'))).toBe('2026-12-12T09:00');
  });

  it('чете обратно същия момент', () => {
    const moment = new Date('2026-08-21T06:30:00.000Z');
    expect(parseSofiaInputValue(toSofiaInputValue(moment))?.toISOString()).toBe(
      moment.toISOString(),
    );
  });

  it('чете стойността като софийско време, не като UTC', () => {
    expect(parseSofiaInputValue('2026-08-21T09:30')?.toISOString()).toBe(
      '2026-08-21T06:30:00.000Z',
    );
  });

  it('приема и стойност със секунди, както я дават някои браузъри', () => {
    expect(parseSofiaInputValue('2026-08-21T09:30:00')?.toISOString()).toBe(
      '2026-08-21T06:30:00.000Z',
    );
  });

  it('връща null за нечетима стойност', () => {
    expect(parseSofiaInputValue('')).toBeNull();
    expect(parseSofiaInputValue('21.08.2026 09:30')).toBeNull();
  });
});

describe('zonedToUtc', () => {
  it('лятно време в София е UTC+3', () => {
    expect(zonedToUtc(2026, 8, 15, 10, 30).toISOString()).toBe('2026-08-15T07:30:00.000Z');
  });

  it('зимно време в София е UTC+2', () => {
    expect(zonedToUtc(2026, 12, 12, 9, 0).toISOString()).toBe('2026-12-12T07:00:00.000Z');
  });

  it('минава коректно през смяната на времето (последна неделя на октомври)', () => {
    // 25.10.2026, 03:00 EEST → 04:00 EEST не съществува като стенно време;
    // 04:00 вече е EET (UTC+2)
    expect(zonedToUtc(2026, 10, 25, 2, 30).toISOString()).toBe('2026-10-24T23:30:00.000Z');
    expect(zonedToUtc(2026, 10, 25, 5, 0).toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });
});
