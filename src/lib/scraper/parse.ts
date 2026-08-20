/**
 * Парсване на графика от bulgarian-football.com.
 *
 * Страницата не е семантична: кръговете, датите и мачовете са просто текст в
 * <u> и <strong> един след друг, вътре в общ контейнер. Затова се минава по
 * елементите в реда на документа и се държи състояние — точно както се чете от
 * човек.
 *
 * Три особености на източника, всяка от които е покрита с тест:
 *  1. Един <u> ред с дата важи за всички следващи мачове до следващия <u>.
 *  2. Далечните кръгове са обявени само с дата, без час.
 *  3. Резултатът от полувремето е в скоби и често изобщо липсва.
 *
 * Функцията не прави мрежови заявки — приема HTML низ, за да може да се тества
 * офлайн срещу запазено копие на страницата.
 */

import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { Goals } from '@/lib/scoring';
import { bulgarianDateToUtc, parseBulgarianDate, type BulgarianDate } from '@/lib/time';

/** Котвите на кръговете в източника: <a id="k14r1"></a> ... <a id="k14r15"></a> */
const ROUND_ANCHOR_PREFIX = 'k14r';

const TEAM_ANCHOR_SELECTOR = 'a.bgclubs';

export type ParsedMatch = {
  roundNumber: number;
  homeTeam: string;
  awayTeam: string;
  /**
   * Номерът на клуба в bgclubs.eu, изваден от котвата на линка
   * (`…/teams/Levski(Sofia)?season=227#10103-381` → 10103).
   * По него се взема емблемата: media.bgclubs.eu/images/logos/<id>.png
   */
  homeTeamSourceId: number | null;
  awayTeamSourceId: number | null;
  homeTeamUrl: string | null;
  awayTeamUrl: string | null;
  /** UTC. При необявен час — 09:00 българско време (виж FALLBACK_KICKOFF_HOUR). */
  kickoffAt: Date;
  /** false, когато източникът е дал само дата */
  timeKnown: boolean;
  ft: Goals | null;
  ht: Goals | null;
  /** текстът след имената на отборите, както е в източника — за диагностика */
  rawResult: string;
};

export type ParsedRound = {
  number: number;
  label: string;
  matches: ParsedMatch[];
};

export class ScheduleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleParseError';
  }
}

/** `\s` в JS покрива и non-breaking space, който източникът ползва на места. */
function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** `…?season=227#10103-381` → 10103 */
const TEAM_SOURCE_ID_RE = /#(\d+)-/;

function teamSourceId(href: string | undefined): number | null {
  const match = href ? TEAM_SOURCE_ID_RE.exec(href) : null;
  return match?.[1] ? Number(match[1]) : null;
}

const RESULT_RE = /(\d{1,3})\s*:\s*(\d{1,3})(?:\s*\(\s*(\d{1,3})\s*:\s*(\d{1,3})\s*\))?/u;

/** "4:1 (1:0)" → { ft: 4:1, ht: 1:0 }; "-" → { ft: null, ht: null } */
export function parseResult(text: string): { ft: Goals | null; ht: Goals | null } {
  const match = RESULT_RE.exec(text);
  if (!match) return { ft: null, ht: null };

  const [, ftHome, ftAway, htHome, htAway] = match;

  return {
    ft: { home: Number(ftHome), away: Number(ftAway) },
    ht:
      htHome !== undefined && htAway !== undefined
        ? { home: Number(htHome), away: Number(htAway) }
        : null,
  };
}

