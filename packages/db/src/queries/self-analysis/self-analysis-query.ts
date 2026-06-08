/**
 * self_analysis 読み書きクエリ
 *
 * self_analysis テーブルへの read/write・source_response_id（版キー）
 * 一意キーによる upsert・版スコープ再生成抑制カウンタ判定を担う。
 * 全 read 操作は candidateProfileId フィルタで本人所有データのみを返す（Req 6.1, 6.3）。
 */

import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '../../client';
import type {
  AggregatedSnapshot,
  SelfAnalysisMetadata,
  SelfAnalysisNarrative,
} from '../../schema/self-analysis';
import { selfAnalysis } from '../../schema/self-analysis';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * 1日（24時間）あたりの再生成上限。
 *
 * design Issue 3「実装時確定」に従い 10 に設定する。
 * 根拠: 1回の LLM 呼び出しコストは ~$0.001–$0.003 程度（claude-sonnet-4-6 / 数百〜千トークン）、
 * 1日 10 回なら最大 ~$0.03/候補者/日 で暴走抑制として十分な水準（Req 9.3）。
 */
const SELF_ANALYSIS_DAILY_REGEN_LIMIT = 10;

/**
 * 再生成窓のサイズ（ミリ秒）。UTC ベースの 24 時間スライディングウィンドウ。
 *
 * 暦日（00:00 リセット）ではなく「最初の再生成から 24 時間」を窓とする。
 * 理由: 暦日リセットは TZ によって挙動が変わるため、UTC 24h スライドで一貫させる。
 */
const REGEN_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

