/**
 * Пълни базата от запазеното копие на страницата, без мрежа.
 *
 *   npm run import:local
 *
 * Ползва се за разработка и за проверка на импорта, без да се дърпа източникът.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importSchedule } from '@/lib/scraper/import';
import { parseSchedule } from '@/lib/scraper/parse';

const fixture = fileURLToPath(
  new URL('../test/fixtures/u17-2026-08-19.html', import.meta.url),
);

const rounds = parseSchedule(readFileSync(fixture, 'utf8'));

console.log(
  `Парснати ${rounds.length} кръга, ${rounds.reduce((n, r) => n + r.matches.length, 0)} мача.`,
);

const stats = await importSchedule(rounds);

console.log('Импортът завърши:');
console.log(`  видени мачове:        ${stats.matchesSeen}`);
console.log(`  създадени/променени:  ${stats.matchesUpdated}`);
console.log(`  точкувани прогнози:   ${stats.predictionsScored}`);
console.log(`  сменени резултати:    ${stats.resultsChanged}`);
console.log(`  прескочени (заключен кръг): ${stats.matchesSkipped}`);
if (stats.conflicts.length > 0) {
  console.log('  КОНФЛИКТИ с ръчно въведени резултати:');
  for (const c of stats.conflicts) {
    console.log(`    ${c.homeTeam} - ${c.awayTeam}: ${c.field} ръчно ${c.manual}, източник ${c.source}`);
  }
}

process.exit(0);
