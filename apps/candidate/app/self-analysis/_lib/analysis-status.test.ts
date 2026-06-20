import { describe, it, expect } from 'vitest';

import { deriveAnalysisStatus } from './analysis-status';

describe('deriveAnalysisStatus', () => {
  const t1 = new Date('2026-01-01T00:00:00Z');
  const t2 = new Date('2026-02-01T00:00:00Z');

  it('分析が無いとき none', () => {
    expect(deriveAnalysisStatus(t2, null)).toBe('none');
  });

  it('回答が分析生成元より新しいとき stale', () => {
    expect(deriveAnalysisStatus(t2, t1)).toBe('stale');
  });

  it('回答と分析生成元が同時刻のとき ready', () => {
    expect(deriveAnalysisStatus(t1, t1)).toBe('ready');
  });

  it('分析生成元が回答以降のとき ready', () => {
    expect(deriveAnalysisStatus(t1, t2)).toBe('ready');
  });
});
