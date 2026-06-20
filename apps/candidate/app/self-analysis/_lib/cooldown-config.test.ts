import { describe, it, expect } from 'vitest';

import { DEFAULT_COOLDOWN_DAYS, resolveCooldownDays } from './cooldown-config';

describe('resolveCooldownDays', () => {
  it('未設定（undefined）は既定値', () => {
    expect(resolveCooldownDays(undefined)).toBe(DEFAULT_COOLDOWN_DAYS);
  });

  it('空文字・空白は既定値', () => {
    expect(resolveCooldownDays('')).toBe(DEFAULT_COOLDOWN_DAYS);
    expect(resolveCooldownDays('   ')).toBe(DEFAULT_COOLDOWN_DAYS);
  });

  it('非数値は既定値', () => {
    expect(resolveCooldownDays('abc')).toBe(DEFAULT_COOLDOWN_DAYS);
  });

  it('負値は既定値', () => {
    expect(resolveCooldownDays('-5')).toBe(DEFAULT_COOLDOWN_DAYS);
  });

  it('0 は 0（クールダウン無効化）', () => {
    expect(resolveCooldownDays('0')).toBe(0);
  });

  it('正の整数はその値', () => {
    expect(resolveCooldownDays('1')).toBe(1);
    expect(resolveCooldownDays('7')).toBe(7);
  });

  it('小数は切り捨て', () => {
    expect(resolveCooldownDays('2.9')).toBe(2);
  });
});
