import type { StuckType } from '@bulr/types/evaluation';

/** stuck_type enum → 日本語表示ラベル */
export const STUCK_TYPE_LABEL: Record<StuckType, string> = {
  not_experienced: '経験なし',
  shallow: '浅い',
  single_option: '選択肢が単一',
  rigid: '固執',
};
