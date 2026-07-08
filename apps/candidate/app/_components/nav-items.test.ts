/**
 * nav-items.test.ts — プレイスタイル診断の独立ルート導線（task 4.4 / R2.5, R6.1）。
 *
 * ナビに /playstyle-diagnosis 項目が存在し、prefix マッチ（自身 + 配下）で点灯し、
 * 隣接する別診断（/class-diagnosis）では点灯しないことを検証する。
 */

import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, isActive } from './nav-items';

describe('NAV_ITEMS — playstyle-diagnosis エントリ', () => {
  const item = NAV_ITEMS.find((i) => i.href === '/playstyle-diagnosis');

  it('/playstyle-diagnosis 項目が prefix マッチで存在する', () => {
    expect(item).toBeDefined();
    expect(item?.match).toBe('prefix');
  });

  it('label と symbol が非空である', () => {
    expect(item?.label).toBeTruthy();
    expect(item?.label.length).toBeGreaterThan(0);
    expect(item?.symbol).toBeTruthy();
    expect(item?.symbol.length).toBeGreaterThan(0);
  });

  it('自身と配下では点灯し、別診断ルートでは点灯しない', () => {
    expect(item).toBeDefined();
    if (!item) return;
    expect(isActive('/playstyle-diagnosis', item)).toBe(true);
    expect(isActive('/playstyle-diagnosis/anything', item)).toBe(true);
    expect(isActive('/class-diagnosis', item)).toBe(false);
  });
});
