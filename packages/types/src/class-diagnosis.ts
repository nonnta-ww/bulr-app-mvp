/**
 * RPG クラス診断 — 永続化 JSON 契約型
 *
 * `class_diagnosis` テーブルの jsonb 列（result / llm_flavor / source_snapshot / metadata）が
 * `.$type<...>()` で参照する純粋 TypeScript 型。依存方向 `types → db → ai → apps` を守るため、
 * DB と AI と apps が共有するこれらの契約型は最下層 `@bulr/types` に置く。
 *
 * NOTE: packages/types は型のみ（Zod/ランタイム禁止）。ここで定義する型は
 * packages/ai の zod スキーマ（classFlavorSchema）や app-local 純関数（assemble.ts）が
 * 満たすべき契約であり、それらの実装はこの型に一致するよう型付けされる。
 */

import type { TemperamentSummary } from './temperament';

/** 職掌（どこで戦うか）— 7種 */
export type Vocation =
  | 'vanguard' // 前衛 フロントエンド
  | 'rearguard' // 後衛 バックエンド
  | 'guardian' // 守護 インフラ SRE QA セキュリティ
  | 'sage' // 賢者 AI ML 検索 推薦 データ
  | 'commander' // 指揮 エンジニアリングマネージャー
  | 'strategist' // 策士 プロダクトマネージャー
  | 'ranger'; // 遊撃 フルスタック AI駆動開発

/** 7職掌の 0..100 正規化ベクトル（全キー常在 — R12.1/12.2） */
export type VocationVector = Record<Vocation, number>;

/** 称号（キャラの格＝広さ×深さ）— 4種 */
export type Title = 'sage_hero' | 'specialist' | 'jack_of_all' | 'apprentice';

/**
 * 確定判定結果（class_diagnosis.result 列）
 * 職掌×気質×称号の決定論的組み立て（assemble.ts の出力形状）。
 */
export interface ClassResult {
  primaryVocation: Vocation;
  subVocations: Vocation[];
  vocationVector: VocationVector; // R12: 全7職掌保持
  temperament: TemperamentSummary | null; // playstyle 未回答なら null（R8.2）。balancedAxes は summary 内へ統合
  title: Title;
  representativeVocation: Vocation; // 称号併記用（最大比重）
  className: string; // 表示名（定義から組成）
  confidence: 'low' | 'normal'; // R8.3
}

/**
 * LLM フレーバー文（class_diagnosis.llm_flavor 列, nullable=LLM失敗 R7.3）
 * packages/ai の classFlavorSchema（zod）はこの型を満たすよう型付けされる。
 */
export interface ClassFlavor {
  tagline: string;
  description: string;
  nextStepHint: string;
}

/**
 * 診断入力スナップショット（class_diagnosis.source_snapshot 列）
 * 陳腐化判定用に寄与 response の id と submittedAt を記録（FK は張らない）。
 */
export interface ClassDiagnosisSourceSnapshot {
  skillResponses: Array<{
    surveyId: string;
    responseId: string;
    submittedAt: string;
    overallCoverageRatio: number;
  }>;
  playstyleResponseId: string | null;
  playstyleSubmittedAt: string | null;
}

/**
 * メタデータ（class_diagnosis.metadata 列）
 * LLM コスト推定（self-analysis と同形式）。JSON-value プロパティは snake_case を許容（structure.md carve-out）。
 */
export interface ClassDiagnosisMetadata {
  llm_cost_estimate?: {
    input_tokens: number;
    output_tokens: number;
    estimated_usd: number;
  };
}

/**
 * 代表クラス最小契約（business read-only 表示 — R10.2/10.3）
 * 最新確定診断から className/primaryVocation/title のみを開示（根拠回答は返さない）。
 */
export interface RepresentativeClass {
  className: string;
  primaryVocation: Vocation;
  title: Title;
}
