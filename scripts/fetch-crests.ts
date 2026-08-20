/**
 * Сваля емблемите на отборите веднъж и ги слага в public/logos/.
 *
 *   npm run fetch:crests
 *
 * Емблемите се сервират от нашия сайт, а не се дърпат от media.bgclubs.eu при
 * всяко зареждане на страница: 16 картинки, които не се менят, не бива да
 * товарят чужд сървър при всяко посещение.
 *
 * Оригиналите са 620×620 (около 1.8 MB общо) — прекалено тежко за икона от 32
 * пиксела, затова се смаляват до 96px. Така всичките 16 стават под 60 KB и не
 * трябва оптимизация на картинки в продукция.
 *
 * Вече свалените се прескачат — пусни с --force, за да се презапишат.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isNotNull } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/db';
import { teams } from '@/db/schema';

const CREST_URL = (crestId: number) => `https://media.bgclubs.eu/images/logos/${crestId}.png`;

/** Достатъчно за 48px екран при двойна плътност. */
const SIZE = 96;

const force = process.argv.includes('--force');
const dir = fileURLToPath(new URL('../public/logos/', import.meta.url));

await mkdir(dir, { recursive: true });

const rows = await db
  .select({ name: teams.name, crestId: teams.crestId })
  .from(teams)
  .where(isNotNull(teams.crestId));

if (rows.length === 0) {
  console.error('Няма отбори с номер на емблема. Пусни първо import:local или import:live.');
  process.exit(1);
}

let downloaded = 0;
let skipped = 0;
let failed = 0;

for (const team of rows) {
  if (team.crestId === null) continue;

  const file = `${dir}${team.crestId}.png`;

  if (!force) {
    try {
      await access(file);
      skipped += 1;
      continue;
    } catch {
      // няма го — сваляме
    }
  }

  try {
    const response = await fetch(CREST_URL(team.crestId), {
      headers: { 'User-Agent': 'prognozi-u17/1.0' },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      console.error(`  ${team.name}: HTTP ${response.status}`);
      failed += 1;
      continue;
    }

    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) {
      console.error(`  ${team.name}: отговорът не е картинка (${type})`);
      failed += 1;
      continue;
    }

    const resized = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await writeFile(file, resized);
    console.log(`  ${team.name} → ${team.crestId}.png (${Math.round(resized.length / 1024)} KB)`);
    downloaded += 1;
  } catch (error) {
    console.error(`  ${team.name}: ${error instanceof Error ? error.message : String(error)}`);
    failed += 1;
  }
}

console.log(`\nСвалени ${downloaded}, прескочени ${skipped}, неуспешни ${failed}.`);
process.exit(failed > 0 ? 1 : 0);
