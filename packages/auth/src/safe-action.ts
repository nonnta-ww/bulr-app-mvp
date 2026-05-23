/**
 * Server Action ラッパー（safe-action.ts）
 *
 * すべての mutation は authedAction / adminAction でラップすること。
 * 素の async function で Server Action を書かない。
 * これは security.md の多層認証パターンに従う標準パターン。
 *
 * Requirements: 5.6-5.10, 9.6
 */

import { ZodError, ZodType } from 'zod';

import { AuthError } from './errors';
import { requireAdmin, requireUser } from './guards';

// ---------------------------------------------------------------------------
// Result 型
// ---------------------------------------------------------------------------

export type Result<R> =
  | { ok: true; data: R }
  | { ok: false; error: { code: string; message: string } };

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
      throw e; // 予期しないエラーは再 throw
    }
  };
}
