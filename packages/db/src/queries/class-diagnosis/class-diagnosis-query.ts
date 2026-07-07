/**
 * class_diagnosis 読み書きクエリ（RPG クラス診断）
 *
 * class_diagnosis テーブルへの read/write・(candidate_profile_id, source_signature)
 * 版一意キーによる upsert・版スコープ再生成抑制カウンタ判定・代表クラス最小開示を担う。
 * 全 read 操作は candidateProfileId フィルタで本人所有データのみを返す（Req 11.3）。
 *
 * 版モデル（Req 6.1, 6.2）:
 *   1候補者に複数版（append-only）。版キーは source_signature。異なる signature は
 *   別版（新規行）、同一 signature の再 upsert は既存行を in-place 更新（同一入力の再生成）。
 *
 * 代表クラス（Req 10.2, 10.3, 11.3）:
 *   最新確定診断から className/primaryVocation/title のみを開示し、根拠回答
 *   （source_snapshot / vocationVector / result 全体）は返さない。
 *
 * 依存方向 types → db を守るため、jsonb 列の型契約は @bulr/types から import する。
 */

import { and, desc, eq } from 'drizzle-orm';

import type {
  ClassResult,
  ClassFlavor,
  ClassDiagnosisSourceSnapshot,
  ClassDiagnosisMetadata,
  RepresentativeClass,
} from '@bulr/types/class-diagnosis';

import { db } from '../../client';
import { classDiagnosis } from '../../schema/class-diagnosis';
// self-analysis と判定契約を揃えるため RateLimitVerdict を再利用する（型ドリフト防止）。
import type { RateLimitVerdict } from '../self-analysis/self-analysis-query';

export type { RateLimitVerdict };

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * 1日（24時間）あたりの再生成上限。
 *
 * self-analysis の SELF_ANALYSIS_DAILY_REGEN_LIMIT（10）と揃える。design Issue 3
 * 「実装時確定」の根拠（1回の LLM 呼び出しコスト ~$0.001–$0.003）はクラス診断でも同水準。
 */
const CLASS_DIAGNOSIS_DAILY_REGEN_LIMIT = 10;

/**
 * 再生成窓のサイズ（ミリ秒）。UTC ベースの 24 時間スライディングウィンドウ。
 * 暦日リセットではなく「最初の再生成から 24 時間」を窓とする（self-analysis と一致）。
 */
const REGEN_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

