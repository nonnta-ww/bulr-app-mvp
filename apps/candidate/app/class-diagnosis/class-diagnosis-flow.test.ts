/**
 * class-diagnosis-flow — RPG クラス診断のクリティカルフロー E2E（データパイプライン統合テスト, task 10）
 *
 * 認証ラッパ / LLM を介さず、決定論的パイプライン全体を実 DB に対して結線して検証する:
 *   getCandidateVocationSource（task 4.1）
 *   → getCandidatePlaystyleResponse（task 5 seed 依存）
 *   → computeClassResult / buildSourceSignature / buildSourceSnapshot（task 7 純関数）
 *   → upsertClassDiagnosis / getLatestClassDiagnosis / getClassDiagnosisHistory / getRepresentativeClass（task 4.2）
 *
 * 検証観点（要件マッピング）:
 *  1. 完全フロー（skill + playstyle）: 最新版が永続化され、result.vocationVector は全7職掌キー（R12/R4.1）、
 *     temperament は有効な象限（非 null）、className は非空（R4.1/R8.1）。
 *  2. 代表クラス（business read-only）: getRepresentativeClass は className/primaryVocation/title のみ開示（R10.1）。
 *  3. 部分状態（playstyle 未回答）: computeClassResult(..., null).temperament === null かつ vocationVector は7キー（R8.2）。
 *  4. 陳腐化 → 新版: 新 skill response 追加で signature が変化 → 別版が追記され、latest が最新版（R6.2/R6.3）。
 *  5. データ層の数値保持: 永続化された result は vocationVector の数値を保持する（UI 非表示は別テストで担保, R12.2）。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する（CI はテストを実行しない）。
 *   @bulr/db の client は import 時に DATABASE_URL を要求するため、DB シンボルは動的 import する。
 *   純関数ヘルパー（type-only な @bulr/db 依存）は static import で問題ない。
 */

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildSourceSignature,
  buildSourceSnapshot,
  computeClassResult,
} from './_lib/build-diagnosis';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[class-diagnosis-flow] DATABASE_URL 未設定のためスキップします。');
}

// 全 @bulr/db シンボルは DB ガード配下で動的 import する（static import は client 評価で throw する）。
type DbModule = typeof import('@bulr/db');

let dbmod: DbModule;
// drizzle クライアント（barrel 経由）・スキーマ（subpath export 経由）を動的取得する。
let db: DbModule['db'];
let schema: typeof import('@bulr/db/schema');

const VALID_TEMPERAMENTS = new Set([
  'explorer_solo',
  'explorer_collab',
  'deepener_solo',
  'deepener_collab',
]);

/** 7職掌キー（VocationVector は全キー常在 — R12.1/R12.2）。 */
const EXPECTED_VOCATIONS = [
  'commander',
  'guardian',
  'ranger',
  'rearguard',
  'sage',
  'strategist',
  'vanguard',
].sort();

// 後始末用に作成したレコード ID
const created: {
  userIds: string[];
  profileIds: string[];
  responseIds: string[];
  diagnosisProfileIds: string[];
} = {
  userIds: [],
  profileIds: [],
  responseIds: [],
  diagnosisProfileIds: [],
};

/**
 * 指定 skill survey の各カテゴリについて 1 問を「level 最大の選択肢」で回答する answer 行を組む。
 * candidate-vocation-source.integration.test.ts の buildAnswersForSurvey をミラーする。
 */
async function buildSkillAnswers(
  surveyId: string,
  responseId: string,
): Promise<{ responseId: string; questionId: string; selectedChoiceIds: string[] }[]> {
  const { eq, inArray } = await import('drizzle-orm');
  const cats = await db
    .select({ id: schema.skillSurveyCategory.id })
    .from(schema.skillSurveyCategory)
    .where(eq(schema.skillSurveyCategory.skillSurveyId, surveyId));
  const catIds = cats.map((c) => c.id);
  if (catIds.length === 0) return [];

  const questions = await db
    .select()
    .from(schema.skillSurveyQuestion)
    .where(inArray(schema.skillSurveyQuestion.categoryId, catIds));

  const answers: { responseId: string; questionId: string; selectedChoiceIds: string[] }[] = [];
  const seenCategory = new Set<string>();
  for (const q of questions) {
    if (seenCategory.has(q.categoryId)) continue;
    const choices = await db
      .select()
      .from(schema.skillSurveyChoice)
      .where(eq(schema.skillSurveyChoice.questionId, q.id));
    if (choices.length === 0) continue;
    const leveled = choices.filter((c) => c.level !== null);
    const pick = leveled.length > 0 ? leveled[leveled.length - 1]! : choices[0]!;
    answers.push({ responseId, questionId: q.id, selectedChoiceIds: [pick.id] });
    seenCategory.add(q.categoryId);
  }
  return answers;
}

