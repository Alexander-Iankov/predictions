import { describe, expect, it } from 'vitest';
import { placesByPoints } from '@/components/rank';

describe('placesByPoints', () => {
  it('дава последователни места при различни точки', () => {
    expect(placesByPoints([16, 9, 3])).toEqual([1, 2, 3]);
  });

  it('дели мястото при равни точки', () => {
    expect(placesByPoints([16, 9, 9, 3])).toEqual([1, 2, 2, 4]);
  });

  it('прескача след споделено място, вместо да брои поред', () => {
    expect(placesByPoints([9, 9, 9, 1])).toEqual([1, 1, 1, 4]);
  });

  it('дели и първото място', () => {
    expect(placesByPoints([16, 16, 2])).toEqual([1, 1, 3]);
  });

  it('третира неточкуваните като отделна група', () => {
    expect(placesByPoints([5, null, null])).toEqual([1, 2, 2]);
  });

  it('връща празен списък за празен вход', () => {
    expect(placesByPoints([])).toEqual([]);
  });
});
