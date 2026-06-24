/**
 * ai-driven-development — seed 冪等性 & 回答経路の結合テスト（実 DB 接続）
 *
 * 検証内容（task 4.2 / Req 8.2, 8.4, 4.2）:
 *  A. seed 冪等性 & 件数 (Req 8.2, 8.4)
 *     - runAiDrivenDevelopmentSkillSurveySeed を複数回実行しても重複行が生じない。
 *     - jobType='ai-driven-development' に限定したカテゴリ/設問/必須/frequency/level 件数が仕様通り。
 *       (カテゴリ=6, 設問=18, isRequired=true=3, scoringKind='frequency'=2)
 *     - スコア対象 single_choice 設問の全選択肢が level を持つ（level=null ゼロ）。
 *  B. 回答→ソース構築で frequency が透過する (Req 4.2 経路前半)
 *     - frequency 設問に回答し getSurveyResponseByResponseId で束ねると、
 *       scoringKind='frequency' かつ selectedLevels=[選択 level] が解決される。
 *     - aggregate 関数（apps/candidate）への接続前の「答え→ソース束」が
 *       frequencyScore 算出に必要な形を満たすことを証明する。
 *  C. 発見可能性 — AI アンケートがアクティブ一覧・自己分析発見経路に現れる (Req 1.2, 7.1, 7.3)
 *     - isActive=true クエリ（候補者一覧ページと同じ）に jobType='ai-driven-development' が含まれる。
 *     - 候補者が回答後、getAnsweredSurveysForCandidate が jobType='ai-driven-development' を返す。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する（CI はテストを実行しない）。
 * スキーマは drizzle migrator で自己適用する。
 */

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';

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
import { runAiDrivenDevelopmentSkillSurveySeed } from '../seeds/skill-surveys/ai-driven-development';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[ai-driven-development.integration] DATABASE_URL 未設定のためスキップします。');
}

// 動的 import で取得する値（DATABASE_URL があるときのみ client を評価する）
let db: DB;
let getSurveyResponseByResponseId: typeof import('../queries/self-analysis/analysis-source-query')['getSurveyResponseByResponseId'];
let getAnsweredSurveysForCandidate: typeof import('../queries/self-analysis/answered-surveys-query')['getAnsweredSurveysForCandidate'];

// 後始末用に作成したレコード ID（テスト B: frequency 回答経路）
const created: { userId?: string; profileId?: string; responseId?: string } = {};

// 後始末用に作成したレコード ID（テスト C: 発見可能性）
const createdDisc: { userId?: string; profileId?: string; responseId?: string } = {};

