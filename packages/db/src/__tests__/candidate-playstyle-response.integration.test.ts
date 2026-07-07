/**
 * candidate-playstyle-response — 候補者の気質（playstyle）回答取得（実 DB 接続）統合テスト
 *
 * 検証内容（task 7 / Req 8.2, 11.1, 11.2）:
 *  1. playstyle survey を seed 投入し、候補者本人が回答済み → 最新 response（SurveyResponseForAnalysis）を返す。
 *  2. 未回答の候補者 → null を返す。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する（CI はテストを実行しない）。
 *   スキーマは drizzle migrator で自己適用する（適用済みなら no-op）。
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
import { runPlaystyleSkillSurveySeed } from '../seeds/skill-surveys/playstyle';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[candidate-playstyle-response.integration] DATABASE_URL 未設定のためスキップします。');
}

let db: DB;
let getCandidatePlaystyleResponse: typeof import('../queries/class-diagnosis/candidate-playstyle-response')['getCandidatePlaystyleResponse'];

// 後始末用に作成したレコード ID
const created: {
  userIds: string[];
  profileIds: string[];
  responseIds: string[];
} = {
  userIds: [],
  profileIds: [],
  responseIds: [],
};

/** 認証ユーザ + candidate_profile を作成し profileId を返す。 */
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

describeDb('candidate-playstyle-response 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;
    const queryMod = await import('../queries/class-diagnosis/candidate-playstyle-response');
    getCandidatePlaystyleResponse = queryMod.getCandidatePlaystyleResponse;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    // playstyle survey を投入（kind='playstyle'）。冪等。
    await runPlaystyleSkillSurveySeed(db);
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
    // playstyle survey（マスタ）は共有のため削除しない（既存 seed テスト踏襲）。
  });

  it('playstyle 回答済みの候補者 → 最新 response を返す (Req 8.2, 11.1)', async () => {
    const now = new Date();
    const profileId = await createCandidate('playstyle-answered-test');

    // playstyle survey を特定
    const [psSurvey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.kind, 'playstyle'))
      .limit(1);
    expect(psSurvey).toBeTruthy();

    // response を挿入し、各カテゴリの最初の設問に1つ回答する
    const [resp] = await db
      .insert(skillSurveyResponse)
      .values({ candidateProfileId: profileId, skillSurveyId: psSurvey!.id, submittedAt: now })
      .returning({ id: skillSurveyResponse.id });
    created.responseIds.push(resp!.id);

    const cats = await db
      .select({ id: skillSurveyCategory.id })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, psSurvey!.id));
    const catIds = cats.map((c) => c.id);
    const questions = await db
      .select()
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, catIds));

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

    const result = await getCandidatePlaystyleResponse(profileId);

    expect(result).not.toBeNull();
    expect(result!.responseId).toBe(resp!.id);
    expect(result!.surveyId).toBe(psSurvey!.id);
    expect(result!.jobType).toBe('playstyle');
    // 気質カテゴリ（探索と深化 / 個人と協調）が回答束に含まれる
    const categoryNames = result!.categories.map((c) => c.categoryName).sort();
    expect(categoryNames).toEqual(['個人と協調', '探索と深化'].sort());
    // 回答した設問には selectedLevels が解決されている（Likert level）
    const answered = result!.categories.flatMap((c) => c.answers).filter((a) => a.selectedLabels.length > 0);
    expect(answered.length).toBeGreaterThan(0);
    expect(answered.every((a) => a.selectedLevels.length > 0)).toBe(true);
  });

  it('未回答の候補者 → null (Req 8.2)', async () => {
    const profileId = await createCandidate('playstyle-unanswered-test');
    const result = await getCandidatePlaystyleResponse(profileId);
    expect(result).toBeNull();
  });
});
