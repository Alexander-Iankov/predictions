import { db } from '@/db';
import { auditLog } from '@/db/schema';

/**
 * Записва кой какво е променил ръчно.
 *
 * Ръчните промени по резултати влияят на точките на всички, затова трябва да
 * има следа — иначе при спор няма как да се разбере кога и защо се е сменило.
 */
export async function audit(entry: {
  actorUserId: string;
  action: string;
  entity?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entity: entry.entity ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