export function parseSchedule(html: string): ParsedRound[] {
  const $ = cheerio.load(html);

  // Обединеният селектор връща елементите в реда на документа.
  const nodes = $(`a[id^="${ROUND_ANCHOR_PREFIX}"], u, strong`).toArray();

  const rounds: ParsedRound[] = [];
  let current: ParsedRound | null = null;
  let expectingLabel = false;
  let currentDate: BulgarianDate | null = null;

  for (const node of nodes) {
    const tag = node.tagName?.toLowerCase();

    if (tag === 'a') {
      const id = node.attribs['id'] ?? '';
      const roundNumber = Number(id.slice(ROUND_ANCHOR_PREFIX.length));
      if (!Number.isInteger(roundNumber) || roundNumber < 1) continue;

      current = { number: roundNumber, label: `${roundNumber} кръг`, matches: [] };
      rounds.push(current);
      expectingLabel = true;
      // Датата не се пренася през граница на кръг.
      currentDate = null;
      continue;
    }

    // Всичко преди първия кръг е блокът "Актуални мачове" — той дублира мачове
    // от кръговете по-надолу и се пропуска.
    if (current === null) continue;

    if (tag === 'u') {
      const parsed = parseBulgarianDate(cleanText($(node).text()));
      if (parsed) currentDate = parsed;
      continue;
    }

    // tag === 'strong'
    const teamAnchors = $(node).find(TEAM_ANCHOR_SELECTOR).toArray();

    if (teamAnchors.length !== 2) {
      // <strong> точно след котвата държи заглавието на кръга ("I кръг").
      if (expectingLabel) {
        const label = cleanText($(node).text());
        if (label) current.label = label;
        expectingLabel = false;
      }
      continue;
    }

    expectingLabel = false;

    if (currentDate === null) {
      throw new ScheduleParseError(
        `Мач без дата в кръг ${current.number}: "${cleanText($(node).text())}". ` +
          'Вероятно структурата на източника е сменена.',
      );
    }

    const [homeAnchor, awayAnchor] = teamAnchors;
    const homeTeam = cleanText($(homeAnchor).text());
    const awayTeam = cleanText($(awayAnchor).text());
    const homeHref = homeAnchor?.attribs['href'];
    const awayHref = awayAnchor?.attribs['href'];

    if (!homeTeam || !awayTeam) {
      throw new ScheduleParseError(
        `Мач с празно име на отбор в кръг ${current.number}: "${cleanText($(node).text())}".`,
      );
    }

    // Резултатът е в текста след последната връзка към отбор.
    const contents = $(node).contents().toArray();
    let lastAnchorIndex = -1;
    contents.forEach((child, index) => {
      if (
        child.type === 'tag' &&
        child.tagName?.toLowerCase() === 'a' &&
        (child.attribs['class'] ?? '').includes('bgclubs')
      ) {
        lastAnchorIndex = index;
      }
    });

    const rawResult = cleanText(
      contents
        .slice(lastAnchorIndex + 1)
        .map((child) => $(child).text())
        .join(''),
    );

    const { ft, ht } = parseResult(rawResult);

    current.matches.push({
      roundNumber: current.number,
      homeTeam,
      awayTeam,
      homeTeamSourceId: teamSourceId(homeHref),
      awayTeamSourceId: teamSourceId(awayHref),
      homeTeamUrl: homeHref ?? null,
      awayTeamUrl: awayHref ?? null,
      kickoffAt: bulgarianDateToUtc(currentDate),
      timeKnown: currentDate.hour !== null,
      ft,
      ht,
      rawResult,
    });
  }

  const withMatches = rounds.filter((round) => round.matches.length > 0);

  if (withMatches.length === 0) {
    throw new ScheduleParseError(
      'Не е намерен нито един мач. Структурата на източника вероятно е сменена.',
    );
  }

  return withMatches;
}

/**
 * Отпечатък на графика — за да се разбере дали от последния път се е променило
 * нещо съществено.
 *
 * Хешира се парснатото съдържание, а НЕ самата страница: източникът слага в
 * HTML-а cache-busting timestamp и "Time: 0.068 seconds", така че хешът на
 * страницата се различава при всяка заявка и не носи информация.
 */
export function scheduleFingerprint(rounds: ParsedRound[]): string {
  const canonical = rounds.map((round) => [
    round.number,
    round.matches.map((match) => [
      match.homeTeam,
      match.awayTeam,
      match.kickoffAt.toISOString(),
      match.timeKnown,
      match.ft?.home ?? null,
      match.ft?.away ?? null,
      match.ht?.home ?? null,
      match.ht?.away ?? null,
    ]),
  ]);

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
