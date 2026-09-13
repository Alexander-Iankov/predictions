import { describe, expect, it } from 'vitest';
import { currentRoundNumber } from '@/lib/queries/matches';

const NOW = new Date('2026-09-13T12:00:00.000Z');
const at = (iso: string) => ({ kickoffAt: new Date(iso) });

const round = (number: number, ...kickoffs: string[]) => ({
  number,
  matches: kickoffs.map(at),
});

describe('currentRoundNumber', () => {
  it('отваря първия кръг с мач в бъдещето', () => {
    const groups = [
      round(1, '2026-08-15T07:00:00.000Z'),
      round(2, '2026-08-22T07:00:00.000Z'),
      round(3, '2026-09-20T07:00:00.000Z'),
      round(4, '2026-09-27T07:00:00.000Z'),
    ];

    expect(currentRoundNumber(groups, NOW)).toBe(3);
  });

  /*
   * Същността на поправката: резултатите се въвеждат ръчно, затова минал кръг
   * може да стои без резултат със седмици. Той все пак е изигран и страницата
   * не бива да се отваря на него.
   */
  it('прескача минал кръг дори когато няма въведен резултат', () => {
    const groups = [
      round(1, '2026-08-29T07:00:00.000Z'),
      round(2, '2026-09-05T07:00:00.000Z'),
      round(3, '2026-09-19T07:00:00.000Z'),
    ];

    expect(currentRoundNumber(groups, NOW)).toBe(3);
  });

  it('отваря кръг в ход, ако част от мачовете му предстоят', () => {
    const groups = [
      round(1, '2026-08-15T07:00:00.000Z'),
      round(2, '2026-09-12T07:00:00.000Z', '2026-09-14T07:00:00.000Z'),
      round(3, '2026-09-20T07:00:00.000Z'),
    ];

    expect(currentRoundNumber(groups, NOW)).toBe(2);
  });

  it('връща последния кръг, когато целият сезон е минал', () => {
    const groups = [
      round(1, '2026-08-15T07:00:00.000Z'),
      round(2, '2026-08-22T07:00:00.000Z'),
    ];

    expect(currentRoundNumber(groups, NOW)).toBe(2);
  });

  it('не гърми при празен списък', () => {
    expect(currentRoundNumber([], NOW)).toBe(1);
  });
});
