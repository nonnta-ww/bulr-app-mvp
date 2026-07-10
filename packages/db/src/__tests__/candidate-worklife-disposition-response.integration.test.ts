/**
 * candidate-worklife-disposition-response — 統合テスト（実 DB 接続）
 *
 * 本人回答の取得・他者スコープ非取得を検証する（spec: worklife-disposition-survey, R3.5）。
 * DATABASE_URL 未設定時は skip。作成したテストデータは afterAll で削除する。
 */

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import type { DB } from '../client';
import {
  skillSurvey,
  skillSurveyCategory,
  skillSurveyChoice,
  skillSurveyQuestion,
} from '../schema/skill-survey';
import { skillSurveyAnswer, skillSurveyResponse } from '../schema/skill-survey-response';
import { candidateProfile } from '../schema/candidate-profile';
import { user } from '../schema/auth';
import { runWorklifeDispositionSkillSurveySeed } from '../seeds/skill-surveys/worklife-disposition';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[candidate-worklife-disposition-response.integration] DATABASE_URL 未設定のためスキップします。');
}

let db: DB;
let getCandidateWorklifeDispositionResponse: typeof import('../queries/worklife-disposition/candidate-worklife-disposition-response')['getCandidateWorklifeDispositionResponse'];

const created: { userIds: string[]; profileIds: string[]; responseIds: string[] } = {
  userIds: [],
  profileIds: [],
  responseIds: [],
};

async function createCandidate(displayName: string): Promise<string> {
  const now = new Date();
  const userId = `it-${randomUUID()}`;
  created.userIds.push(userId);
  await db
    .insert(user)
    .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  const [prof] = await db
    .insert(candidateProfile)
    .values({ userId, displayName })
    .returning({ id: candidateProfile.id });
  const profileId = prof!.id;
  created.profileIds.push(profileId);
  return profileId;
}

describeDb('candidate-worklife-disposition-response 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;
    const queryMod = await import('../queries/worklife-disposition/candidate-worklife-disposition-response');
    getCandidateWorklifeDispositionResponse = queryMod.getCandidateWorklifeDispositionResponse;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runWorklifeDispositionSkillSurveySeed(db);
  });

  afterAll(async () => {
    if (!db) return;
    if (created.responseIds.length > 0) {
      await db.delete(skillSurveyResponse).where(inArray(skillSurveyResponse.id, created.responseIds));
    }
    if (created.profileIds.length > 0) {
      await db.delete(candidateProfile).where(inArray(candidateProfile.id, created.profileIds));
    }
    if (created.userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, created.userIds));
    }
    // worklife-disposition survey（マスタ）は共有のため削除しない（既存 seed テスト踏襲）。
  });

  it('回答済みの候補者 A → 本人の最新 response を返す（selectedLevels 付き, R3.5）', async () => {
    const now = new Date();
    const profileId = await createCandidate('worklife-answered-test');

    const [wlSurvey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.kind, 'worklife_disposition'))
      .limit(1);
    expect(wlSurvey).toBeTruthy();

    const [resp] = await db
      .insert(skillSurveyResponse)
      .values({ candidateProfileId: profileId, skillSurveyId: wlSurvey!.id, submittedAt: now })
      .returning({ id: skillSurveyResponse.id });
    created.responseIds.push(resp!.id);

    const cats = await db
      .select({ id: skillSurveyCategory.id })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, wlSurvey!.id));
    const catIds = cats.map((c) => c.id);
    const questions = await db
      .select()
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, catIds));

    // 各カテゴリ先頭設問に1択ずつ回答を作る。
    const answers: { responseId: string; questionId: string; selectedChoiceIds: string[] }[] = [];
    const seenCategory = new Set<string>();
    for (const q of questions) {
      if (seenCategory.has(q.categoryId)) continue;
      const [choice] = await db
        .select({ id: skillSurveyChoice.id })
        .from(skillSurveyChoice)
        .where(eq(skillSurveyChoice.questionId, q.id))
        .limit(1);
      if (!choice) continue;
      answers.push({ responseId: resp!.id, questionId: q.id, selectedChoiceIds: [choice.id] });
      seenCategory.add(q.categoryId);
    }
    if (answers.length > 0) {
      await db.insert(skillSurveyAnswer).values(answers);
    }

    const result = await getCandidateWorklifeDispositionResponse(profileId);

    expect(result).not.toBeNull();
    expect(result!.responseId).toBe(resp!.id);
    expect(result!.surveyId).toBe(wlSurvey!.id);
    expect(result!.jobType).toBe('worklife-disposition');
    const answered = result!.categories
      .flatMap((c) => c.answers)
      .filter((a) => a.selectedLabels.length > 0);
    expect(answered.length).toBeGreaterThan(0);
    expect(answered.every((a) => a.selectedLevels.length > 0)).toBe(true);
  });

  it('未回答の別候補者 B → null（本人限定スコープ, R3.5）', async () => {
    const profileId = await createCandidate('worklife-unanswered-test');
    const result = await getCandidateWorklifeDispositionResponse(profileId);
    expect(result).toBeNull();
  });
});
