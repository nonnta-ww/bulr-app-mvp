/**
 * ステータス表示ヘルパー
 *
 * エントリー / 招待 / 募集 のステータスに対するラベルと Badge tone を集約する。
 * 画面間で表記・配色を揃えるための単一の参照元。
 */

import type { BadgeTone } from '@/components/ui/badge';
import type { EntryStatus } from '@bulr/db/schema';

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  submitted: '提出済み',
  reviewed: '確認済み',
  progressing: '進行中',
  rejected: '不採用',
};

export const ENTRY_STATUS_TONE: Record<EntryStatus, BadgeTone> = {
  submitted: 'info',
  reviewed: 'success',
  progressing: 'warning',
  rejected: 'danger',
};

export const OPENING_STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  open: '公開中',
  closed: '終了',
};

export const OPENING_STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  closed: 'muted',
};
