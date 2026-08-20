import { env } from '@/lib/env';

/**
 * Изтегля страницата с графика.
 *
 * robots.txt на източника позволява четене (`User-agent: * → Allow: /`).
 * Затова и заявката е една на ден, с честен User-Agent и контакт — ако създаваме
 * проблем, да има кой да се обади.
 */
export async function fetchSchedulePage(): Promise<string> {
  const { SCHEDULE_URL, SCRAPER_CONTACT } = env();

  const contact = SCRAPER_CONTACT ? ` (+${SCRAPER_CONTACT})` : '';

  const response = await fetch(SCHEDULE_URL, {
    headers: {
      'User-Agent': `prognozi-u17/1.0${contact}`,
      Accept: 'text/html',
      'Accept-Language': 'bg,en;q=0.5',
    },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Източникът отговори с ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  if (html.length < 10_000) {
    throw new Error(
      `Страницата е подозрително кратка (${html.length} знака) — вероятно е грешка, не график.`,
    );
  }

  return html;
}
