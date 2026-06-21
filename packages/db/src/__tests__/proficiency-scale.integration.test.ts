/**
 * skill-survey-proficiency-scale — 読み出しクエリ + seed の統合テスト（実 DB 接続）
 *
 * 検証内容（task 6.2 / Req 5.1, 8.1, 8.3）:
 *  1. seed 冪等: runBackendSkillSurveySeed を再実行しても重複行が増えず、
 *     level / scoring_kind の新項目が反映・永続化される。
 *  2. クエリ解決: buildResponseBundle（getSurveyResponseByResponseId 経由）が
 *     選択肢 level と設問 scoringKind を解決し、level を持たない選択肢を除外する。
 *  3. 旧データ null 安全: scoringKind=null・level=null の回答でもクエリが破綻なく
 *     完了し、selectedLevels が空・scoringKind が null になる（aggregate へ安全に渡せる形）。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する（CI はテストを実行しない）。
 * スキーマは drizzle migrator で自己適用する。
 */

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

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

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[proficiency-scale.integration] DATABASE_URL 未設定のためスキップします。');
}

// 動的 import で取得する値（DATABASE_URL があるときのみ client を評価する）
let db: DB;
let getSurveyResponseByResponseId: typeof import('../queries/self-analysis/analysis-source-query')['getSurveyResponseByResponseId'];

// 後始末用に作成したレコード ID
const created: { userId?: string; profileId?: string; responseId?: string } = {};

