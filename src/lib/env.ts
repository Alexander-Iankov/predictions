import { z } from 'zod';

/**
 * Env променливите се проверяват веднъж, при първото докосване. По-добре
 * приложението да не тръгне, отколкото да падне на случайно място в 6 сутринта,
 * когато cron-ът дърпа графика.
 */

/** Празна променлива в .env значи "не е зададена", не "зададена на празно". */
const blankAsUndefined = <T extends z.ZodType>(inner: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), inner);

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL липсва'),
  CRON_SECRET: blankAsUndefined(
    z.string().min(16, 'CRON_SECRET трябва да е поне 16 знака').optional(),
  ),
  SCHEDULE_URL: blankAsUndefined(
    z.url().default('https://bulgarian-football.com/elitna-grupa-u17.html'),
  ),
  SCRAPER_CONTACT: blankAsUndefined(z.string().default('')),

  /** Публичният адрес на сайта — нужен за абсолютните линкове в имейлите. */
  APP_URL: blankAsUndefined(z.url().optional()),

  /** SMTP — работи с Gmail, Brevo, SendGrid и всеки друг доставчик. */
  SMTP_HOST: blankAsUndefined(z.string().optional()),
  SMTP_PORT: blankAsUndefined(z.coerce.number().int().positive().default(587)),
  SMTP_USER: blankAsUndefined(z.string().optional()),
  SMTP_PASS: blankAsUndefined(z.string().optional()),
  /** Подателят, напр. "Прогнози U-17 <prognozi@example.com>" */
  SMTP_FROM: blankAsUndefined(z.string().optional()),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Грешна конфигурация:\n${problems.join('\n')}`);
  }

  cached = parsed.data;
  return cached;
}
