/**
 * candidate-vocation-source — 候補者職掌ソースの横断取得（実 DB 接続）統合テスト
 *
 * 検証内容（task 4.1 / Req 1.1, 1.2, 8.1）:
 *  1. 候補者の kind='skill' skill-survey を横断し、最新 response をカテゴリ別寄与スコアで返す。
 *     複数 survey（backend / frontend）にまたがって集約され、各カテゴリが正しい jobType を持つ。
 *  2. Issue1（kind フィルタ）: playstyle-kind survey の response は surveys / categories に含めない。
 *  3. Issue2（決定論的フォールバック）: proficiency=null でも frequency フォールバックで
 *     非 null の categoryScore を返し、proficiency/frequency ともに無いカテゴリは
 *     round(coverageRatio*100) にフォールバック（0 固定にならない）。
 *  4. 未回答候補者 → surveys:[], categories:[]。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する（CI はテストを実行しない）。
 * スキーマは drizzle migrator で自己適用する（適用済みなら no-op）。
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
import { runBackendSkillSurveySeed } from '../seeds/skill-surveys/backend';
import { runFrontendSkillSurveySeed } from '../seeds/skill-surveys/frontend';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[candidate-vocation-source.integration] DATABASE_URL 未設定のためスキップします。');
}

// 動的 import で取得する値（DATABASE_URL があるときのみ client を評価する）
let db: DB;
let getCandidateVocationSource: typeof import('../queries/class-diagnosis/candidate-vocation-source')['getCandidateVocationSource'];

// 後始末用に作成したレコード ID
const created: {
  userIds: string[];
  profileIds: string[];
  responseIds: string[];
  // テストで作成した survey 群（skill / playstyle）。子 → 親の順で削除する。
  customSurveyIds: string[];
  customCategoryIds: string[];
  customQuestionIds: string[];
  customChoiceIds: string[];
} = {
  userIds: [],
  profileIds: [],
  responseIds: [],
  customSurveyIds: [],
  customCategoryIds: [],
  customQuestionIds: [],
  customChoiceIds: [],
};

/**
 * 指定 survey の各カテゴリについて proficiency 設問を 1 問「level=最大」で回答する answer 行を組む。
 * proficiency 設問が無いカテゴリは、（あれば）frequency 設問を回答し、それも無ければ
 * 任意設問を 1 問選択回答して coverage フォールバックを効かせる。
 */
async function buildAnswersForSurvey(surveyId: string, responseId: string) {
  const cats = await db
    .select({ id: skillSurveyCategory.id })
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
  const catIds = cats.map((c) => c.id);
  if (catIds.length === 0) return [] as { responseId: string; questionId: string; selectedChoiceIds: string[] }[];

  const questions = await db
    .select()
    .from(skillSurveyQuestion)
    .where(inArray(skillSurveyQuestion.categoryId, catIds));

  const answers: { responseId: string; questionId: string; selectedChoiceIds: string[] }[] = [];
  const seenCategory = new Set<string>();

  for (const q of questions) {
    if (seenCategory.has(q.categoryId)) continue;
    const choices = await db
      .select()
      .from(skillSurveyChoice)
      .where(eq(skillSurveyChoice.questionId, q.id));
    if (choices.length === 0) continue;
    // level を持つ選択肢を優先（proficiency/frequency のスコア寄与のため）
    const leveled = choices.filter((c) => c.level !== null);
    const pick = leveled.length > 0 ? leveled[leveled.length - 1]! : choices[0]!;
    answers.push({ responseId, questionId: q.id, selectedChoiceIds: [pick.id] });
    seenCategory.add(q.categoryId);
  }
  return answers;
}

