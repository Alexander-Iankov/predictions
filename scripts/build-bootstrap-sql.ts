/**
 * Слепва миграциите в един SQL файл за поставяне в SQL editor (Neon, psql, ...).
 *
 *   npm run build:bootstrap
 *
 * Освен таблиците, файлът попълва и drizzle.__drizzle_migrations — иначе
 * следващият `drizzle-kit migrate` ще се опита да приложи същите миграции пак и
 * ще падне. Хешът е sha256 на съдържанието на файла, точно както го смята
 * drizzle-orm.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../drizzle/', import.meta.url));

type Journal = { entries: Array<{ tag: string; when: number }> };
const journal: Journal = JSON.parse(readFileSync(`${dir}meta/_journal.json`, 'utf8'));

const parts: string[] = [
  '-- Създава цялата схема наведнъж и отбелязва миграциите като приложени.',
  '-- Генериран файл — не се пипа на ръка (виж scripts/build-bootstrap-sql.ts).',
  '',
  'BEGIN;',
  '',
];

for (const entry of journal.entries) {
  const sql = readFileSync(`${dir}${entry.tag}.sql`, 'utf8');
  parts.push(`-- ${'='.repeat(70)}`, `-- ${entry.tag}`, `-- ${'='.repeat(70)}`, '', sql.trim(), '');
}

parts.push(
  `-- ${'='.repeat(70)}`,
  '-- Отчитане на миграциите',
  `-- ${'='.repeat(70)}`,
  '',
  'CREATE SCHEMA IF NOT EXISTS "drizzle";',
  'CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (',
  '  id SERIAL PRIMARY KEY,',
  '  hash text NOT NULL,',
  '  created_at bigint',
  ');',
  '',
  'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES',
);

const rows = journal.entries.map((entry) => {
  const hash = createHash('sha256')
    .update(readFileSync(`${dir}${entry.tag}.sql`, 'utf8'))
    .digest('hex');
  return `  ('${hash}', ${entry.when})`;
});

parts.push(`${rows.join(',\n')};`, '', 'COMMIT;', '');

writeFileSync(`${dir}bootstrap.sql`, parts.join('\n'));
console.log(`drizzle/bootstrap.sql — ${journal.entries.length} миграции`);
for (const entry of journal.entries) console.log(`  ${entry.tag}`);