/**
 * playstyle survey の全設問について「stored level が最大（=4, 第2極寄り最大）」の選択肢を選ぶ
 * answer 行を組む。両軸とも normalized=100 に振れ、象限は deepener_collab に決定論的に落ちる。
 */
async function buildPlaystyleAnswers(
  surveyId: string,
  responseId: string,
): Promise<{ responseId: string; questionId: string; selectedChoiceIds: string[] }[]> {
  const { eq, inArray } = await import('drizzle-orm');
  const cats = await db
    .select({ id: schema.skillSurveyCategory.id })
    .from(schema.skillSurveyCategory)
    .where(eq(schema.skillSurveyCategory.skillSurveyId, surveyId));
  const catIds = cats.map((c) => c.id);
  const questions = await db
    .select()
    .from(schema.skillSurveyQuestion)
    .where(inArray(schema.skillSurveyQuestion.categoryId, catIds));

  const answers: { responseId: string; questionId: string; selectedChoiceIds: string[] }[] = [];
  for (const q of questions) {
    const choices = await db
      .select()
      .from(schema.skillSurveyChoice)
      .where(eq(schema.skillSurveyChoice.questionId, q.id));
    // stored level が最大の選択肢を選ぶ（seed 契約: 高 level = 第2極寄り）。
    const maxLevelChoice = choices
      .filter((c) => c.level !== null)
      .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];
    if (!maxLevelChoice) continue;
    answers.push({ responseId, questionId: q.id, selectedChoiceIds: [maxLevelChoice.id] });
  }
  return answers;
}

/** user + candidateProfile を作成し、profileId を返す。 */
async function createCandidate(displayName: string): Promise<string> {
  const now = new Date();
  const userId = `it-${randomUUID()}`;
  created.userIds.push(userId);
  await db
    .insert(schema.user)
    .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  const [prof] = await db
    .insert(schema.candidateProfile)
    .values({ userId, displayName })
    .returning({ id: schema.candidateProfile.id });
  const profileId = prof!.id;
  created.profileIds.push(profileId);
  return profileId;
}

