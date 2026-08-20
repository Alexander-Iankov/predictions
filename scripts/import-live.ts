/**
 * Дърпа графика от източника и обновява базата.
 *
 *   npm run import:live
 *
 * Същият код, който върви и по cron в продукция.
 */
import { refreshSchedule } from '@/lib/refresh';

const result = await refreshSchedule({ trigger: 'admin' });

if (result.ok && result.skipped) {
  console.log(`Пропуснато: ${result.reason}`);
  process.exit(0);
}

if (result.ok) {
  console.log('Обновяването завърши:');
  console.log(`  видени мачове:        ${result.stats.matchesSeen}`);
  console.log(`  създадени/променени:  ${result.stats.matchesUpdated}`);
  console.log(`  точкувани прогнози:   ${result.stats.predictionsScored}`);
  console.log(`  сменени резултати:    ${result.stats.resultsChanged}`);
  console.log(`  прескочени (заключен кръг): ${result.stats.matchesSkipped}`);
  if (result.stats.conflicts.length > 0) {
    console.log('  КОНФЛИКТИ с ръчно въведени резултати:');
    for (const c of result.stats.conflicts) {
      console.log(
        `    ${c.homeTeam} - ${c.awayTeam}: ${c.field} ръчно ${c.manual}, източник ${c.source}`,
      );
    }
  }
  process.exit(0);
}

console.error(`Обновяването се провали: ${result.error}`);
process.exit(1);
