import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('hashPassword / verifyPassword', () => {
  it('приема вярната парола', async () => {
    const hash = await hashPassword('тайна-парола-123');
    expect(await verifyPassword('тайна-парола-123', hash)).toBe(true);
  });

  it('отказва грешната парола', async () => {
    const hash = await hashPassword('тайна-парола-123');
    expect(await verifyPassword('тайна-парола-124', hash)).toBe(false);
  });

  it('дава различен хеш за същата парола (различна сол)', async () => {
    const a = await hashPassword('еднаква');
    const b = await hashPassword('еднаква');
    expect(a).not.toBe(b);
    expect(await verifyPassword('еднаква', a)).toBe(true);
    expect(await verifyPassword('еднаква', b)).toBe(true);
  });

  it('не пази паролата в открит вид', async () => {
    const hash = await hashPassword('открита-парола');
    expect(hash).not.toContain('открита-парола');
  });

  it('чете параметрите от самия хеш', async () => {
    const hash = await hashPassword('парола');
    const [prefix, cost, blockSize, parallelization] = hash.split('$');
    expect(prefix).toBe('scrypt');
    expect(Number(cost)).toBe(32768);
    expect(Number(blockSize)).toBe(8);
    expect(Number(parallelization)).toBe(1);
  });

  it('отказва повреден или чужд формат, вместо да гръмне', async () => {
    expect(await verifyPassword('парола', '')).toBe(false);
    expect(await verifyPassword('парола', 'не-е-хеш')).toBe(false);
    expect(await verifyPassword('парола', '$2b$10$abcdefghijklmnopqrstuv')).toBe(false);
    expect(await verifyPassword('парола', 'scrypt$0$0$0$$')).toBe(false);
  });

  it('третира еднакви по Unicode пароли като еднакви', async () => {
    // "é" като един знак срещу "e" + комбиниращ акцент
    const hash = await hashPassword('café');
    expect(await verifyPassword('café', hash)).toBe(true);
  });
});