describeDb('class-diagnosis クリティカルフロー統合テスト', () => {
  beforeAll(async () => {
    dbmod = await import('@bulr/db');
    db = dbmod.db;
    schema = await import('@bulr/db/schema');

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../../../packages/db/drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    // skill-kind survey 2 本 + playstyle survey を投入（横断集約と気質の土台）。
    const { runBackendSkillSurveySeed } = await import('@bulr/db/seeds/skill-surveys/backend');
    const { runFrontendSkillSurveySeed } = await import('@bulr/db/seeds/skill-surveys/frontend');
    const { runPlaystyleSkillSurveySeed } = await import('@bulr/db/seeds/skill-surveys/playstyle');
    await runBackendSkillSurveySeed(db);
    await runFrontendSkillSurveySeed(db);
    await runPlaystyleSkillSurveySeed(db);
  });

  afterAll(async () => {
    if (!db) return;
    const { inArray } = await import('drizzle-orm');
    if (created.diagnosisProfileIds.length > 0) {
      await db
        .delete(schema.classDiagnosis)
        .where(inArray(schema.classDiagnosis.candidateProfileId, created.diagnosisProfileIds));
    }
    if (created.responseIds.length > 0) {
      await db
        .delete(schema.skillSurveyResponse)
        .where(inArray(schema.skillSurveyResponse.id, created.responseIds));
    }
    if (created.profileIds.length > 0) {
      await db
        .delete(schema.candidateProfile)
        .where(inArray(schema.candidateProfile.id, created.profileIds));
    }
    if (created.userIds.length > 0) {
      await db.delete(schema.user).where(inArray(schema.user.id, created.userIds));
    }
  });

  /** 指定 skill survey に response + answers を挿入し、responseId を返す。 */
  async function seedSkillResponse(profileId: string, jobType: string): Promise<string> {
    const { eq } = await import('drizzle-orm');
    const now = new Date();
    const [surveyRow] = await db
      .select({ id: schema.skillSurvey.id })
      .from(schema.skillSurvey)
      .where(eq(schema.skillSurvey.jobType, jobType))
      .limit(1);
    expect(surveyRow).toBeTruthy();
    const [resp] = await db
      .insert(schema.skillSurveyResponse)
      .values({ candidateProfileId: profileId, skillSurveyId: surveyRow!.id, submittedAt: now })
      .returning({ id: schema.skillSurveyResponse.id });
    created.responseIds.push(resp!.id);
    const answers = await buildSkillAnswers(surveyRow!.id, resp!.id);
    if (answers.length > 0) {
      await db.insert(schema.skillSurveyAnswer).values(answers);
    }
    return resp!.id;
  }

  /** playstyle survey に response + answers を挿入し、responseId を返す。 */
  async function seedPlaystyleResponse(profileId: string): Promise<string> {
    const { eq } = await import('drizzle-orm');
    const now = new Date();
    const [psSurvey] = await db
      .select({ id: schema.skillSurvey.id })
      .from(schema.skillSurvey)
      .where(eq(schema.skillSurvey.kind, 'playstyle'))
      .limit(1);
    expect(psSurvey).toBeTruthy();
    const [resp] = await db
      .insert(schema.skillSurveyResponse)
      .values({ candidateProfileId: profileId, skillSurveyId: psSurvey!.id, submittedAt: now })
      .returning({ id: schema.skillSurveyResponse.id });
    created.responseIds.push(resp!.id);
    const answers = await buildPlaystyleAnswers(psSurvey!.id, resp!.id);
    expect(answers.length).toBeGreaterThan(0);
    await db.insert(schema.skillSurveyAnswer).values(answers);
    return resp!.id;
  }

  it('完全フロー（skill+playstyle）→ 確定診断を永続化し全7職掌 + 有効象限 + className を持つ (R4.1/R8.1/R12)', async () => {
    const profileId = await createCandidate('flow-complete');
    created.diagnosisProfileIds.push(profileId);

    // skill 2 本 + playstyle を回答。
    await seedSkillResponse(profileId, 'backend');
    await seedSkillResponse(profileId, 'frontend');
    await seedPlaystyleResponse(profileId);

    // パイプライン（auth/LLM を介さない）。
    const source = await dbmod.getCandidateVocationSource(profileId);
    const playstyle = await dbmod.getCandidatePlaystyleResponse(profileId);
    expect(playstyle).not.toBeNull();

    const result = computeClassResult(source, playstyle);
    const sig = buildSourceSignature(source, playstyle?.responseId ?? null);
    await dbmod.upsertClassDiagnosis({
      candidateProfileId: profileId,
      sourceSignature: sig,
      sourceSnapshot: buildSourceSnapshot(source, playstyle),
      result,
      llmFlavor: null,
      metadata: null,
      regenerationCount: 1,
      regenerationWindowStart: new Date(),
    });

    // vocationVector は全7職掌キーを持つ（R12/R4.1）。
    const vector = result.vocationVector;
    const vocationKeys = Object.keys(vector).sort();
    expect(vocationKeys).toEqual(EXPECTED_VOCATIONS);

    // temperament は有効象限（非 null, R8.1）。
    expect(result.temperament).not.toBeNull();
    expect(VALID_TEMPERAMENTS.has(result.temperament as string)).toBe(true);
    // 全設問 level 最大 → deepener_collab に決定論的に落ちる。
    expect(result.temperament).toBe('deepener_collab');

    // className は非空。
    expect(typeof result.className).toBe('string');
    expect(result.className.length).toBeGreaterThan(0);

    // 最新版が永続化されている。
    const latest = await dbmod.getLatestClassDiagnosis(profileId);
    expect(latest).not.toBeNull();
    expect(latest!.sourceSignature).toBe(sig);
    expect(latest!.result.className).toBe(result.className);
    // データ層は vocationVector の数値を保持する（UI 非表示は別テストで担保, R12.2）。
    expect(Object.keys(latest!.result.vocationVector).sort()).toEqual(vocationKeys);
    expect(
      Object.values(latest!.result.vocationVector).every((v) => typeof v === 'number'),
    ).toBe(true);
  });

  it('代表クラス（business read-only）は className/primaryVocation/title のみ開示 (R10.1)', async () => {
    // 直前のテストで確定した最新診断を持つ候補者を再利用する。
    const profileId = created.diagnosisProfileIds[0]!;
    const latest = await dbmod.getLatestClassDiagnosis(profileId);
    expect(latest).not.toBeNull();

    const rep = await dbmod.getRepresentativeClass(profileId);
    expect(rep).not.toBeNull();
    // 開示キーは厳密に 3 つのみ（根拠列を漏らさない）。
    expect(Object.keys(rep!).sort()).toEqual(['className', 'primaryVocation', 'title']);
    expect(rep!.className).toBe(latest!.result.className);
    expect(rep!.primaryVocation).toBe(latest!.result.primaryVocation);
    expect(rep!.title).toBe(latest!.result.title);
  });

  it('部分状態（playstyle 未回答）→ temperament=null / vocationVector は7キー (R8.2)', async () => {
    const profileId = await createCandidate('flow-partial');

    // skill のみ回答（playstyle は未回答）。
    await seedSkillResponse(profileId, 'backend');

    const source2 = await dbmod.getCandidateVocationSource(profileId);
    const playstyle2 = await dbmod.getCandidatePlaystyleResponse(profileId);
    expect(playstyle2).toBeNull();

    const result2 = computeClassResult(source2, null);
    // 職掌のみ暫定（temperament は null, R8.2）。
    expect(result2.temperament).toBeNull();
    // それでも vocationVector は全7職掌キーを持つ。
    expect(Object.keys(result2.vocationVector).sort()).toEqual(EXPECTED_VOCATIONS);
  });

  it('陳腐化 → 新版が追記され latest は最新版になる (R6.2/R6.3)', async () => {
    const profileId = created.diagnosisProfileIds[0]!;

    // 現状の signature（テスト1で確定済み）。
    const sourceBefore = await dbmod.getCandidateVocationSource(profileId);
    const playstyle = await dbmod.getCandidatePlaystyleResponse(profileId);
    const sigBefore = buildSourceSignature(sourceBefore, playstyle?.responseId ?? null);

    const historyBefore = await dbmod.getClassDiagnosisHistory(profileId);
    expect(historyBefore.length).toBe(1);

    // 新しい skill response（infrastructure-sre 等の別 survey もしくは同 survey の再回答）を追加。
    // 別 survey を回答することで surveys の responseId 集合が変化し signature が変わる。
    await seedSkillResponse(profileId, 'frontend'); // 既存だが新 response → responseId が変わる
    // 注: getCandidateVocationSource は各 survey の「最新」response を採るため、
    //     frontend を再回答すると採用される responseId が変化し signature が更新される。

    const sourceAfter = await dbmod.getCandidateVocationSource(profileId);
    const sigAfter = buildSourceSignature(sourceAfter, playstyle?.responseId ?? null);
    expect(sigAfter).not.toBe(sigBefore);

    const resultAfter = computeClassResult(sourceAfter, playstyle);
    await dbmod.upsertClassDiagnosis({
      candidateProfileId: profileId,
      sourceSignature: sigAfter,
      sourceSnapshot: buildSourceSnapshot(sourceAfter, playstyle),
      result: resultAfter,
      llmFlavor: null,
      metadata: null,
      regenerationCount: 1,
      regenerationWindowStart: new Date(),
    });

    const historyAfter = await dbmod.getClassDiagnosisHistory(profileId);
    expect(historyAfter.length).toBe(2);
    const latest = await dbmod.getLatestClassDiagnosis(profileId);
    expect(latest!.sourceSignature).toBe(sigAfter);
    // history は generatedAt 降順 → 先頭が最新版。
    expect(historyAfter[0]!.sourceSignature).toBe(sigAfter);
  });
});
