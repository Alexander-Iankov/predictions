import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Тестовете срещу базата искат DATABASE_URL от .env. Ако липсва файлът, те се
// пропускат сами — чистата логика се тества и без база.
try {
  process.loadEnvFile('.env');
} catch {
  // няма .env — това е нормално в CI
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