/** getSelfAnalysis / getSelfAnalysisByResponseId の戻り値 */
export interface SelfAnalysisRecord {
  id: string;
  candidateProfileId: string;
  skillSurveyId: string;
  sourceResponseId: string;
  /** 陳腐化判定用スナップショット（Req 5.1） */
  sourceSubmittedAt: Date;
  aggregatedSnapshot: AggregatedSnapshot;
  /** null = 自然言語部分が未生成/失敗（Req 4.x） */
  llmOutput: SelfAnalysisNarrative | null;
  /** llm_cost_estimate（Req 9.1）。null = LLM 未実行 */
  metadata: SelfAnalysisMetadata | null;
  regenerationCount: number;
  regenerationWindowStart: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 履歴の1版（source_submitted_at 昇順に versionIndex を付与）。
 * getSelfAnalysisHistory の要素型。
 */
export interface SelfAnalysisVersion {
  /** = source_response_id（版キー） */
  responseId: string;
  /** 1-based, source_submitted_at 昇順 */
  versionIndex: number;
  /** = source_submitted_at */
  submittedAt: Date;
  aggregatedSnapshot: AggregatedSnapshot;
  /** null = 可視化のみ（LLM 未生成/失敗）（Req 4.3, Req 5.3） */
  llmOutput: SelfAnalysisNarrative | null;
}

/**
 * 再生成抑制の判定結果（Req 9.3）。
 * allowed: true の場合のみ upsertSelfAnalysis に渡す nextCount / windowStart を提供する。
 */
export type RateLimitVerdict =
  | { allowed: true; nextCount: number; windowStart: Date }
  | { allowed: false };

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/** DB 行を SelfAnalysisRecord に変換 */
function toRecord(row: typeof selfAnalysis.$inferSelect): SelfAnalysisRecord {
  return {
    id: row.id,
    candidateProfileId: row.candidateProfileId,
    skillSurveyId: row.skillSurveyId,
    sourceResponseId: row.sourceResponseId,
    sourceSubmittedAt: row.sourceSubmittedAt,
    aggregatedSnapshot: row.aggregatedSnapshot,
    llmOutput: row.llmOutput ?? null,
    metadata: row.metadata ?? null,
    regenerationCount: row.regenerationCount,
    regenerationWindowStart: row.regenerationWindowStart,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// getSelfAnalysis
// ---------------------------------------------------------------------------

/**
 * 候補者の指定 survey に対する最新版（source_submitted_at 降順の先頭）の自己分析を返す。
 * candidateProfileId で本人フィルタを適用し、他候補者のデータは返さない（Req 6.1, 6.3）。
 * 未生成の場合は null を返す（Req 5.3）。
 *
 * 複数版が存在する場合は source_submitted_at が最も新しい版を返す（Req 3.3）。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID
 * @param skillSurveyId      - 対象 skill_survey の ID
 */
export async function getSelfAnalysis(
  candidateProfileId: string,
  skillSurveyId: string,
): Promise<SelfAnalysisRecord | null> {
  const rows = await db
    .select()
    .from(selfAnalysis)
    .where(
      and(
        eq(selfAnalysis.candidateProfileId, candidateProfileId),
        eq(selfAnalysis.skillSurveyId, skillSurveyId),
      ),
    )
    .orderBy(desc(selfAnalysis.sourceSubmittedAt))
    .limit(1);

  const row = rows[0];
  return row ? toRecord(row) : null;
}

// ---------------------------------------------------------------------------
// getSelfAnalysisHistory
// ---------------------------------------------------------------------------

/**
 * 候補者の指定 survey に対する全版を source_submitted_at 昇順で返す（Req 4.1, Req 3.2）。
 * versionIndex は昇順の連番（1-based）で付与する。
 * candidateProfileId で本人フィルタを適用し、他候補者のデータは返さない（Req 6.1, 6.3）。
 * 版が存在しない場合は空配列を返す。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID
 * @param skillSurveyId      - 対象 skill_survey の ID
 */
export async function getSelfAnalysisHistory(
  candidateProfileId: string,
  skillSurveyId: string,
): Promise<SelfAnalysisVersion[]> {
  const rows = await db
    .select()
    .from(selfAnalysis)
    .where(
      and(
        eq(selfAnalysis.candidateProfileId, candidateProfileId),
        eq(selfAnalysis.skillSurveyId, skillSurveyId),
      ),
    )
    .orderBy(asc(selfAnalysis.sourceSubmittedAt));

  return rows.map((row, index) => ({
    responseId: row.sourceResponseId,
    versionIndex: index + 1,
    submittedAt: row.sourceSubmittedAt,
    aggregatedSnapshot: row.aggregatedSnapshot,
    llmOutput: row.llmOutput ?? null,
  }));
}

// ---------------------------------------------------------------------------
// getSelfAnalysisByResponseId
// ---------------------------------------------------------------------------

/**
 * 指定版（responseId = source_response_id）の自己分析を返す（Req 5.1, 5.2）。
 * candidateProfileId で本人フィルタを適用し、他候補者のデータは返さない（Req 6.1, 6.3）。
 * 該当版が存在しない場合は null を返す。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID
 * @param responseId         - 取得対象の版キー（= source_response_id）
 */
export async function getSelfAnalysisByResponseId(
  candidateProfileId: string,
  responseId: string,
): Promise<SelfAnalysisRecord | null> {
  const rows = await db
    .select()
    .from(selfAnalysis)
    .where(
      and(
        eq(selfAnalysis.candidateProfileId, candidateProfileId),
        eq(selfAnalysis.sourceResponseId, responseId),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? toRecord(row) : null;
}

// ---------------------------------------------------------------------------
// checkRegenerationAllowed
// ---------------------------------------------------------------------------

/**
 * 指定版（sourceResponseId）に対する再生成を許可するかを判定する（Req 9.3, Req 3.5）。
 *
 * 判定は版キー（source_response_id）単位で独立して行われ、30日クールダウン（再回答抑止）
 * とは別軸で管理される。1版あたり UTC 24h スライディングウィンドウで上限を適用する。
 *
 * 判定ロジック:
 * 1. 行が無い → 初回生成。allowed: true, nextCount: 1, windowStart: 今
 * 2. 行がある + regeneration_window_start から 24h 超過 → 窓リセット。allowed: true, nextCount: 1, windowStart: 今
 * 3. 行がある + 窓内 + regeneration_count < LIMIT → allowed: true, nextCount: count+1, windowStart: 既存
 * 4. 行がある + 窓内 + regeneration_count >= LIMIT → allowed: false
 *
 * candidateProfileId フィルタで本人データのみを参照（Req 6.1）。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID
 * @param sourceResponseId   - 対象版の版キー（= source_response_id）
 */
export async function checkRegenerationAllowed(
  candidateProfileId: string,
  sourceResponseId: string,
): Promise<RateLimitVerdict> {
  const rows = await db
    .select({
      regenerationCount: selfAnalysis.regenerationCount,
      regenerationWindowStart: selfAnalysis.regenerationWindowStart,
    })
    .from(selfAnalysis)
    .where(
      and(
        eq(selfAnalysis.candidateProfileId, candidateProfileId),
        eq(selfAnalysis.sourceResponseId, sourceResponseId),
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
  if (regenerationCount < SELF_ANALYSIS_DAILY_REGEN_LIMIT) {
    return { allowed: true, nextCount: regenerationCount + 1, windowStart: regenerationWindowStart };
  }

  // ケース 4: 窓内かつ上限到達
  return { allowed: false };
}

// ---------------------------------------------------------------------------
// upsertSelfAnalysis
// ---------------------------------------------------------------------------

/**
 * version 版キー（source_response_id）で self_analysis を upsert する（Req 3.1, Req 6.1）。
 * 同一回答版（同一 source_response_id）は既存行を上書きし、新回答版は新規行を追加する。
 * これにより1版1行の不変条件を保証しつつ、複数版を追記型で保持する。
 *
 * 更新対象列:
 *   aggregated_snapshot / llm_output / metadata /
 *   source_submitted_at /
 *   regeneration_count / regeneration_window_start / updated_at
 *
 * @param input - upsert に必要なフィールド群
 */
export async function upsertSelfAnalysis(input: {
  candidateProfileId: string;
  skillSurveyId: string;
  sourceResponseId: string;
  /** 陳腐化判定用スナップショット（Req 5.1） */
  sourceSubmittedAt: Date;
  aggregatedSnapshot: AggregatedSnapshot;
  /** null = LLM 失敗/未実行（Req 4.1） */
  llmOutput: SelfAnalysisNarrative | null;
  /** null = LLM 未実行（Req 9.1） */
  metadata: SelfAnalysisMetadata | null;
  /** checkRegenerationAllowed().nextCount を渡す */
  regenerationCount: number;
  /** checkRegenerationAllowed().windowStart を渡す */
  regenerationWindowStart: Date;
}): Promise<SelfAnalysisRecord> {
  const now = new Date();

  const rows = await db
    .insert(selfAnalysis)
    .values({
      candidateProfileId: input.candidateProfileId,
      skillSurveyId: input.skillSurveyId,
      sourceResponseId: input.sourceResponseId,
      sourceSubmittedAt: input.sourceSubmittedAt,
      aggregatedSnapshot: input.aggregatedSnapshot,
      llmOutput: input.llmOutput ?? undefined,
      metadata: input.metadata ?? undefined,
      regenerationCount: input.regenerationCount,
      regenerationWindowStart: input.regenerationWindowStart,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [selfAnalysis.sourceResponseId],
      set: {
        sourceSubmittedAt: input.sourceSubmittedAt,
        aggregatedSnapshot: input.aggregatedSnapshot,
        llmOutput: input.llmOutput ?? null,
        metadata: input.metadata ?? null,
        regenerationCount: input.regenerationCount,
        regenerationWindowStart: input.regenerationWindowStart,
        updatedAt: now,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error('upsertSelfAnalysis: INSERT/UPDATE returned no rows');
  }
  return toRecord(row);
}

// ---------------------------------------------------------------------------
// updateNarrative
// ---------------------------------------------------------------------------

/**
 * 自然言語部分（llm_output / metadata）のみを更新する（Req 4.3）。
 * aggregated_snapshot / source_submitted_at は変更しない（Req 4.3 の invariant）。
 *
 * @param id        - self_analysis.id
 * @param llmOutput - 再生成された SelfAnalysisNarrative
 * @param metadata  - LLM コスト推定（Req 9.1）
 */
export async function updateNarrative(
  id: string,
  llmOutput: SelfAnalysisNarrative,
  metadata: SelfAnalysisMetadata,
): Promise<void> {
  await db
    .update(selfAnalysis)
    .set({
      llmOutput,
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(selfAnalysis.id, id));
}

// ---------------------------------------------------------------------------
// incrementRegenerationCount
// ---------------------------------------------------------------------------

/**
 * 再生成カウンタと窓開始時刻を進める（Req 9.3）。
 * regenerateNarrative の成功パスで updateNarrative の直後に呼ぶ。
 * llm_output / metadata / aggregated_snapshot / source_* には触れない。
 *
 * @param id          - self_analysis.id
 * @param nextCount   - checkRegenerationAllowed().nextCount
 * @param windowStart - checkRegenerationAllowed().windowStart
 */
export async function incrementRegenerationCount(
  id: string,
  nextCount: number,
  windowStart: Date,
): Promise<void> {
  await db
    .update(selfAnalysis)
    .set({ regenerationCount: nextCount, regenerationWindowStart: windowStart, updatedAt: new Date() })
    .where(eq(selfAnalysis.id, id));
}