describeDb('candidate-vocation-source 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;
    const queryMod = await import('../queries/class-diagnosis/candidate-vocation-source');
    getCandidateVocationSource = queryMod.getCandidateVocationSource;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    // skill-kind survey を 2 本投入（横断集約の土台）
    await runBackendSkillSurveySeed(db);
    await runFrontendSkillSurveySeed(db);
  });

  afterAll(async () => {
    if (!db) return;
    if (created.responseIds.length > 0) {
      await db.delete(skillSurveyResponse).where(inArray(skillSurveyResponse.id, created.responseIds));
    }
    if (created.customChoiceIds.length > 0) {
      await db.delete(skillSurveyChoice).where(inArray(skillSurveyChoice.id, created.customChoiceIds));
    }
    if (created.customQuestionIds.length > 0) {
      await db.delete(skillSurveyQuestion).where(inArray(skillSurveyQuestion.id, created.customQuestionIds));
    }
    if (created.customCategoryIds.length > 0) {
      await db.delete(skillSurveyCategory).where(inArray(skillSurveyCategory.id, created.customCategoryIds));
    }
    if (created.customSurveyIds.length > 0) {
      await db.delete(skillSurvey).where(inArray(skillSurvey.id, created.customSurveyIds));
    }
    if (created.profileIds.length > 0) {
      await db.delete(candidateProfile).where(inArray(candidateProfile.id, created.profileIds));
    }
    if (created.userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, created.userIds));
    }
  });

  it('kind=skill の複数 survey を横断集約し、各カテゴリが正しい jobType を持つ (Req 1.1, 1.2)', async () => {
    const now = new Date();
    const userId = `it-${randomUUID()}`;
    created.userIds.push(userId);
    await db
      .insert(user)
      .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
    const [prof] = await db
      .insert(candidateProfile)
      .values({ userId, displayName: 'vocation-source-test' })
      .returning({ id: candidateProfile.id });
    const profileId = prof!.id;
    created.profileIds.push(profileId);

    // backend / frontend の survey を取得
    const [backendSurvey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'backend'))
      .limit(1);
    const [frontendSurvey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'frontend'))
      .limit(1);
    expect(backendSurvey && frontendSurvey).toBeTruthy();

    // 両 survey に response + answers を挿入
    for (const s of [backendSurvey!, frontendSurvey!]) {
      const [resp] = await db
        .insert(skillSurveyResponse)
        .values({ candidateProfileId: profileId, skillSurveyId: s.id, submittedAt: now })
        .returning({ id: skillSurveyResponse.id });
      created.responseIds.push(resp!.id);
      const answers = await buildAnswersForSurvey(s.id, resp!.id);
      if (answers.length > 0) {
        await db.insert(skillSurveyAnswer).values(answers);
      }
    }

    const result = await getCandidateVocationSource(profileId);

    // surveys が 2 本（backend / frontend）返る
    const jobTypes = result.surveys.map((s) => s.jobType).sort();
    expect(jobTypes).toEqual(['backend', 'frontend']);
    // overallCoverageRatio は 0 超（回答済み）
    expect(result.surveys.every((s) => s.overallCoverageRatio > 0)).toBe(true);

    // categories が両 survey にまたがり、各カテゴリが正しい jobType を持つ
    const backendJobType = result.surveys.find((s) => s.jobType === 'backend')!;
    const frontendJobType = result.surveys.find((s) => s.jobType === 'frontend')!;
    const backendCats = result.categories.filter((c) => c.surveyId === backendJobType.surveyId);
    const frontendCats = result.categories.filter((c) => c.surveyId === frontendJobType.surveyId);
    expect(backendCats.length).toBeGreaterThan(0);
    expect(frontendCats.length).toBeGreaterThan(0);
    expect(backendCats.every((c) => c.jobType === 'backend')).toBe(true);
    expect(frontendCats.every((c) => c.jobType === 'frontend')).toBe(true);

    // 同一 (surveyId, categoryName) は 1 回のみ（同名カテゴリのマージ）
    for (const surveyId of [backendJobType.surveyId, frontendJobType.surveyId]) {
      const names = result.categories.filter((c) => c.surveyId === surveyId).map((c) => c.categoryName);
      expect(new Set(names).size).toBe(names.length);
    }

    // 回答したカテゴリは categoryScore 非 null（proficiency/frequency/coverage いずれかで解決）
    const answered = result.categories.filter((c) => c.answeredCount > 0);
    expect(answered.length).toBeGreaterThan(0);
    expect(answered.every((c) => c.categoryScore !== null)).toBe(true);
  });

  it('playstyle-kind survey の response は含めない (Issue1 — kind フィルタ)', async () => {
    const now = new Date();
    const userId = `it-${randomUUID()}`;
    created.userIds.push(userId);
    await db
      .insert(user)
      .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
    const [prof] = await db
      .insert(candidateProfile)
      .values({ userId, displayName: 'playstyle-exclusion-test' })
      .returning({ id: candidateProfile.id });
    const profileId = prof!.id;
    created.profileIds.push(profileId);

    // playstyle survey を最小構成で作成
    const [psSurvey] = await db
      .insert(skillSurvey)
      .values({
        jobType: `playstyle-it-${randomUUID()}`,
        kind: 'playstyle',
        title: 'playstyle-test',
      })
      .returning({ id: skillSurvey.id });
    created.customSurveyIds.push(psSurvey!.id);
    const [psCat] = await db
      .insert(skillSurveyCategory)
      .values({ skillSurveyId: psSurvey!.id, name: 'playstyle-cat', displayOrder: 0 })
      .returning({ id: skillSurveyCategory.id });
    created.customCategoryIds.push(psCat!.id);
    const [psQ] = await db
      .insert(skillSurveyQuestion)
      .values({
        categoryId: psCat!.id,
        body: 'playstyle-q',
        questionType: 'single_choice',
        scoringKind: 'polarity',
        displayOrder: 0,
      })
      .returning({ id: skillSurveyQuestion.id });
    created.customQuestionIds.push(psQ!.id);
    const [psChoice] = await db
      .insert(skillSurveyChoice)
      .values({ questionId: psQ!.id, label: 'playstyle-choice', displayOrder: 0 })
      .returning({ id: skillSurveyChoice.id });
    created.customChoiceIds.push(psChoice!.id);

    // playstyle survey に response を挿入
    const [psResp] = await db
      .insert(skillSurveyResponse)
      .values({ candidateProfileId: profileId, skillSurveyId: psSurvey!.id, submittedAt: now })
      .returning({ id: skillSurveyResponse.id });
    created.responseIds.push(psResp!.id);
    await db
      .insert(skillSurveyAnswer)
      .values({ responseId: psResp!.id, questionId: psQ!.id, selectedChoiceIds: [psChoice!.id] });

    const result = await getCandidateVocationSource(profileId);

    // playstyle survey が surveys / categories に含まれないこと
    expect(result.surveys.some((s) => s.surveyId === psSurvey!.id)).toBe(false);
    expect(result.categories.some((c) => c.surveyId === psSurvey!.id)).toBe(false);
    // playstyle しか回答していないので空
    expect(result.surveys).toEqual([]);
    expect(result.categories).toEqual([]);
  });

  it('proficiency=null は frequency / coverage フォールバックで非 0 に解決される (Issue2)', async () => {
    const now = new Date();
    const userId = `it-${randomUUID()}`;
    created.userIds.push(userId);
    await db
      .insert(user)
      .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
    const [prof] = await db
      .insert(candidateProfile)
      .values({ userId, displayName: 'fallback-test' })
      .returning({ id: candidateProfile.id });
    const profileId = prof!.id;
    created.profileIds.push(profileId);

    // seed survey は frequency 設問を持たない（backend/frontend は proficiency/recency のみ）。
    // Issue2 を決定論的に検証するため、frequency 設問（カテゴリ A）と free_text 設問（カテゴリ B）を
    // 持つ最小の kind='skill' survey を作成する。
    const [customSurvey] = await db
      .insert(skillSurvey)
      .values({
        jobType: `skill-fallback-it-${randomUUID()}`,
        kind: 'skill',
        title: 'fallback-skill-survey',
      })
      .returning({ id: skillSurvey.id });
    const customSurveyId = customSurvey!.id;
    created.customSurveyIds.push(customSurveyId);

    // カテゴリ A: frequency 設問（proficiency=null → frequency フォールバック）
    const [freqCatRow] = await db
      .insert(skillSurveyCategory)
      .values({ skillSurveyId: customSurveyId, name: 'freq-cat', displayOrder: 0 })
      .returning({ id: skillSurveyCategory.id });
    created.customCategoryIds.push(freqCatRow!.id);
    const [freqQ] = await db
      .insert(skillSurveyQuestion)
      .values({
        categoryId: freqCatRow!.id,
        body: 'freq-q',
        questionType: 'single_choice',
        scoringKind: 'frequency',
        displayOrder: 0,
      })
      .returning({ id: skillSurveyQuestion.id });
    created.customQuestionIds.push(freqQ!.id);
    const [freqChoice] = await db
      .insert(skillSurveyChoice)
      .values({ questionId: freqQ!.id, label: 'freq-choice', level: 3, displayOrder: 0 })
      .returning({ id: skillSurveyChoice.id });
    created.customChoiceIds.push(freqChoice!.id);

    // カテゴリ B: free_text 設問（scoringKind=null → coverage フォールバック）
    const [freeCatRow] = await db
      .insert(skillSurveyCategory)
      .values({ skillSurveyId: customSurveyId, name: 'free-cat', displayOrder: 1 })
      .returning({ id: skillSurveyCategory.id });
    created.customCategoryIds.push(freeCatRow!.id);
    const [freeQ] = await db
      .insert(skillSurveyQuestion)
      .values({
        categoryId: freeCatRow!.id,
        body: 'free-q',
        questionType: 'free_text',
        displayOrder: 0,
      })
      .returning({ id: skillSurveyQuestion.id });
    created.customQuestionIds.push(freeQ!.id);

    const [resp] = await db
      .insert(skillSurveyResponse)
      .values({ candidateProfileId: profileId, skillSurveyId: customSurveyId, submittedAt: now })
      .returning({ id: skillSurveyResponse.id });
    created.responseIds.push(resp!.id);

    await db.insert(skillSurveyAnswer).values([
      // frequency 設問のみ回答 → そのカテゴリは proficiency=null / frequency 非 null
      { responseId: resp!.id, questionId: freqQ!.id, selectedChoiceIds: [freqChoice!.id] },
      // free_text 設問のみ回答 → そのカテゴリは proficiency=null / frequency=null / coverage>0
      { responseId: resp!.id, questionId: freeQ!.id, selectedChoiceIds: [], freeText: '自由記述回答' },
    ]);

    const result = await getCandidateVocationSource(profileId);
    const survey = result.surveys.find((s) => s.surveyId === customSurveyId);
    expect(survey).toBeTruthy();

    const freqCat = result.categories.find(
      (c) => c.surveyId === customSurveyId && c.categoryName === 'freq-cat',
    );
    const freeCat = result.categories.find(
      (c) => c.surveyId === customSurveyId && c.categoryName === 'free-cat',
    );
    expect(freqCat).toBeTruthy();
    expect(freeCat).toBeTruthy();

    // frequency フォールバック: 非 null かつ 0 超
    expect(freqCat!.categoryScore).not.toBeNull();
    expect(freqCat!.categoryScore!).toBeGreaterThan(0);
    expect(freqCat!.answeredCount).toBeGreaterThan(0);

    // coverage フォールバック: proficiency も frequency も無いが coverage>0 で非 null（0 固定にしない）
    expect(freeCat!.categoryScore).not.toBeNull();
    expect(freeCat!.categoryScore!).toBeGreaterThan(0);
    expect(freeCat!.answeredCount).toBeGreaterThan(0);
  });

  it('未回答候補者は surveys:[] / categories:[] (Req 8.1)', async () => {
    const now = new Date();
    const userId = `it-${randomUUID()}`;
    created.userIds.push(userId);
    await db
      .insert(user)
      .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
    const [prof] = await db
      .insert(candidateProfile)
      .values({ userId, displayName: 'unanswered-test' })
      .returning({ id: candidateProfile.id });
    created.profileIds.push(prof!.id);

    const result = await getCandidateVocationSource(prof!.id);
    expect(result.surveys).toEqual([]);
    expect(result.categories).toEqual([]);
  });
});
