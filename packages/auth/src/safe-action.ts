/**
 * Server Action ラッパー（safe-action.ts）
 *
 * すべての mutation は authedAction / adminAction / candidateAction でラップすること。
 * 素の async function で Server Action を書かない。
 * これは security.md の多層認証パターンに従う標準パターン。
 *
 * 業務エラーの表現（重要）:
 *   handler は業務エラーを ActionError の throw で表現する。ラッパーが捕捉して
 *   フラットな `{ ok:false, error }` に変換するため、consumer は 1 段階
 *   （`if (!result.ok) result.error`）で読める。handler 戻り値に `{ ok:false }` を
 *   混ぜて返す旧パターン（consumer 側で `result.data.ok` の 2 段階読みが必要になり
 *   握り潰しバグの温床だった）は使わない。
 *
 * Requirements: 5.6-5.10, 9.6
 */

import 'server-only';

import { ZodError, ZodType } from 'zod';

import { AuthError } from './errors';
import { requireAdmin, requireCandidate, requireUser } from './guards';
import type { CandidateProfile } from '@bulr/db/schema';

// ---------------------------------------------------------------------------
// Result 型 / 業務エラー
// ---------------------------------------------------------------------------

export interface ActionErrorPayload {
  code: string;
  message: string;
  /** COOLDOWN の nextAvailableAt など、code/message 以外の付随情報。 */
  details?: Record<string, unknown>;
}

export type Result<R> =
  | { ok: true; data: R }
  | { ok: false; error: ActionErrorPayload };

/**
 * 業務エラーを表す例外。handler が throw すると各ラッパーが捕捉して
 * フラットな `{ ok:false, error }` に変換する。
 */
export class ActionError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
    this.details = details;
  }
}

/**
 * 例外を Result のエラー形へ変換する。
 * ActionError（業務エラー）/ AuthError（認証・認可）/ ZodError（入力検証）を捕捉し、
 * それ以外は null を返す（呼び出し側で再 throw する想定）。
 */
function toErrorResult(e: unknown): { ok: false; error: ActionErrorPayload } | null {
  if (e instanceof ActionError) {
    return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
  }
  if (e instanceof AuthError) {
    return { ok: false, error: { code: e.code, message: e.message } };
  }
  if (e instanceof ZodError) {
    return {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: e.issues.map((issue) => issue.message).join(', '),
      },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// authedAction — 面接官（user）向け Server Action ラッパー
// ---------------------------------------------------------------------------

export function authedAction<I, R>(
  schema: ZodType<I>,
  handler: (input: I, ctx: { userId: string; email: string }) => Promise<R>,
) {
  return async function (rawInput: unknown): Promise<Result<R>> {
    try {
      const user = await requireUser();
      const input = schema.parse(rawInput);
      const data = await handler(input, { userId: user.id, email: user.email });
      return { ok: true, data };
    } catch (e) {
      const errResult = toErrorResult(e);
      if (errResult) return errResult;
      throw e; // 予期しないエラーは再 throw
    }
  };
}

// ---------------------------------------------------------------------------
// adminAction — 創業者（admin）向け Server Action ラッパー
// ---------------------------------------------------------------------------

export function adminAction<I, R>(
  schema: ZodType<I>,
  handler: (input: I, ctx: { userId: string; email: string }) => Promise<R>,
) {
  return async function (rawInput: unknown): Promise<Result<R>> {
    try {
      const user = await requireAdmin();
      const input = schema.parse(rawInput);
      const data = await handler(input, { userId: user.id, email: user.email });
      return { ok: true, data };
    } catch (e) {
      const errResult = toErrorResult(e);
      if (errResult) return errResult;
      throw e; // 予期しないエラーは再 throw
    }
  };
}

// ---------------------------------------------------------------------------
// candidateAction — 候補者向け Server Action ラッパー
//
// requireCandidate を内包し、handler へ candidateProfile を渡す。これにより
// 候補者アクションが「素の async + 手書き try/catch」「authedAction + handler 内
// requireCandidate」等に分裂していたのを 1 パターンへ統一する。
// ---------------------------------------------------------------------------

export function candidateAction<I, R>(
  schema: ZodType<I>,
  handler: (
    input: I,
    ctx: { userId: string; email: string; candidateProfile: CandidateProfile },
  ) => Promise<R>,
) {
  return async function (rawInput: unknown): Promise<Result<R>> {
    try {
      const { user, candidateProfile } = await requireCandidate();
      const input = schema.parse(rawInput);
      const data = await handler(input, {
        userId: user.id,
        email: user.email,
        candidateProfile,
      });
      return { ok: true, data };
    } catch (e) {
      const errResult = toErrorResult(e);
      if (errResult) return errResult;
      throw e; // 予期しないエラーは再 throw
    }
  };
}