/** class_diagnosis の 1 版（1 行）を表す read 戻り値 */
export interface ClassDiagnosisRecord {
  id: string;
  candidateProfileId: string;
  /** 版キー（診断入力の署名） */
  sourceSignature: string;
  sourceSnapshot: ClassDiagnosisSourceSnapshot;
  result: ClassResult;
  /** null = LLM フレーバー未生成/失敗（Req 7.3） */
  llmFlavor: ClassFlavor | null;
  /** null = LLM 未実行（コスト推定なし） */
  metadata: ClassDiagnosisMetadata | null;
  regenerationCount: number;
  regenerationWindowStart: Date;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** upsertClassDiagnosis の入力 */
export interface UpsertClassDiagnosisInput {
  candidateProfileId: string;
  sourceSignature: string;
  sourceSnapshot: ClassDiagnosisSourceSnapshot;
  result: ClassResult;
  /** null = LLM フレーバー未生成/失敗（Req 7.3） */
  llmFlavor: ClassFlavor | null;
  /** null = LLM 未実行 */
  metadata: ClassDiagnosisMetadata | null;
  /** checkClassRegenerationAllowed().nextCount を渡す */
  regenerationCount: number;
  /** checkClassRegenerationAllowed().windowStart を渡す */
  regenerationWindowStart: Date;
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/** DB 行を ClassDiagnosisRecord に変換 */
function toRecord(row: typeof classDiagnosis.$inferSelect): ClassDiagnosisRecord {
  return {
    id: row.id,
    candidateProfileId: row.candidateProfileId,
    sourceSignature: row.sourceSignature,
    sourceSnapshot: row.sourceSnapshot,
    result: row.result,
    llmFlavor: row.llmFlavor ?? null,
    metadata: row.metadata ?? null,
    regenerationCount: row.regenerationCount,
    regenerationWindowStart: row.regenerationWindowStart,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// upsertClassDiagnosis
// ---------------------------------------------------------------------------

/**
 * (candidateProfileId, sourceSignature) 版キーで class_diagnosis を upsert する（Req 6.1, 6.4）。
 * 同一署名（同一入力の再生成）は既存行を in-place 更新し、異なる署名は新規版（新規行）を追加する。
 * これにより 1 版 1 行の不変条件を保ちつつ、複数版を append-only で保持する（Req 6.2）。
 *
 * 更新対象列: source_snapshot / result / llm_flavor / metadata /
 *   regeneration_count / regeneration_window_start / generated_at / updated_at。
 * llmFlavor / metadata が null の場合は null を保存する（Req 7.3）。
 *
 * @param input - upsert に必要なフィールド群
 */
export async function upsertClassDiagnosis(
  input: UpsertClassDiagnosisInput,
): Promise<ClassDiagnosisRecord> {
  const now = new Date();

  const rows = await db
    .insert(classDiagnosis)
    .values({
      candidateProfileId: input.candidateProfileId,
      sourceSignature: input.sourceSignature,
      sourceSnapshot: input.sourceSnapshot,
      result: input.result,
      llmFlavor: input.llmFlavor ?? undefined,
      metadata: input.metadata ?? undefined,
      regenerationCount: input.regenerationCount,
      regenerationWindowStart: input.regenerationWindowStart,
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [classDiagnosis.candidateProfileId, classDiagnosis.sourceSignature],
      set: {
        sourceSnapshot: input.sourceSnapshot,
        result: input.result,
        llmFlavor: input.llmFlavor ?? null,
        metadata: input.metadata ?? null,
        regenerationCount: input.regenerationCount,
        regenerationWindowStart: input.regenerationWindowStart,
        generatedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error('upsertClassDiagnosis: INSERT/UPDATE returned no rows');
  }
  return toRecord(row);
}

// ---------------------------------------------------------------------------
// getLatestClassDiagnosis
// ---------------------------------------------------------------------------

/**
 * 候補者の最新確定診断（generated_at 降順の先頭）を返す（Req 6.2）。
 * candidateProfileId で本人フィルタを適用し、他候補者のデータは返さない（Req 11.3）。
 * 診断が無い場合は null を返す。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID
 */
export async function getLatestClassDiagnosis(
  candidateProfileId: string,
): Promise<ClassDiagnosisRecord | null> {
  const rows = await db
    .select()
    .from(classDiagnosis)
    .where(eq(classDiagnosis.candidateProfileId, candidateProfileId))
    .orderBy(desc(classDiagnosis.generatedAt))
    .limit(1);

  const row = rows[0];
  return row ? toRecord(row) : null;
}

// ---------------------------------------------------------------------------
// getClassDiagnosisHistory
// ---------------------------------------------------------------------------

/**
 * 候補者の全版を generated_at 降順で返す（Req 6.1）。
 * candidateProfileId で本人フィルタを適用し、他候補者のデータは返さない（Req 11.3）。
 * 版が存在しない場合は空配列を返す。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID
 */
export async function getClassDiagnosisHistory(
  candidateProfileId: string,
): Promise<ClassDiagnosisRecord[]> {
  const rows = await db
    .select()
    .from(classDiagnosis)
    .where(eq(classDiagnosis.candidateProfileId, candidateProfileId))
    .orderBy(desc(classDiagnosis.generatedAt));

  return rows.map(toRecord);
}

// ---------------------------------------------------------------------------
// checkClassRegenerationAllowed
// ---------------------------------------------------------------------------

/**
 * 指定署名（sourceSignature）に対する再生成を許可するかを判定する（Req 6.4）。
 *
 * 判定は版キー（source_signature）単位で独立して行い、UTC 24h スライディングウィンドウで
 * 上限を適用する（self-analysis の checkRegenerationAllowed と同一ロジック）。
 *
 * 判定ロジック:
 * 1. 行が無い → 初回生成。allowed: true, nextCount: 1, windowStart: 今
 * 2. 行がある + regeneration_window_start から 24h 超過 → 窓リセット。allowed: true, nextCount: 1, windowStart: 今
 * 3. 行がある + 窓内 + regeneration_count < LIMIT → allowed: true, nextCount: count+1, windowStart: 既存
 * 4. 行がある + 窓内 + regeneration_count >= LIMIT → allowed: false
 *
 * candidateProfileId フィルタで本人データのみを参照（Req 11.3）。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID
 * @param sourceSignature    - 対象版の版キー（= source_signature）
 */
export async function checkClassRegenerationAllowed(
  candidateProfileId: string,
  sourceSignature: string,
): Promise<RateLimitVerdict> {
  const rows = await db
    .select({
      regenerationCount: classDiagnosis.regenerationCount,
      regenerationWindowStart: classDiagnosis.regenerationWindowStart,
    })
    .from(classDiagnosis)
    .where(
      and(
        eq(classDiagnosis.candidateProfileId, candidateProfileId),
        eq(classDiagnosis.sourceSignature, sourceSignature),
      ),
    )
    .limit(1);

  const now = new Date();

  // ケース 1: 行が無い → 初回生成
  if (!rows[0]) {
    return { allowed: true, nextCount: 1, windowStart: now };
  }

  const { regenerationCount, regenerationWindowStart } = rows[0];
  const windowElapsedMs = now.getTime() - regenerationWindowStart.getTime();

  // ケース 2: 窓が 24h を超過 → リセット
  if (windowElapsedMs >= REGEN_WINDOW_MS) {
    return { allowed: true, nextCount: 1, windowStart: now };
  }

  // ケース 3: 窓内かつ上限未達
  if (regenerationCount < CLASS_DIAGNOSIS_DAILY_REGEN_LIMIT) {
    return { allowed: true, nextCount: regenerationCount + 1, windowStart: regenerationWindowStart };
  }

  // ケース 4: 窓内かつ上限到達
  return { allowed: false };
}

// ---------------------------------------------------------------------------
// getRepresentativeClass
// ---------------------------------------------------------------------------

/**
 * 候補者単位の最新確定診断から代表クラス最小契約を返す（Req 10.2, 10.3, 11.3）。
 *
 * 開示するのは className / primaryVocation / title のみ。source_snapshot・
 * vocationVector・その他の根拠回答は返さない（business read-only 表示のプライバシー要件）。
 * 診断が無い場合は null を返す。candidateProfileId で本人フィルタを適用する（Req 11.3）。
 *
 * @param candidateProfileId - 対象候補者の profile ID
 */
export async function getRepresentativeClass(
  candidateProfileId: string,
): Promise<RepresentativeClass | null> {
  const rows = await db
    .select({ result: classDiagnosis.result })
    .from(classDiagnosis)
    .where(eq(classDiagnosis.candidateProfileId, candidateProfileId))
    .orderBy(desc(classDiagnosis.generatedAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  // result から最小 3 フィールドのみを抽出（根拠列を漏らさない）。
  const { className, primaryVocation, title } = row.result;
  return { className, primaryVocation, title };
}
