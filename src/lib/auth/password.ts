import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** promisify() губи overload-а с опции, затова обвивката е ръчна. */
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/**
 * Хеширане на пароли със scrypt от стандартната библиотека.
 *
 * Без външна зависимост: няма native модул, който да не се компилира на Vercel,
 * и няма чист JS bcrypt, който да е бавен по грешната причина. scrypt е бавен
 * по правилната — иска памет.
 */

/** 2^15 итерации × r=8 → ~32 MB памет за един хеш. */
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// scrypt иска изрично разрешение за паметта, която ще ползва: 128 * N * r.
const MAX_MEMORY = 128 * COST * BLOCK_SIZE * 2;

const PREFIX = 'scrypt';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt);

  return [
    PREFIX,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Проверява парола срещу запазен хеш.
 *
 * Параметрите се четат от самия хеш, за да могат старите пароли да продължат да
 * работят, ако COST се вдигне някой ден.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, costRaw, blockRaw, parallelRaw, saltRaw, keyRaw] = parts;

  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelization = Number(parallelRaw);
  if (!cost || !blockSize || !parallelization || !saltRaw || !keyRaw) return false;

  const salt = Buffer.from(saltRaw, 'base64');
  const expected = Buffer.from(keyRaw, 'base64');

  const actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 128 * cost * blockSize * 2,
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
