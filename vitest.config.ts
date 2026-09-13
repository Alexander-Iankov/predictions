import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Тестовете срещу базата искат DATABASE_URL от .env. Ако липсва файлът, те се
// пропускат сами — чистата логика се тества и без база.
try {
  process.loadEnvFile('.env');
} catch {
  // няма .env — това е нормално в CI
}

/*
 * SMTP се маха нарочно, СЛЕД като .env е зареден.
 *
 * Иначе тестовете на забравената парола пращат истински писма през доставчика:
 * бавно, шумно за получателя и зависимо от чужд сървър — тестът започва да пада
 * заради мрежата, а не заради кода. Без тези променливи sendMail само изписва
 * писмото и продължава.
 */
for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
  delete process.env[key];
}

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
