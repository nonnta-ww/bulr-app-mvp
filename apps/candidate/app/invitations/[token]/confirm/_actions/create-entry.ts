'use server';

/**
 * createEntry — 招待トークンを消費してエントリーを作成する Server Action
 *
 * - authedAction でラップし、requireCandidate で候補者プロファイルを取得する。
 * - invitation を token で検索し、未消費であることを確認する。
 * - 履歴書スナップショット（primary）およびスキルアンケート回答スナップショットを取得する。
 * - transaction 内で entry INSERT + invitation.consumed_at を条件付き UPDATE する（race condition 対策）。
 * - 成功時は /entries にリダイレクトする。
 *
 * Requirements: entry-flow 2.1
 */

import { z } from 'zod';
import { nanoid } from 'nanoid';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { authedAction, requireCandidate, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { entry, invitation, skillSurvey } from '@bulr/db/schema';
import { getPrimaryResumeDocument, getLatestResponseByCandidateProfileId } from '@bulr/db';

import { isUniqueViolation } from './pg-error';

const createEntrySchema = z.object({
  token: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/).max(256),
});

export const createEntry = authedAction(createEntrySchema, async ({ token }, _ctx) => {
  const { candidateProfile } = await requireCandidate();

  // 1. invitation を token で SELECT
  const [inv] = await db
    .select({ id: invitation.id, openingId: invitation.openingId, consumedAt: invitation.consumedAt })
    .from(invitation)
    .where(eq(invitation.token, token))
    .limit(1);

  if (!inv) {
    return { ok: false as const, error: { code: 'INVALID_TOKEN', message: '招待リンクが無効です' } };
  }
  if (inv.consumedAt !== null) {
    return { ok: false as const, error: { code: 'ALREADY_CONSUMED', message: 'この招待リンクは既に使用されています' } };
  }

  // 2. 履歴書スナップショット (primary) を取得 — 履歴書種別 '履歴書'
  const primaryResume = await getPrimaryResumeDocument(candidateProfile.id, '履歴書');

  // 3. スキルアンケート回答スナップショット
  // MVP: skill_survey から job_type='backend' AND is_active=true で取得
  // 取得できない場合は skill_survey_response_id を NULL のまま entry 作成（アンケート未投入でもエントリー可能）
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(and(eq(skillSurvey.jobType, 'backend'), eq(skillSurvey.isActive, true)))
    .limit(1);

  let skillSurveyResponseId: string | null = null;
  if (survey) {
    const response = await getLatestResponseByCandidateProfileId(candidateProfile.id, survey.id);
    skillSurveyResponseId = response?.response.id ?? null;
  }

  // 4. transaction: entry INSERT + invitation.consumed_at UPDATE (race condition 対策: WHERE consumed_at IS NULL)
  const entryId = nanoid();

  try {
    await db.transaction(async (tx) => {
      // invitation.consumed_at を NULL → now() に更新（条件付き UPDATE で race-safe）
      await tx
        .update(invitation)
        .set({ consumedAt: sql`now()` })
        .where(and(eq(invitation.id, inv.id), isNull(invitation.consumedAt)));

      // affected rows が 0 なら他者が先に consume したので recheck で検知する
      const [recheck] = await tx
        .select({ consumedAt: invitation.consumedAt })
        .from(invitation)
        .where(eq(invitation.id, inv.id))
        .limit(1);

      if (!recheck || recheck.consumedAt === null) {
        throw new Error('CONSUME_RACE');
      }

      // entry INSERT
      await tx.insert(entry).values({
        id: entryId,
        candidateProfileId: candidateProfile.id,
        openingId: inv.openingId,
        invitationId: inv.id,
        resumeDocumentId: primaryResume?.id ?? null,
        skillSurveyResponseId,
        status: 'submitted',
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('CONSUME_RACE')) {
      return { ok: false as const, error: { code: 'ALREADY_CONSUMED', message: '他のリクエストが先にエントリーしました' } };
    }
    // UNIQUE(candidate_profile_id, opening_id) 違反 → 重複エントリー
    // drizzle 0.45 は DrizzleQueryError でラップするため err.cause チェーンを辿って判定する
    if (isUniqueViolation(err, 'entry_candidate_opening_uniq')) {
      return { ok: false as const, error: { code: 'DUPLICATE_ENTRY', message: '同じ募集に既にエントリー済みです' } };
    }
    if (err instanceof AuthError) {
      return { ok: false as const, error: { code: err.code, message: err.message } };
    }
    throw err;
  }

  // cookie クリア（__Secure- プレフィックス付き名も考慮: 両方を maxAge: 0 でクリア）
  const cookieStore = await cookies();
  cookieStore.set('pending_invitation_token', '', { maxAge: 0, path: '/' });
  cookieStore.set('__Secure-pending_invitation_token', '', { maxAge: 0, path: '/', secure: true });

  // redirect は transaction の外で呼ぶ
  redirect('/entries');
});
