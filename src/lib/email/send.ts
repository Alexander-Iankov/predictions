import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';

/**
 * Изпращане на имейл през SMTP.
 *
 * Нарочно SMTP, а не API на конкретен доставчик: така един и същ код работи с
 * Gmail, Brevo, SendGrid или каквото решиш, и смяната е само променливи в
 * средата, без промяна по кода.
 *
 * Ако SMTP не е настроен, в разработка писмото се изписва в конзолата вместо да
 * се изпраща — така целият поток се тества без външна услуга.
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let cached: Transporter | null = null;

export function isEmailConfigured(): boolean {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM } = env();
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

/**
 * Ще стигне ли писмото донякъде — до пощата или поне до конзолата.
 *
 * Единственото място, което знае кога `sendMail` хвърля: в разработка липсващ
 * SMTP е наред (писмото се изписва), в продукция не е. Повикващите питат това,
 * вместо да преповтарят условието и да се разминат с него.
 */
export function canDeliverMail(): boolean {
  return isEmailConfigured() || env().NODE_ENV !== 'production';
}

function transporter(): Transporter {
  if (cached) return cached;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = env();

  cached = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    // 465 е implicit TLS; 587 вдига STARTTLS след свързване.
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return cached;
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!isEmailConfigured()) {
    if (!canDeliverMail()) {
      throw new Error('SMTP не е настроен — писмото не може да се изпрати.');
    }

    console.log(
      [
        '',
        '─── ПИСМО (SMTP не е настроен, показва се вместо изпращане) ───',
        `до:   ${mail.to}`,
        `тема: ${mail.subject}`,
        '',
        mail.text,
        '───────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return;
  }

  await transporter().sendMail({
    from: env().SMTP_FROM,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

/**
 * Адресът на сайта за абсолютни линкове.
 *
 * Vercel подава VERCEL_PROJECT_PRODUCTION_URL сам, така че в продукция APP_URL
 * не е задължителна.
 */
export function appUrl(): string {
  const explicit = env().APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}
