import type { StuckType } from '@bulr/types/evaluation';

/**
 * stuck_type enum → 日本語表示ラベル
 *
 * monorepo-app-split Task 4.3 で apps/business/lib/stuck-type-label.ts と
 * 同じ実装を apps/admin にも配置（admin の検証パネルが apps/business に依存しないようにするため）。
 * 将来 3 アプリ共通化が必要になれば @bulr/lib などへ集約検討。
 */
export const STUCK_TYPE_LABEL: Record<StuckType, string> = {
  not_experienced: '経験なし',
  shallow: '浅い',
  single_option: '選択肢が単一',
  rigid: '固執',
};
