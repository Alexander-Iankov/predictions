import { describe, expect, it } from 'vitest';
import { ROLE_LABEL, isCompetitor, isVisibleTo, type UserRole } from '@/lib/visibility';

const ROLES: UserRole[] = ['user', 'admin', 'test'];

describe('isCompetitor', () => {
  it('брои само редовния участник', () => {
    expect(isCompetitor('user')).toBe(true);
  });

  it('не брои тестовия профил', () => {
    expect(isCompetitor('test')).toBe(false);
  });

  it('не брои админа', () => {
    expect(isCompetitor('admin')).toBe(false);
  });
});

describe('isVisibleTo', () => {
  const me = 'aaaaaaaa-0000-0000-0000-000000000001';
  const other = 'bbbbbbbb-0000-0000-0000-000000000002';

  it('показва редовния участник на всеки', () => {
    expect(isVisibleTo({ id: other, role: 'user' }, me)).toBe(true);
  });

  it('крие тестовия профил от останалите', () => {
    expect(isVisibleTo({ id: other, role: 'test' }, me)).toBe(false);
  });

  it('крие админа от останалите', () => {
    expect(isVisibleTo({ id: other, role: 'admin' }, me)).toBe(false);
  });

  it('показва на всеки него самия, каквато и да е ролята', () => {
    for (const role of ROLES) {
      expect(isVisibleTo({ id: me, role }, me)).toBe(true);
    }
  });
});

describe('ROLE_LABEL', () => {
  it('има етикет за всяка роля', () => {
    for (const role of ROLES) {
      expect(ROLE_LABEL[role]).toBeTruthy();
    }
  });
});