describeDb('ai-driven-development 統合テスト', () => {
  beforeAll(async () => {
    // client（DATABASE_URL を要求）と query を動的 import
    const clientMod = await import('../client');
    db = clientMod.db;
    const queryMod = await import('../queries/self-analysis/analysis-source-query');
    getSurveyResponseByResponseId = queryMod.getSurveyResponseByResponseId;
    const answeredMod = await import('../queries/self-analysis/answered-surveys-query');
    getAnsweredSurveysForCandidate = answeredMod.getAnsweredSurveysForCandidate;

    // スキーマを migrator で自己適用（適用済みなら no-op）
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    // seed を1回投入（以降のクエリテストの土台）
    await runAiDrivenDevelopmentSkillSurveySeed(db);
  });

  afterAll(async () => {
    if (!db) return;
    // テスト B クリーンアップ
    if (created.responseId) {
      await db.delete(skillSurveyResponse).where(eq(skillSurveyResponse.id, created.responseId));
    }
    if (created.profileId) {
      await db.delete(candidateProfile).where(eq(candidateProfile.id, created.profileId));
    }
    if (created.userId) {
      await db.delete(user).where(eq(user.id, created.userId));
    }
    // テスト C（発見可能性）クリーンアップ
    if (createdDisc.responseId) {
      await db
        .delete(skillSurveyResponse)
        .where(eq(skillSurveyResponse.id, createdDisc.responseId));
    }
    if (createdDisc.profileId) {
      await db.delete(candidateProfile).where(eq(candidateProfile.id, createdDisc.profileId));
    }
    if (createdDisc.userId) {
      await db.delete(user).where(eq(user.id, createdDisc.userId));
    }
  });

  // ---------------------------------------------------------------------------
  // Test A: seed 冪等性 & 件数 (Req 8.2, 8.4)
  // ---------------------------------------------------------------------------

  it('seed 再実行で重複行が生じず、投入件数が仕様通りである (Req 8.2, 8.4)', async () => {
    // ---- スコープを jobType='ai-driven-development' に限定してカウント取得 ----
    // survey → category → question → choice の JOIN で AI survey のみ集計する。
    // DB には backend survey も存在するため、全テーブルを WHERE なしで数えると混在する。

    const [aiSurvey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'ai-driven-development'))
      .limit(1);
    expect(aiSurvey).toBeTruthy();
    const aiSurveyId = aiSurvey!.id;

    // カテゴリ ID を取得（以降の絞り込みに使用）
    const categoryRows = await db
      .select({ id: skillSurveyCategory.id })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, aiSurveyId));

    const categoryIds = categoryRows.map((r) => r.id);

    // 設問 ID を取得
    const questionRows = await db
      .select({ id: skillSurveyQuestion.id })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, categoryIds));

    const questionIds = questionRows.map((r) => r.id);

    // --- 初回件数スナップショット ---
    const beforeCategoryCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyCategory)
          .where(eq(skillSurveyCategory.skillSurveyId, aiSurveyId))
      )[0]?.c ?? 0;

    const beforeQuestionCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyQuestion)
          .where(inArray(skillSurveyQuestion.categoryId, categoryIds))
      )[0]?.c ?? 0;

    const beforeChoiceCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyChoice)
          .where(inArray(skillSurveyChoice.questionId, questionIds))
      )[0]?.c ?? 0;

    // --- 2 回目・3 回目の冪等実行 ---
    await runAiDrivenDevelopmentSkillSurveySeed(db);
    await runAiDrivenDevelopmentSkillSurveySeed(db);

    // --- 冪等後件数スナップショット（ID が変わっていない前提で同じ絞り込みが使える） ---
    const afterCategoryCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyCategory)
          .where(eq(skillSurveyCategory.skillSurveyId, aiSurveyId))
      )[0]?.c ?? 0;

    const afterQuestionCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyQuestion)
          .where(inArray(skillSurveyQuestion.categoryId, categoryIds))
      )[0]?.c ?? 0;

    const afterChoiceCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyChoice)
          .where(inArray(skillSurveyChoice.questionId, questionIds))
      )[0]?.c ?? 0;

    // 冪等性: 再実行で行数が変わらない
    expect(afterCategoryCount).toBe(beforeCategoryCount);
    expect(afterQuestionCount).toBe(beforeQuestionCount);
    expect(afterChoiceCount).toBe(beforeChoiceCount);

    // --- 仕様件数アサーション（Req 8.4） ---
    // カテゴリ = 6
    expect(afterCategoryCount).toBe(6);
    // 設問 = 18
    expect(afterQuestionCount).toBe(18);

    // isRequired=true = 3
    const requiredCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyQuestion)
          .where(
            and(
              inArray(skillSurveyQuestion.categoryId, categoryIds),
              eq(skillSurveyQuestion.isRequired, true),
            ),
          )
      )[0]?.c ?? 0;
    expect(requiredCount).toBe(3);

    // scoringKind='frequency' = 2
    const frequencyCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyQuestion)
          .where(
            and(
              inArray(skillSurveyQuestion.categoryId, categoryIds),
              eq(skillSurveyQuestion.scoringKind, 'frequency'),
            ),
          )
      )[0]?.c ?? 0;
    expect(frequencyCount).toBe(2);

    // スコア対象 single_choice の全選択肢が level を持つ（level=null の選択肢がゼロ）
    // スコア対象設問 ID を取得
    const scoredQuestionRows = await db
      .select({ id: skillSurveyQuestion.id })
      .from(skillSurveyQuestion)
      .where(
        and(
          inArray(skillSurveyQuestion.categoryId, categoryIds),
          eq(skillSurveyQuestion.questionType, 'single_choice'),
        ),
      );

    const scoredQuestionIds = scoredQuestionRows.map((r) => r.id);

    const levelNullCount =
      scoredQuestionIds.length > 0
        ? (
            await db
              .select({ c: count() })
              .from(skillSurveyChoice)
              .where(
                and(
                  inArray(skillSurveyChoice.questionId, scoredQuestionIds),
                  isNull(skillSurveyChoice.level),
                ),
              )
          )[0]?.c ?? 0
        : 0;

    // scored single_choice の選択肢で level=null のものはゼロであること
    expect(levelNullCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test B: 回答→ソース構築で frequency が透過する (Req 4.2 経路前半)
  // ---------------------------------------------------------------------------

  it('frequency 回答が getSurveyResponseByResponseId で scoringKind/selectedLevels として解決される (Req 4.2)', async () => {
    /*
     * レイヤー説明:
     *   この DB パッケージは apps/candidate のアプリ層から利用される「下位」パッケージ。
     *   aggregate 関数（buildCategoryAnalysis 等）は apps/candidate に属し、
     *   ここからは import できない（dependency direction: apps → packages は一方向）。
     *
     *   本テストは「回答 → DB クエリ → SurveyResponseForAnalysis（ソース束）」の
     *   前半経路のみを検証する。
     *   ソース bundle の scoringKind='frequency' と selectedLevels=[level] が
     *   正しく解決されることで、aggregate 関数が frequencyScore を算出できる形が
     *   保証される。
     *
     *   後半「ソース束 → frequencyScore」は aggregate.test.ts（tasks 2.1/4.1）の
     *   ユニットテストで網羅済み。両テストを合わせると
     *   「回答 → ソース → aggregate → frequencyScore」の経路が Req 4.2 として閉じる。
     */

    // AI survey ID の取得
    const [aiSurvey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'ai-driven-development'))
      .limit(1);
    expect(aiSurvey).toBeTruthy();
    const aiSurveyId = aiSurvey!.id;

    // カテゴリ一覧を取得
    const categoryRows = await db
      .select({ id: skillSurveyCategory.id })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, aiSurveyId));
    const categoryIds = categoryRows.map((r) => r.id);

    // frequency 設問を1件取得
    const [freqQ] = await db
      .select()
      .from(skillSurveyQuestion)
      .where(
        and(
          inArray(skillSurveyQuestion.categoryId, categoryIds),
          eq(skillSurveyQuestion.scoringKind, 'frequency'),
        ),
      )
      .limit(1);
    expect(freqQ).toBeTruthy();

    // frequency 設問の選択肢から level が非 null のものを1件取得
    const freqChoices = await db
      .select()
      .from(skillSurveyChoice)
      .where(eq(skillSurveyChoice.questionId, freqQ!.id));
    const freqPick = freqChoices.find((c) => c.level !== null) ?? freqChoices[0]!;
    expect(freqPick.level).not.toBeNull();

    // proficiency 設問を1件取得（リアリティのため追加回答）
    const [profQ] = await db
      .select()
      .from(skillSurveyQuestion)
      .where(
        and(
          inArray(skillSurveyQuestion.categoryId, categoryIds),
          eq(skillSurveyQuestion.scoringKind, 'proficiency'),
        ),
      )
      .limit(1);
    expect(profQ).toBeTruthy();
    const profChoices = await db
      .select()
      .from(skillSurveyChoice)
      .where(eq(skillSurveyChoice.questionId, profQ!.id));
    const profPick = profChoices[0]!;

    // multi_choice かつ scoringKind=null の設問を1件取得（リアリティのため追加回答）
    const [multiQ] = await db
      .select()
      .from(skillSurveyQuestion)
      .where(
        and(
          inArray(skillSurveyQuestion.categoryId, categoryIds),
          eq(skillSurveyQuestion.questionType, 'multi_choice'),
        ),
      )
      .limit(1);
    expect(multiQ).toBeTruthy();
    const multiChoices = await db
      .select()
      .from(skillSurveyChoice)
      .where(eq(skillSurveyChoice.questionId, multiQ!.id));
    const multiPick = multiChoices.slice(0, 2);

    // --- テストデータ投入 ---
    const now = new Date();
    const userId = `it-aiddriven-${randomUUID()}`;
    created.userId = userId;
    await db.insert(user).values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    const [prof] = await db
      .insert(candidateProfile)
      .values({ userId, displayName: 'integration-test-ai' })
      .returning({ id: candidateProfile.id });
    created.profileId = prof!.id;

    const [resp] = await db
      .insert(skillSurveyResponse)
      .values({ candidateProfileId: prof!.id, skillSurveyId: aiSurveyId, submittedAt: now })
      .returning({ id: skillSurveyResponse.id });
    created.responseId = resp!.id;

    await db.insert(skillSurveyAnswer).values([
      // frequency 回答（本テストの主題）
      { responseId: resp!.id, questionId: freqQ!.id, selectedChoiceIds: [freqPick.id] },
      // proficiency 回答（リアリティ）
      { responseId: resp!.id, questionId: profQ!.id, selectedChoiceIds: [profPick.id] },
      // multi_choice 回答（リアリティ）
      { responseId: resp!.id, questionId: multiQ!.id, selectedChoiceIds: multiPick.map((c) => c.id) },
    ]);

    // --- クエリ実行 ---
    const bundle = await getSurveyResponseByResponseId(prof!.id, resp!.id);
    expect(bundle).not.toBeNull();

    // frequency 回答の解決を検証
    const flat = bundle!.categories.flatMap((c) => c.answers);
    const freqAnswer = flat.find((a) => a.questionId === freqQ!.id);
    expect(freqAnswer).toBeDefined();

    // scoringKind が 'frequency' として透過されること（Req 4.2 の要求）
    expect(freqAnswer!.scoringKind).toBe('frequency');

    // selectedLevels が選択した level を持つこと（aggregate への入力形）
    expect(freqAnswer!.selectedLevels).toEqual([freqPick.level]);

    // proficiency 回答は frequency に混入しないこと（独立性の確認）
    const profAnswer = flat.find((a) => a.questionId === profQ!.id);
    expect(profAnswer).toBeDefined();
    expect(profAnswer!.scoringKind).toBe('proficiency');
    expect(profAnswer!.selectedLevels).toEqual([profPick.level]);
  });

  // ---------------------------------------------------------------------------
  // Test C: 発見可能性 — AI アンケートがアクティブ一覧・自己分析発見経路に現れる
  //         (Req 1.2, 7.1, 7.3 — task 4.3)
  // ---------------------------------------------------------------------------

  it('isActive=true クエリが jobType="ai-driven-development" の行を返す (Req 1.2)', async () => {
    /*
     * 候補者一覧ページ（apps/candidate/app/skill-survey/page.tsx）は
     *   db.select().from(skillSurvey).where(eq(skillSurvey.isActive, true))
     * で全アクティブ survey を取得する。本テストはそのクエリを直接再現し、
     * AI アンケートが確実に一覧に含まれることを確認する。
     * AI アンケートが inactive に変更されたり削除されると失敗する（有意なテスト）。
     */
    const activeRows = await db.select().from(skillSurvey).where(eq(skillSurvey.isActive, true));

    const aiRow = activeRows.find((r) => r.jobType === 'ai-driven-development');
    expect(aiRow).toBeDefined();
    expect(aiRow!.isActive).toBe(true);
    expect(aiRow!.jobType).toBe('ai-driven-development');
  });

  it('候補者が AI アンケートに回答後、getAnsweredSurveysForCandidate が jobType="ai-driven-development" を返す (Req 7.1, 7.3)', async () => {
    /*
     * 自己分析発見経路:
     *   getAnsweredSurveysForCandidate（packages/db/src/queries/self-analysis/answered-surveys-query.ts）
     * は skill_survey_response を skill_survey に JOIN し、候補者が回答済みの survey を
     * 集約して返す。本テストは AI アンケートへの回答を投入し、この survey-agnostic な
     * クエリが jobType='ai-driven-development' を返すことを確認する。
     * AI アンケートが DB に存在しないか isActive=false でも response JOIN は成功するが、
     * 回答レコードが存在しなければ空配列が返り失敗する（有意なテスト）。
     */

    // AI survey ID の取得
    const [aiSurvey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'ai-driven-development'))
      .limit(1);
    expect(aiSurvey).toBeTruthy();
    const aiSurveyId = aiSurvey!.id;

    // 発見可能性テスト専用のユーザー・プロフィール・回答を作成（created とは別の ID）
    const now = new Date();
    const discUserId = `it-disc-${randomUUID()}`;
    createdDisc.userId = discUserId;
    await db.insert(user).values({
      id: discUserId,
      email: `${discUserId}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    const [discProf] = await db
      .insert(candidateProfile)
      .values({ userId: discUserId, displayName: 'disc-test-ai' })
      .returning({ id: candidateProfile.id });
    createdDisc.profileId = discProf!.id;

    const [discResp] = await db
      .insert(skillSurveyResponse)
      .values({
        candidateProfileId: discProf!.id,
        skillSurveyId: aiSurveyId,
        submittedAt: now,
      })
      .returning({ id: skillSurveyResponse.id });
    createdDisc.responseId = discResp!.id;

    // getAnsweredSurveysForCandidate を呼んで AI アンケートが含まれるか確認
    const summaries = await getAnsweredSurveysForCandidate(discProf!.id);

    const aiEntry = summaries.find((s) => s.jobType === 'ai-driven-development');
    expect(aiEntry).toBeDefined();
    expect(aiEntry!.surveyId).toBe(aiSurveyId);
    expect(aiEntry!.jobType).toBe('ai-driven-development');
  });
});
