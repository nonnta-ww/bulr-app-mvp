'use server';

/**
 * recordConsent — 同意記録 Server Action（面接官アテステーション）
 *
 * 責務:
 *  - 面接官アテステーションで consent_obtained_at / consent_version /
 *    consent_method / consent_actor_id を単一 UPDATE で原子的に set する — Req 3.1-3.4
 *  - 版はサーバー側の CURRENT_CONSENT_VERSION を stamp する（client 送信版に依存しない）— Req 4.3
 *  - 既に同意済み（consent_obtained_at 非 null）なら書き込まず既存値を返す（冪等 no-op）— Req 6.2
 *  - 非担当者は requireSessionOwnership で拒否する（NOT_FOUND / FORBIDDEN）— Req 6.1
 *
 * 契約: handler は RecordConsentData を「直接」返す単段契約。
 * recordConsent には業務失敗パスが無い（所有権は requireSessionOwnership が throw、
 * 冪等再実行は no-op で成功扱い）ため、startCapture のような { ok, error } 内包は行わない。
 * authedAction がラップした呼び出し側契約（単段読み）:
 *   result.ok    — 認証/所有権/入力の成否（false: FORBIDDEN | NOT_FOUND | VALIDATION_ERROR）
 *   result.data  — RecordConsentData（result.ok === true のとき）
 *
 * Requirements: 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.3, 6.1, 6.2, 6.3
 * Design: recordConsent (Service Interface, Responsibilities & Constraints)
 */

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { authedAction, requireSessionOwnership } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { interviewSession } from '@bulr/db/schema';

import { CURRENT_CONSENT_VERSION } from '@/lib/consent/consent-notice';

// ---------------------------------------------------------------------------
// 入力スキーマ（Zod）
// ---------------------------------------------------------------------------

const recordConsentSchema = z.object({
  sessionId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// 出力データ（単段契約）
// ---------------------------------------------------------------------------

interface RecordConsentData {
  consentObtainedAt: string; // ISO8601
  consentVersion: string; // CURRENT_CONSENT_VERSION
  alreadyConsented: boolean; // 冪等 no-op だった場合 true
}

// ---------------------------------------------------------------------------
// recordConsent アクション
// ---------------------------------------------------------------------------

/**
 * 同意記録 Server Action。
 *
 * 成功時: `{ ok:true, data:RecordConsentData }`（handler は RecordConsentData を直接返す）
 * 失敗時（認証・所有権・入力）: authedAction 外層で `{ ok:false, error:{ code, message } }`
 */
export const recordConsent = authedAction(
  recordConsentSchema,
  async ({ sessionId }, { userId }): Promise<RecordConsentData> => {
    // -----------------------------------------------------------------------
    // 1. セッション取得
    // -----------------------------------------------------------------------
    const session = await db.query.interviewSession.findFirst({
      where: eq(interviewSession.id, sessionId),
    });

    // -----------------------------------------------------------------------
    // 2. 所有権チェック（Req 6.1）
    //    セッションが存在しない場合は AuthError('NOT_FOUND')、
    //    interviewer_id 不一致は AuthError('FORBIDDEN') を throw。
    //    いずれも authedAction 外層が捕捉し { ok:false, error } を返す。
    // -----------------------------------------------------------------------
    requireSessionOwnership(
      session ? { interviewerId: session.interviewer_id } : null,
      userId,
    );

    // requireSessionOwnership が throw しないならセッションは非 null
    const sess = session!;

    // -----------------------------------------------------------------------
    // 3. 冪等 no-op（Req 6.2）
    //    既に同意済みなら書き込まず既存値を返す。
    // -----------------------------------------------------------------------
    if (sess.consent_obtained_at !== null) {
      return {
        consentObtainedAt: sess.consent_obtained_at.toISOString(),
        consentVersion: sess.consent_version,
        alreadyConsented: true,
      };
    }

    // -----------------------------------------------------------------------
    // 4. 同意記録（Req 2.3, 3.1-3.4, 4.3, 6.3）
    //    4 列を単一 UPDATE で原子的に set する。版はサーバー側の現行版を stamp する。
    // -----------------------------------------------------------------------
    const now = new Date();

    await db
      .update(interviewSession)
      .set({
        consent_obtained_at: now,
        consent_version: CURRENT_CONSENT_VERSION,
        consent_method: 'interviewer_attestation',
        consent_actor_id: userId,
        updated_at: now,
      })
      .where(eq(interviewSession.id, sessionId));

    return {
      consentObtainedAt: now.toISOString(),
      consentVersion: CURRENT_CONSENT_VERSION,
      alreadyConsented: false,
    };
  },
);