describeDb('skill-survey-proficiency-scale 統合テスト', () => {
  beforeAll(async () => {
    // client（DATABASE_URL を要求）と query を動的 import
    const clientMod = await import('../client');
    db = clientMod.db;
    const queryMod = await import('../queries/self-analysis/analysis-source-query');
    getSurveyResponseByResponseId = queryMod.getSurveyResponseByResponseId;

    // スキーマを migrator で自己適用（適用済みなら no-op）
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    // seed を1回投入（以降のクエリテストの土台）
    await runBackendSkillSurveySeed(db);
  });

  afterAll(async () => {
    if (!db) return;
    if (created.responseId) {
      await db.delete(skillSurveyResponse).where(eq(skillSurveyResponse.id, created.responseId));
    }
    if (created.profileId) {
      await db.delete(candidateProfile).where(eq(candidateProfile.id, created.profileId));
    }
    if (created.userId) {
      await db.delete(user).where(eq(user.id, created.userId));
    }
  });

  it('seed 再実行で重複行が生じず、level / scoring_kind が永続化される (Req 8.3)', async () => {
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    // 2 回目・3 回目の冪等実行
    await runBackendSkillSurveySeed(db);
    await runBackendSkillSurveySeed(db);

    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);

    // 新項目が反映されている
    const scoringKindCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyQuestion)
          .where(isNotNull(skillSurveyQuestion.scoringKind))
      )[0]?.c ?? 0;
    const levelCount =
      (
        await db
          .select({ c: count() })
          .from(skillSurveyChoice)
          .where(isNotNull(skillSurveyChoice.level))
      )[0]?.c ?? 0;

    expect(scoringKindCount).toBeGreaterThan(0);
    expect(levelCount).toBeGreaterThan(0);
  });

  it('buildResponseBundle が level と scoringKind を解決し、level なし選択肢を除外する (Req 5.1, 8.1)', async () => {
    // 検証対象の設問を seed から取得
    const [survey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'backend'))
      .limit(1);
    expect(survey).toBeTruthy();

    // 設問選択は backend survey のカテゴリにスコープする。DB には他 survey
    // （ai-driven-development など）の同型設問（proficiency / multi_choice / free_text）も
    // 存在するため、survey 非スコープの limit(1) は他 survey の設問を拾い得る。その設問へ
    // backend response の回答を挿入すると buildResponseBundle（response の survey の設問のみで
    // bundle を構築）に含まれず get() が undefined になり破綻する。job_type='backend' に固定する。
    const backendCats = await db
      .select({ id: skillSurveyCategory.id })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, survey!.id));
    const backendCatIds = backendCats.map((c) => c.id);

    const choicesFor = (questionId: string) =>
      db.select().from(skillSurveyChoice).where(eq(skillSurveyChoice.questionId, questionId));

    const [profQ] = await db
      .select()
      .from(skillSurveyQuestion)
      .where(
        and(
          eq(skillSurveyQuestion.scoringKind, 'proficiency'),
          inArray(skillSurveyQuestion.categoryId, backendCatIds),
        ),
      )
      .limit(1);
    const [recQ] = await db
      .select()
      .from(skillSurveyQuestion)
      .where(
        and(
          eq(skillSurveyQuestion.scoringKind, 'recency'),
          inArray(skillSurveyQuestion.categoryId, backendCatIds),
        ),
      )
      .limit(1);
    const [invQ] = await db
      .select()
      .from(skillSurveyQuestion)
      .where(
        and(
          eq(skillSurveyQuestion.questionType, 'multi_choice'),
          isNull(skillSurveyQuestion.scoringKind),
          inArray(skillSurveyQuestion.categoryId, backendCatIds),
        ),
      )
      .limit(1);
    const [freeQ] = await db
      .select()
      .from(skillSurveyQuestion)
      .where(
        and(
          eq(skillSurveyQuestion.questionType, 'free_text'),
          inArray(skillSurveyQuestion.categoryId, backendCatIds),
        ),
      )
      .limit(1);

    expect(profQ && recQ && invQ && freeQ).toBeTruthy();

    const profChoices = await choicesFor(profQ!.id);
    const recChoices = await choicesFor(recQ!.id);
    const invChoices = await choicesFor(invQ!.id);

    const profPick = profChoices.find((c) => c.level === 2) ?? profChoices[0]!;
    const recPick = recChoices.find((c) => c.level === 3) ?? recChoices[0]!;
    const invPick = invChoices.slice(0, 2); // level=null の想定

    // 旧データ前提の確認: インベントリ選択肢は level を持たない
    expect(invPick.every((c) => c.level === null)).toBe(true);

    // テストデータ投入
    const now = new Date();
    const userId = `it-${randomUUID()}`;
    created.userId = userId;
    await db
      .insert(user)
      .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
    const [prof] = await db
      .insert(candidateProfile)
      .values({ userId, displayName: 'integration-test' })
      .returning({ id: candidateProfile.id });
    created.profileId = prof!.id;
    const [resp] = await db
      .insert(skillSurveyResponse)
      .values({ candidateProfileId: prof!.id, skillSurveyId: survey!.id, submittedAt: now })
      .returning({ id: skillSurveyResponse.id });
    created.responseId = resp!.id;

    await db.insert(skillSurveyAnswer).values([
      { responseId: resp!.id, questionId: profQ!.id, selectedChoiceIds: [profPick.id] },
      { responseId: resp!.id, questionId: recQ!.id, selectedChoiceIds: [recPick.id] },
      { responseId: resp!.id, questionId: invQ!.id, selectedChoiceIds: invPick.map((c) => c.id) },
      { responseId: resp!.id, questionId: freeQ!.id, selectedChoiceIds: [], freeText: '理由を記述' },
    ]);

    // クエリ実行（破綻なく完了すること自体が Req 8.1 の一部）
    const bundle = await getSurveyResponseByResponseId(prof!.id, resp!.id);
    expect(bundle).not.toBeNull();

    const flat = bundle!.categories.flatMap((c) => c.answers);
    const get = (qid: string) => flat.find((a) => a.questionId === qid)!;

    const aProf = get(profQ!.id);
    expect(aProf.scoringKind).toBe('proficiency');
    expect(aProf.selectedLevels).toEqual([profPick.level]);

    const aRec = get(recQ!.id);
    expect(aRec.scoringKind).toBe('recency');
    expect(aRec.selectedLevels).toEqual([recPick.level]);

    // 旧データ相当（scoringKind=null・level=null）: ラベルは解決されるが level は除外
    const aInv = get(invQ!.id);
    expect(aInv.scoringKind).toBeNull();
    expect(aInv.selectedLabels.length).toBe(invPick.length);
    expect(aInv.selectedLevels).toEqual([]);

    const aFree = get(freeQ!.id);
    expect(aFree.scoringKind).toBeNull();
    expect(aFree.selectedLevels).toEqual([]);
  });
});
