import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * Един pool за целия процес. В development Next.js презарежда модулите при
 * всяка промяна, затова pool-ът се държи на globalThis — иначе всяко запазване
 * оставя висящи връзки, докато Postgres не откаже нови.
 */
const globalForDb = globalThis as unknown as { prognoziPool?: Pool };

function createPool(): Pool {
  return new Pool({
    connectionString: env().DATABASE_URL,
    // Serverless: много кратко живеещи инстанции, всяка с малко връзки.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

const pool = globalForDb.prognoziPool ?? createPool();

if (env().NODE_ENV !== 'production') {
  globalForDb.prognoziPool = pool;
}

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export { schema };
