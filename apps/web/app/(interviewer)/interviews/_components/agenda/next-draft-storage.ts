/**
 * nextDraft localStorage 永続化ヘルパー。
 *
 * sessionId ごとにキーを分け、リロード後に「ユーザーが選びかけていた次の質問」を復元する。
 * 録音中の音声は復元できないが、質問の意図は保持できる。
 *
 * 失敗時（localStorage 利用不可、JSON 破損など）は黙って fall back する設計。
 */

import type { NextQuestionDraft } from './types';

const KEY_PREFIX = 'bulr.session.';
const KEY_SUFFIX = '.nextDraft';

function key(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}${KEY_SUFFIX}`;
}

export function loadNextDraft(sessionId: string): NextQuestionDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidDraft(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveNextDraft(sessionId: string, draft: NextQuestionDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(sessionId), JSON.stringify(draft));
  } catch {
    // QuotaExceeded など。サイレント。
  }
}

export function clearNextDraft(sessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key(sessionId));
  } catch {
    // ignore
  }
}

function isValidDraft(value: unknown): value is NextQuestionDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.questionText !== 'string') return false;
  if (v.patternId !== null && typeof v.patternId !== 'string') return false;
  if (v.fromAnalysisTaskId !== null && typeof v.fromAnalysisTaskId !== 'string') return false;
  if (!v.source || typeof v.source !== 'object') return false;
  const src = v.source as Record<string, unknown>;
  if (typeof src.kind !== 'string') return false;
  if (!['pattern_intro', 'deep_dive', 'meta_cognition', 'manual'].includes(src.kind)) return false;
  return true;
}
