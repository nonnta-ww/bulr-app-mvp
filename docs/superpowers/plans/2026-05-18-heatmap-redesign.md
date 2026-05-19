# 評価ヒートマップ再設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 面接レポート画面の評価ヒートマップを、3秒で全体像が掴めるスティッキー判定サマリー＋2タブ（観察 / カバレッジ）+ パターン詳細ドリルダウンに刷新する。

**Architecture:**
- データ層: `HeatmapData` 型を拡張し、`pattern_coverage` テーブルから決定論的に集計（LLM はサマリーテキストのみ生成）。既存 `session_report.heatmap_data` JSONB はバックフィルスクリプトで再計算。
- UI 層: `report/page.tsx` を改修し、新規 Client Component `<ReportView>` がタブ・ドリルダウン状態を持つ。サブコンポーネントは props を受け取るだけの薄い RSC として分離。
- スコープ: `apps/web/app/(interviewer)/interviews/[sessionId]/report` のみ。admin パネルは触らない。

**Tech Stack:** Next.js 16 / React 19 / Tailwind 4 / Drizzle ORM / Zod / pnpm workspaces (turbo)

**設計の根拠:** `docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md`

**重要な前提:**
- 本リポジトリにはユニットテストフレームワークが入っていない。検証は **`pnpm typecheck`** と **ローカルブラウザでの手動確認**で行う。各タスクは小さい単位でコミットする。
- LLM が `heatmap_data` を生成していた処理を **コード側の決定論計算に変える**（設計ドキュメント Section 8 の補足: 単純な算術集計を LLM に任せる必然性がないため）。LLM 出力は `summary_text` のみ。
- 既存 `_components/heatmap.tsx` は最終タスクで削除する。
- 既存 `report/page.tsx` の「補足情報」セクション（フリー質問数のみ表示）は削除（スティッキーに統合済み）。

---

## File Structure (全体マップ)

### 新規作成

```
packages/ai/src/lib/aggregate-heatmap.ts                 # コードで HeatmapData を集計
scripts/migrate-heatmap-v2.ts                              # 既存 session_report のバックフィル
apps/web/lib/heatmap-benchmarks.ts                         # ベンチマーク定数 + 色判定
apps/web/lib/stuck-type-label.ts                           # stuck_type enum → 日本語
apps/web/lib/queries/get-report-data.ts                    # ページが必要とするデータをまとめて取得
apps/web/app/(interviewer)/interviews/_components/report/verdict-summary.tsx
apps/web/app/(interviewer)/interviews/_components/report/observation-tab.tsx
apps/web/app/(interviewer)/interviews/_components/report/pattern-row.tsx
apps/web/app/(interviewer)/interviews/_components/report/coverage-tab.tsx
apps/web/app/(interviewer)/interviews/_components/report/coverage-cell.tsx
apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx
apps/web/app/(interviewer)/interviews/_components/report/report-view.tsx       # 'use client'
apps/web/app/(interviewer)/interviews/_components/report/report-print.css
```

### 修正

```
packages/types/src/evaluation.ts                           # HeatmapData 拡張
packages/ai/src/lib/validate-llm-output.ts                 # SAFE_SESSION_REPORT_FALLBACK 更新
packages/ai/src/functions/generate-session-report.ts       # LLM は summary_text のみ
packages/ai/src/index.ts                                   # aggregateHeatmap re-export
apps/web/app/api/interview/finalize/route.ts               # aggregateHeatmap 呼び出し
apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx  # ReportView 利用
```

### 削除（最終タスク）

```
apps/web/app/(interviewer)/interviews/_components/heatmap.tsx
```

---

## Task 1: HeatmapData 型を拡張 + SAFE_FALLBACK 更新

> このタスクは型定義の拡張と、唯一その型を直接構築している `SAFE_SESSION_REPORT_FALLBACK` の更新を **同時** に行う。途中状態をコミットすると typecheck が失敗するため、2 ファイル合わせて 1 コミットにする。

**Files:**
- Modify: `packages/types/src/evaluation.ts`
- Modify: `packages/ai/src/lib/validate-llm-output.ts`

- [ ] **Step 1: HeatmapData 型を拡張する**

`packages/types/src/evaluation.ts` の `HeatmapData` を以下に置き換える（既存フィールドは残し、`overall` と `patterns` を追加）:

```typescript
// Requirement 1.10
export interface HeatmapData {
  by_category: Record<
    PatternCategory,
    {
      avg_authenticity: number;
      avg_judgment: number;
      avg_scope: number;
      avg_meta_cognition: number;
      avg_ai_literacy: number;
      pattern_count: number;
    }
  >;
  scope_distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  ai_literacy_distribution: Record<0 | 1 | 2 | 3, number>;
  free_question_count: number;

  // --- v2 追加 (2026-05-18 redesign) ---
  overall: {
    avg_authenticity: number;
    avg_judgment: number;
    avg_scope: number;
    avg_meta_cognition: number;
    avg_ai_literacy: number;
    // 4つは互いに排他で合算するとセッション内の全カバレッジ件数になる
    reached_count: number;         // stuck_type IS NULL かつ level_reached >= 2
    stuck_count: number;           // stuck_type IN ('shallow','single_option','rigid')
    not_experienced_count: number; // stuck_type = 'not_experienced'
    undeveloped_count: number;     // stuck_type IS NULL かつ level_reached <= 1
  };
  patterns: Array<{
    pattern_id: string;
    pattern_code: string;            // 例: 'D-03'
    pattern_title: string;
    category: PatternCategory;
    level_reached: 0 | 1 | 2 | 3 | 4;
    stuck_type: StuckType | null;
    scores: {
      authenticity: number;
      judgment: number;
      scope: number;
      meta_cognition: number;
      ai_literacy: number;
    };
    notes: string;
    turn_count: number;
  }>;
}
```

- [ ] **Step 2: SAFE_SESSION_REPORT_FALLBACK を新スキーマに合わせる**

`packages/ai/src/lib/validate-llm-output.ts` の `_safeHeatmapData` を以下に差し替える（他の定数・関数は変更しない）:

```typescript
const _safeHeatmapData: HeatmapData = {
  by_category: {
    design: { ..._zeroCategory },
    trouble: { ..._zeroCategory },
    performance: { ..._zeroCategory },
    security: { ..._zeroCategory },
    organization: { ..._zeroCategory },
    ai: { ..._zeroCategory },
  },
  scope_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  ai_literacy_distribution: { 0: 0, 1: 0, 2: 0, 3: 0 },
  free_question_count: 0,
  overall: {
    avg_authenticity: 0,
    avg_judgment: 0,
    avg_scope: 0,
    avg_meta_cognition: 0,
    avg_ai_literacy: 0,
    reached_count: 0,
    stuck_count: 0,
    not_experienced_count: 0,
    undeveloped_count: 0,
  },
  patterns: [],
};
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

期待: 型エラーなしで通る。注意点:
- `generate-session-report.ts` の `heatmap_data` は `as unknown as HeatmapData` でキャストされているため typecheck はパスする（実行時に Zod 検証で fallback が動くが、それは Task 4 で構造的に解消する）。
- `heatmap.tsx` は読み出しのみなので、新フィールド追加では壊れない。
- 唯一の構築箇所だった `_safeHeatmapData` を Step 2 で更新したので、これで型整合が取れる。

- [ ] **Step 4: コミット**

```bash
git add packages/types/src/evaluation.ts packages/ai/src/lib/validate-llm-output.ts
git commit -m "feat(types): extend HeatmapData with overall + patterns, update SAFE_FALLBACK"
```

---

## Task 2: ベンチマーク定数とstuck_type日本語ラベル

**Files:**
- Create: `apps/web/lib/heatmap-benchmarks.ts`
- Create: `apps/web/lib/stuck-type-label.ts`

- [ ] **Step 1: `heatmap-benchmarks.ts` を作成**

`apps/web/lib/heatmap-benchmarks.ts`:

```typescript
/**
 * 評価ヒートマップで使うベンチマーク値と色判定。
 * Stage 1 ではルーブリック定義に基づく固定値。Stage 2 で経験的データに切替を検討。
 * 設計ドキュメント: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §4
 */

export const BENCHMARKS = {
  authenticity: 2.0,
  judgment: 2.0,
  scope: 3.0,
  meta_cognition: 2.0,
  ai_literacy: 1.5,
} as const;

export type ScoreLevel = 'high' | 'mid' | 'low';

/** 0-3 軸（真贋・判断力・メタ認知・AI活用）のスコアレベル判定 */
export function scoreLevel03(value: number): ScoreLevel {
  if (value >= 2.5) return 'high';
  if (value >= 1.5) return 'mid';
  return 'low';
}

/** 1-5 軸（射程）のスコアレベル判定 */
export function scoreLevelScope(value: number): ScoreLevel {
  if (value >= 3.5) return 'high';
  if (value >= 2.5) return 'mid';
  return 'low';
}

/** ScoreLevel → Tailwind 背景色クラス */
export const BAR_COLOR_CLASS: Record<ScoreLevel, string> = {
  high: 'bg-emerald-500',
  mid: 'bg-amber-400',
  low: 'bg-red-500',
};

/** 5 次元の表示順 / 日本語ラベル */
export const DIMENSION_ORDER = [
  'authenticity',
  'judgment',
  'scope',
  'meta_cognition',
  'ai_literacy',
] as const;
export type DimensionKey = (typeof DIMENSION_ORDER)[number];

export const DIMENSION_LABEL: Record<DimensionKey, string> = {
  authenticity: '真贋',
  judgment: '判断力',
  scope: '射程',
  meta_cognition: 'メタ認知',
  ai_literacy: 'AI活用',
};

/** カテゴリ日本語ラベル（既存 heatmap.tsx と一致） */
export const CATEGORY_LABEL = {
  design: 'システム設計',
  trouble: 'トラブル対応',
  performance: 'パフォーマンス',
  security: 'セキュリティ',
  organization: '組織・マネジメント',
  ai: 'AI活用',
} as const;
```

- [ ] **Step 2: `stuck-type-label.ts` を作成**

`apps/web/lib/stuck-type-label.ts`:

```typescript
import type { StuckType } from '@bulr/types/evaluation';

/** stuck_type enum → 日本語表示ラベル */
export const STUCK_TYPE_LABEL: Record<StuckType, string> = {
  not_experienced: '経験なし',
  shallow: '浅い',
  single_option: '選択肢が単一',
  rigid: '固執',
};
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

期待: 型エラーなしで通る。

- [ ] **Step 4: コミット**

```bash
git add apps/web/lib/heatmap-benchmarks.ts apps/web/lib/stuck-type-label.ts
git commit -m "feat(report): add heatmap benchmarks and stuck-type label helpers"
```

---

## Task 3: aggregateHeatmap 関数（決定論的集計）

**Files:**
- Create: `packages/ai/src/lib/aggregate-heatmap.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: aggregateHeatmap 関数を作成**

`packages/ai/src/lib/aggregate-heatmap.ts`:

```typescript
/**
 * pattern_coverage[] + interview_turn[] + assessment_pattern[] から
 * HeatmapData を決定論的に計算する。
 *
 * LLM に算術集計を任せない（速い・安い・正確）。
 * LLM が生成するのは summary_text のみ（generate-session-report.ts 参照）。
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import type {
  PatternCoverage,
  InterviewTurn,
  AssessmentPattern,
} from '@bulr/db/schema';

type CategoryKey = HeatmapData['patterns'][number]['category'];

const ALL_CATEGORIES: CategoryKey[] = [
  'design',
  'trouble',
  'performance',
  'security',
  'organization',
  'ai',
];

function emptyCategoryStats(): HeatmapData['by_category'][CategoryKey] {
  return {
    avg_authenticity: 0,
    avg_judgment: 0,
    avg_scope: 0,
    avg_meta_cognition: 0,
    avg_ai_literacy: 0,
    pattern_count: 0,
  };
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const STUCK_TYPES_DETERIORATED = new Set(['shallow', 'single_option', 'rigid']);

export function aggregateHeatmap(input: {
  allCoverage: PatternCoverage[];
  freeQuestions: InterviewTurn[];
  allPatterns: AssessmentPattern[];
  allTurns: InterviewTurn[]; // turn_count 算出に使う（全 turn、フリー質問込み）
}): HeatmapData {
  const { allCoverage, freeQuestions, allPatterns, allTurns } = input;

  // 高速ルックアップ用
  const patternById = new Map(allPatterns.map((p) => [p.id, p]));

  // turn_count 集計（pattern_id → turn 数）
  const turnCountByPatternId = new Map<string, number>();
  for (const t of allTurns) {
    if (t.pattern_id !== null) {
      turnCountByPatternId.set(t.pattern_id, (turnCountByPatternId.get(t.pattern_id) ?? 0) + 1);
    }
  }

  // ----- patterns 配列を組み立て -----
  const patterns: HeatmapData['patterns'] = allCoverage.flatMap((c) => {
    const pat = patternById.get(c.pattern_id);
    if (!pat) return []; // 想定外、スキップ
    const e = c.llm_evaluation;
    return [{
      pattern_id: c.pattern_id,
      pattern_code: pat.code,
      pattern_title: pat.title,
      category: pat.category as CategoryKey,
      level_reached: c.level_reached as 0 | 1 | 2 | 3 | 4,
      stuck_type: c.stuck_type,
      scores: {
        authenticity: e.authenticity,
        judgment: e.judgment,
        scope: e.scope,
        meta_cognition: e.meta_cognition,
        ai_literacy: e.ai_literacy,
      },
      notes: e.notes,
      turn_count: turnCountByPatternId.get(c.pattern_id) ?? 0,
    }];
  });

  // ----- by_category 集計 -----
  const by_category = Object.fromEntries(
    ALL_CATEGORIES.map((cat) => [cat, emptyCategoryStats()]),
  ) as HeatmapData['by_category'];

  for (const cat of ALL_CATEGORIES) {
    const inCat = patterns.filter((p) => p.category === cat);
    by_category[cat] = {
      avg_authenticity: average(inCat.map((p) => p.scores.authenticity)),
      avg_judgment: average(inCat.map((p) => p.scores.judgment)),
      avg_scope: average(inCat.map((p) => p.scores.scope)),
      avg_meta_cognition: average(inCat.map((p) => p.scores.meta_cognition)),
      avg_ai_literacy: average(inCat.map((p) => p.scores.ai_literacy)),
      pattern_count: inCat.length,
    };
  }

  // ----- scope_distribution -----
  const scope_distribution: HeatmapData['scope_distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of patterns) {
    const s = p.scores.scope;
    if (s >= 1 && s <= 5) {
      scope_distribution[Math.round(s) as 1 | 2 | 3 | 4 | 5]++;
    }
  }

  // ----- ai_literacy_distribution -----
  const ai_literacy_distribution: HeatmapData['ai_literacy_distribution'] = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const p of patterns) {
    const a = p.scores.ai_literacy;
    if (a >= 0 && a <= 3) {
      ai_literacy_distribution[Math.round(a) as 0 | 1 | 2 | 3]++;
    }
  }

  // ----- overall -----
  const overall: HeatmapData['overall'] = {
    avg_authenticity: average(patterns.map((p) => p.scores.authenticity)),
    avg_judgment: average(patterns.map((p) => p.scores.judgment)),
    avg_scope: average(patterns.map((p) => p.scores.scope)),
    avg_meta_cognition: average(patterns.map((p) => p.scores.meta_cognition)),
    avg_ai_literacy: average(patterns.map((p) => p.scores.ai_literacy)),
    reached_count: patterns.filter((p) => p.stuck_type === null && p.level_reached >= 2).length,
    stuck_count: patterns.filter((p) => p.stuck_type !== null && STUCK_TYPES_DETERIORATED.has(p.stuck_type)).length,
    not_experienced_count: patterns.filter((p) => p.stuck_type === 'not_experienced').length,
    undeveloped_count: patterns.filter((p) => p.stuck_type === null && p.level_reached <= 1).length,
  };

  return {
    by_category,
    scope_distribution,
    ai_literacy_distribution,
    free_question_count: freeQuestions.length,
    overall,
    patterns,
  };
}
```

- [ ] **Step 2: バレル再エクスポート**

`packages/ai/src/index.ts` の末尾に追加:

```typescript
export { aggregateHeatmap } from './lib/aggregate-heatmap';
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

期待: 型エラーなしで通る（既存コードへの影響はゼロ）。

- [ ] **Step 4: コミット**

```bash
git add packages/ai/src/lib/aggregate-heatmap.ts packages/ai/src/index.ts
git commit -m "feat(ai): add deterministic aggregateHeatmap to compute HeatmapData in code"
```

---

## Task 4: generateSessionReport を summary_text 単独化 + finalize ルートを更新

> このタスクは `generateSessionReport` の戻り値型を変更するため、その呼び出し元である finalize ルートも同時に修正する必要がある。2 ファイル合わせて 1 コミット。

**Files:**
- Modify: `packages/ai/src/functions/generate-session-report.ts`
- Modify: `apps/web/app/api/interview/finalize/route.ts`

- [ ] **Step 1: generateSessionReport を summary_text 単独に絞る**

`packages/ai/src/functions/generate-session-report.ts` 全体を以下に置き換える:

```typescript
// Requirements 8.7, 8.10, 8.12, 11.5, 12.5, 13.6
// _Boundary: GenerateSessionReport_
// v2 (2026-05-18 redesign): LLM は summary_text のみ生成。heatmap_data はコード側で aggregateHeatmap が算出。

import { generateObject } from 'ai';
import { z } from 'zod';
import { claudeSonnet46 } from '../client';
import { buildSystemPrompt } from '../prompts/system-prompt';
import type { LlmContext } from '../lib/create-llm-context';
import { validateAndFallback } from '../lib/validate-llm-output';
import type { PatternCoverage, InterviewTurn } from '@bulr/db/schema';

const SUMMARY_TEXT_LIMIT = 10000;

export const summaryOutputSchema = z.object({
  summary_text: z.string().max(SUMMARY_TEXT_LIMIT),
});

const SAFE_SUMMARY_FALLBACK = {
  summary_text: 'レポート生成失敗、面接官は管理画面で原データを確認してください',
};

function buildPrompt(allCoverage: PatternCoverage[], freeQuestions: InterviewTurn[]): string {
  const parts: string[] = [];

  const coverageSummary = allCoverage
    .map((c) => {
      const e = c.llm_evaluation;
      return [
        `パターンID: ${c.pattern_id}`,
        `  到達レベル: ${c.level_reached}`,
        `  詰まりタイプ: ${c.stuck_type ?? 'なし'}`,
        `  authenticity: ${e.authenticity}`,
        `  judgment: ${e.judgment}`,
        `  scope: ${e.scope}`,
        `  meta_cognition: ${e.meta_cognition}`,
        `  ai_literacy: ${e.ai_literacy}`,
        `  メモ: ${e.notes}`,
      ].join('\n');
    })
    .join('\n\n');

  parts.push(`## 全パターンカバレッジ（${allCoverage.length} パターン）\n${coverageSummary || '（データなし）'}`);

  if (freeQuestions.length > 0) {
    const freeQSummary = freeQuestions
      .map((t, i) => {
        const candidate = t.transcript.candidate ?? '';
        return `### フリー質問 ${i + 1}\n質問: ${t.question_text}\n回答: ${candidate.slice(0, 500)}`;
      })
      .join('\n\n');
    parts.push(`## フリー質問（${freeQuestions.length} 件）\n${freeQSummary}`);
  } else {
    parts.push(`## フリー質問\n（フリー質問なし）`);
  }

  parts.push(`## タスク
候補者の面接観察事実を簡潔にまとめた summary_text（10000 文字以内）を JSON で返してください。

要件:
- 5次元別の所感（数値の単純引用ではなく、ターンから観察された具体的な事実）
- カテゴリ別のカバレッジ所感
- フリー質問がある場合は別段落で総評
- 採用推奨・不採用推奨・「中堅水準」「強み/弱み」のような評価ラベルは出さない（観察事実のみ）`);

  return parts.join('\n\n---\n\n');
}

const SESSION_REPORT_SUPPLEMENT = `# レポート生成タスク固有の指示

## フリー質問の扱い
フリー質問（pattern_id が null のターン）は、通常の評価パターンとは別段落として summary_text に総評を含めてください。

## 出力内容
- 候補者の観察事実の客観的な要約
- 5 次元別所感（観察された具体事実ベース）
- カテゴリ別のカバレッジ所感
- フリー質問の総評（ある場合）
- 採用可否に関わる判定や「強み/弱み」「中堅水準」のような評価ラベルを含めない`;

// Requirement 8.7: generateSessionReport
export async function generateSessionReport(input: {
  allCoverage: PatternCoverage[];
  freeQuestions: InterviewTurn[];
  ctx: LlmContext;
}): Promise<{ summary_text: string }> {
  const { ctx } = input;
  const prompt = buildPrompt(input.allCoverage, input.freeQuestions);

  const baseSystemPrompt = buildSystemPrompt({
    interviewerProfile: ctx.interviewerProfile,
    candidateInfo: ctx.candidateInfo,
    plannedPatterns: ctx.plannedPatterns,
    completedCoverage: ctx.completedCoverage,
    currentPattern: ctx.currentPattern,
  });
  const systemPrompt = `${baseSystemPrompt}\n\n---\n\n${SESSION_REPORT_SUPPLEMENT}`;

  const { object } = await generateObject({
    model: claudeSonnet46,
    system: systemPrompt,
    schema: summaryOutputSchema,
    prompt,
    maxRetries: 2,
  });

  const validated = validateAndFallback(
    object,
    summaryOutputSchema,
    SAFE_SUMMARY_FALLBACK,
    'generateSessionReport',
  );

  return {
    summary_text: validated.summary_text.slice(0, SUMMARY_TEXT_LIMIT),
  };
}
```

注意: 戻り値の型から `heatmap_data` と `generated_at` を削除した。呼び出し側（finalize ルート）は次の Step で同時に更新する。

- [ ] **Step 2: finalize ルートで aggregateHeatmap を呼び出す**

`apps/web/app/api/interview/finalize/route.ts` の冒頭 import に追加（既存 import の近くに）:

```typescript
import { aggregateHeatmap } from '@bulr/ai';
```

ステップ 5 (`allCoverage, freeQuestions` を取得した直後) で `assessmentPattern` と全 `interview_turn` を追加取得する。既存の `[allCoverage, freeQuestions] = await Promise.all([...])` ブロックを以下に置き換える:

```typescript
  let allCoverage: typeof schema.patternCoverage.$inferSelect[];
  let freeQuestions: typeof schema.interviewTurn.$inferSelect[];
  let allPatterns: typeof schema.assessmentPattern.$inferSelect[];
  let allTurns: typeof schema.interviewTurn.$inferSelect[];
  try {
    [allCoverage, freeQuestions, allPatterns, allTurns] = await Promise.all([
      db.query.patternCoverage.findMany({
        where: eq(schema.patternCoverage.session_id, sessionId),
      }),
      db.query.interviewTurn.findMany({
        where: and(
          eq(schema.interviewTurn.session_id, sessionId),
          isNull(schema.interviewTurn.pattern_id),
        ),
        orderBy: [asc(schema.interviewTurn.sequence_no)],
      }),
      db.query.assessmentPattern.findMany(),
      db.query.interviewTurn.findMany({
        where: eq(schema.interviewTurn.session_id, sessionId),
      }),
    ]);
  } catch (e) {
    console.error(`[finalize] failed to load coverage/freeQuestions/patterns/turns for sessionId=${sessionId}`, e);
    return NextResponse.json({ error: 'data_load_failed', retryable: true }, { status: 503 });
  }
```

ステップ 6 のレポート生成を以下に置き換える（`heatmap_data` をコード集計、`summary_text` のみ LLM):

```typescript
  // 6. レポート生成 (Requirement 11.5)
  // v2: heatmap_data はコード側で決定論的に算出、LLM は summary_text のみ
  const heatmap_data = aggregateHeatmap({
    allCoverage,
    freeQuestions,
    allPatterns,
    allTurns,
  });

  const reportLlm = createLlmContext(
    await buildLlmContext({ session: session!, userId: user.id }),
  );
  let summary: { summary_text: string };
  try {
    summary = await reportLlm.generateSessionReport({
      allCoverage,
      freeQuestions,
    });
  } catch (e) {
    console.error(`[finalize] generateSessionReport failed for sessionId=${sessionId}`, e);
    return NextResponse.json({ error: 'report_generation_failed', retryable: true }, { status: 503 });
  }
  const report = {
    heatmap_data,
    summary_text: summary.summary_text,
    generated_at: new Date().toISOString(),
  };
```

`session_report` UPSERT 部分（ステップ 7）はそのまま `report.heatmap_data`, `report.summary_text`, `report.generated_at` を参照できるので変更不要。

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

期待: 全パッケージで型エラーなし。

- [ ] **Step 4: コミット**

```bash
git add packages/ai/src/functions/generate-session-report.ts apps/web/app/api/interview/finalize/route.ts
git commit -m "refactor(ai,api): generateSessionReport returns summary_text only; finalize uses aggregateHeatmap"
```

---

## Task 5: 既存 session_report のバックフィルスクリプト

**Files:**
- Create: `scripts/migrate-heatmap-v2.ts`

- [ ] **Step 1: バックフィルスクリプトを作成**

`scripts/migrate-heatmap-v2.ts`:

```typescript
/**
 * 既存 session_report.heatmap_data を v2 スキーマに再計算してアップデートする。
 * v1 では LLM が heatmap_data を生成しており overall / patterns が無いので、
 * pattern_coverage + assessment_pattern + interview_turn から再算出する。
 *
 * 実行: pnpm exec tsx scripts/migrate-heatmap-v2.ts
 *
 * このスクリプトは冪等。何度実行しても同じ結果になる。
 */

import { db, schema } from '@bulr/db';
import { aggregateHeatmap } from '@bulr/ai';
import { eq, isNull, and } from 'drizzle-orm';

async function main() {
  const reports = await db.query.sessionReport.findMany();
  console.log(`[migrate] found ${reports.length} session_report rows`);

  const allPatterns = await db.query.assessmentPattern.findMany();
  console.log(`[migrate] loaded ${allPatterns.length} patterns`);

  let updated = 0;
  let skipped = 0;
  for (const report of reports) {
    const sessionId = report.session_id;

    const [allCoverage, freeQuestions, allTurns] = await Promise.all([
      db.query.patternCoverage.findMany({
        where: eq(schema.patternCoverage.session_id, sessionId),
      }),
      db.query.interviewTurn.findMany({
        where: and(
          eq(schema.interviewTurn.session_id, sessionId),
          isNull(schema.interviewTurn.pattern_id),
        ),
      }),
      db.query.interviewTurn.findMany({
        where: eq(schema.interviewTurn.session_id, sessionId),
      }),
    ]);

    if (allCoverage.length === 0 && freeQuestions.length === 0) {
      console.log(`[migrate] sessionId=${sessionId}: no coverage/freeQ, skipping`);
      skipped++;
      continue;
    }

    const newHeatmap = aggregateHeatmap({
      allCoverage,
      freeQuestions,
      allPatterns,
      allTurns,
    });

    await db
      .update(schema.sessionReport)
      .set({ heatmap_data: newHeatmap })
      .where(eq(schema.sessionReport.id, report.id));

    console.log(
      `[migrate] sessionId=${sessionId}: updated (patterns=${newHeatmap.patterns.length}, reached=${newHeatmap.overall.reached_count}, stuck=${newHeatmap.overall.stuck_count})`,
    );
    updated++;
  }

  console.log(`[migrate] done. updated=${updated}, skipped=${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: ローカル DB を起動済みであることを確認**

```bash
docker compose -f docker/compose.yml ps
```

期待: postgres コンテナが running。起動していなければ `pnpm db:up`。

- [ ] **Step 3: スクリプトをローカルで実行**

```bash
pnpm exec tsx scripts/migrate-heatmap-v2.ts
```

期待: `[migrate] found N session_report rows` から始まり、各セッションごとに `updated` 行が出て `[migrate] done.` で終了。エラーが出る場合は中断してデバッグ。

- [ ] **Step 4: スクリプトをコミット**

```bash
git add scripts/migrate-heatmap-v2.ts
git commit -m "chore(scripts): add migrate-heatmap-v2 to backfill existing session_report"
```

---

## Task 6: VerdictSummary（スティッキーバー）コンポーネント

**Files:**
- Create: `apps/web/app/(interviewer)/interviews/_components/report/verdict-summary.tsx`

- [ ] **Step 1: VerdictSummary コンポーネントを作成**

`apps/web/app/(interviewer)/interviews/_components/report/verdict-summary.tsx`:

```typescript
/**
 * 評価ヒートマップ スティッキー判定サマリー (RSC)
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §4
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import {
  BENCHMARKS,
  scoreLevel03,
  scoreLevelScope,
  BAR_COLOR_CLASS,
  DIMENSION_LABEL,
} from '@/lib/heatmap-benchmarks';

interface Props {
  heatmapData: HeatmapData;
}

export function VerdictSummary({ heatmapData }: Props) {
  const { overall, free_question_count } = heatmapData;
  const totalPatterns = heatmapData.patterns.length;

  const dimensions = [
    { key: 'authenticity', value: overall.avg_authenticity, max: 3 },
    { key: 'judgment', value: overall.avg_judgment, max: 3 },
    { key: 'scope', value: overall.avg_scope, max: 5 },
    { key: 'meta_cognition', value: overall.avg_meta_cognition, max: 3 },
    { key: 'ai_literacy', value: overall.avg_ai_literacy, max: 3 },
  ] as const;

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <h3 className="mb-2 text-sm font-bold text-gray-900">
        {overall.reached_count} パターン到達 / {totalPatterns - overall.reached_count} パターン詰まり・未到達
      </h3>

      <div className="grid grid-cols-[1fr_180px] gap-4">
        {/* 5次元バー */}
        <div className="flex flex-col gap-1">
          {dimensions.map((d) => {
            const benchmark = BENCHMARKS[d.key];
            const fillPct = Math.min(Math.max(d.value / d.max, 0), 1) * 100;
            const benchPct = Math.min(Math.max(benchmark / d.max, 0), 1) * 100;
            const level = d.key === 'scope' ? scoreLevelScope(d.value) : scoreLevel03(d.value);
            return (
              <div key={d.key} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-right text-gray-500">{DIMENSION_LABEL[d.key]}</span>
                <div className="relative h-2 flex-1 overflow-visible rounded bg-gray-100">
                  <div
                    className={`h-full rounded ${BAR_COLOR_CLASS[level]}`}
                    style={{ width: `${fillPct.toFixed(1)}%` }}
                  />
                  <div
                    className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-gray-500"
                    style={{ left: `${benchPct.toFixed(1)}%` }}
                    aria-label={`benchmark ${benchmark}`}
                  />
                </div>
                <span className="w-8 text-right font-semibold tabular-nums text-gray-700">
                  {d.value.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>

        {/* 警告サイド */}
        <div className="border-l border-gray-100 pl-3 text-xs">
          <SideRow num={overall.stuck_count} label="件 詰まり" alert={overall.stuck_count > 0} />
          <SideRow num={overall.not_experienced_count} label="件 経験なし" />
          <SideRow num={overall.undeveloped_count} label="件 未深掘り" />
          <SideRow num={free_question_count} label="件 フリー質問" />
          <p className="mt-1 border-t border-gray-100 pt-1 text-[10px] text-gray-400">
            縦線 = ベンチマーク
            <br />
            0–3 軸: 2.0 / 射程: 3.0 / AI: 1.5
          </p>
        </div>
      </div>
    </div>
  );
}

function SideRow({ num, label, alert = false }: { num: number; label: string; alert?: boolean }) {
  return (
    <div className="my-0.5 flex items-baseline gap-1">
      <span
        className={`w-4 text-right font-bold tabular-nums ${alert ? 'text-red-600' : 'text-gray-700'}`}
      >
        {num}
      </span>
      <span className="text-gray-500">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

期待: 新規ファイルが通る。

- [ ] **Step 3: コミット**

```bash
git add apps/web/app/\(interviewer\)/interviews/_components/report/verdict-summary.tsx
git commit -m "feat(report): add VerdictSummary sticky bar component"
```

---

## Task 7: PatternRow + ObservationTab

**Files:**
- Create: `apps/web/app/(interviewer)/interviews/_components/report/pattern-row.tsx`
- Create: `apps/web/app/(interviewer)/interviews/_components/report/observation-tab.tsx`

- [ ] **Step 1: PatternRow コンポーネント**

`apps/web/app/(interviewer)/interviews/_components/report/pattern-row.tsx`:

```typescript
/**
 * 観察タブの 1 行（パターン）を表示。
 * 「深掘り到達」側: 5 次元ミニドット
 * 「詰まり・未到達」側: stuck_type 日本語ラベル
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import { scoreLevel03, scoreLevelScope, BAR_COLOR_CLASS } from '@/lib/heatmap-benchmarks';
import { STUCK_TYPE_LABEL } from '@/lib/stuck-type-label';

type Pattern = HeatmapData['patterns'][number];

interface Props {
  pattern: Pattern;
  variant: 'reached' | 'stuck';
  onSelect: (patternId: string) => void;
}

export function PatternRow({ pattern, variant, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(pattern.pattern_id)}
      className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-2 rounded border border-gray-100 bg-white px-2 py-1.5 text-left text-xs transition hover:border-sky-200 hover:bg-sky-50"
    >
      <span
        className={`rounded px-1 py-0.5 text-center text-[10px] font-bold text-white ${
          variant === 'reached' ? 'bg-cyan-700' : 'bg-gray-500'
        }`}
      >
        {pattern.pattern_code}
      </span>
      <span className="truncate text-gray-700">{pattern.pattern_title}</span>
      {variant === 'reached' ? (
        <MiniDots pattern={pattern} />
      ) : (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
          {pattern.stuck_type ? STUCK_TYPE_LABEL[pattern.stuck_type] : '—'}
        </span>
      )}
    </button>
  );
}

const DOT_COLOR: Record<'high' | 'mid' | 'low', string> = {
  high: 'bg-emerald-500',
  mid: 'bg-amber-400',
  low: 'bg-red-500',
};

function MiniDots({ pattern }: { pattern: Pattern }) {
  const s = pattern.scores;
  const items = [
    scoreLevel03(s.authenticity),
    scoreLevel03(s.judgment),
    scoreLevelScope(s.scope),
    scoreLevel03(s.meta_cognition),
    scoreLevel03(s.ai_literacy),
  ];
  return (
    <span className="flex gap-1">
      {items.map((lv, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${DOT_COLOR[lv]}`} />
      ))}
    </span>
  );
}
```

- [ ] **Step 2: ObservationTab コンポーネント**

`apps/web/app/(interviewer)/interviews/_components/report/observation-tab.tsx`:

```typescript
/**
 * 観察タブ（B-1: 深掘り到達 / 詰まり・未到達 の 2 列）
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §5
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import { PatternRow } from './pattern-row';

interface Props {
  patterns: HeatmapData['patterns'];
  onSelectPattern: (patternId: string) => void;
}

export function ObservationTab({ patterns, onSelectPattern }: Props) {
  const reached = patterns
    .filter((p) => p.stuck_type === null && p.level_reached >= 2)
    .sort(
      (a, b) =>
        b.level_reached - a.level_reached ||
        b.scores.authenticity - a.scores.authenticity,
    );
  const stuck = patterns
    .filter((p) => !(p.stuck_type === null && p.level_reached >= 2))
    .sort(
      (a, b) =>
        b.level_reached - a.level_reached ||
        b.scores.authenticity - a.scores.authenticity,
    );

  return (
    <div className="grid grid-cols-2 gap-3">
      <Column title="深掘り到達" count={reached.length} accent="reached">
        {reached.length === 0 ? (
          <EmptyHint text="到達したパターンがありません" />
        ) : (
          reached.map((p) => (
            <PatternRow
              key={p.pattern_id}
              pattern={p}
              variant="reached"
              onSelect={onSelectPattern}
            />
          ))
        )}
      </Column>
      <Column title="詰まり・未到達" count={stuck.length} accent="stuck">
        {stuck.length === 0 ? (
          <EmptyHint text="詰まり・未到達はありません" />
        ) : (
          stuck.map((p) => (
            <PatternRow
              key={p.pattern_id}
              pattern={p}
              variant="stuck"
              onSelect={onSelectPattern}
            />
          ))
        )}
      </Column>
    </div>
  );
}

function Column({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: 'reached' | 'stuck';
  children: React.ReactNode;
}) {
  const borderClass =
    accent === 'reached' ? 'border-t-cyan-600' : 'border-t-gray-500';
  return (
    <div className={`rounded border-t-2 ${borderClass} bg-gray-50 p-2`}>
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-bold text-gray-900">{title}</span>
        <span className="text-gray-500">{count}件</span>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-4 text-center text-xs italic text-gray-400">{text}</p>;
}
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: コミット**

```bash
git add apps/web/app/\(interviewer\)/interviews/_components/report/pattern-row.tsx apps/web/app/\(interviewer\)/interviews/_components/report/observation-tab.tsx
git commit -m "feat(report): add ObservationTab and PatternRow components"
```

---

## Task 8: CoverageCell + CoverageTab

**Files:**
- Create: `apps/web/app/(interviewer)/interviews/_components/report/coverage-cell.tsx`
- Create: `apps/web/app/(interviewer)/interviews/_components/report/coverage-tab.tsx`

- [ ] **Step 1: CoverageCell コンポーネント**

`apps/web/app/(interviewer)/interviews/_components/report/coverage-cell.tsx`:

```typescript
/**
 * カバレッジタブの 1 セル。
 * 到達済み = 色付き、未到達 = グレー（クリック不可）。
 */

import type { HeatmapData } from '@bulr/types/evaluation';

type Pattern = HeatmapData['patterns'][number];

interface Props {
  pattern: Pattern | null;
  fallbackCode: string; // 未到達セルの表示コード（例: 'D6'）
  onSelect: (patternId: string) => void;
}

const CELL_COLOR_BY_LEVEL: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-gray-100 text-gray-300 cursor-default',
  1: 'bg-red-300 text-red-900',
  2: 'bg-amber-200 text-amber-900',
  3: 'bg-emerald-300 text-emerald-900',
  4: 'bg-emerald-500 text-white',
};

const STUCK_COLOR = 'bg-gray-400 text-white';

export function CoverageCell({ pattern, fallbackCode, onSelect }: Props) {
  if (!pattern) {
    return (
      <div
        className={`flex aspect-square items-center justify-center rounded text-[9px] font-bold font-mono ${CELL_COLOR_BY_LEVEL[0]}`}
        aria-label={`${fallbackCode} 未到達`}
      >
        {fallbackCode}
      </div>
    );
  }
  const isStuck = pattern.stuck_type !== null;
  const colorClass = isStuck
    ? STUCK_COLOR
    : CELL_COLOR_BY_LEVEL[pattern.level_reached as 0 | 1 | 2 | 3 | 4];

  return (
    <button
      type="button"
      onClick={() => onSelect(pattern.pattern_id)}
      className={`flex aspect-square items-center justify-center rounded text-[9px] font-bold font-mono transition hover:opacity-80 ${colorClass}`}
      aria-label={`${pattern.pattern_code} ${pattern.pattern_title}`}
    >
      {pattern.pattern_code.split('-')[1] ?? pattern.pattern_code}
    </button>
  );
}
```

- [ ] **Step 2: CoverageTab コンポーネント**

`apps/web/app/(interviewer)/interviews/_components/report/coverage-tab.tsx`:

```typescript
/**
 * カバレッジタブ（C: 6 カテゴリ × パターングリッド）
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §6
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import type { AssessmentPattern } from '@bulr/db/schema';
import { CATEGORY_LABEL } from '@/lib/heatmap-benchmarks';
import { CoverageCell } from './coverage-cell';

const CATEGORIES: Array<keyof typeof CATEGORY_LABEL> = [
  'design',
  'trouble',
  'performance',
  'security',
  'organization',
  'ai',
];

interface Props {
  patterns: HeatmapData['patterns'];
  allPatterns: AssessmentPattern[]; // 未到達セルを描画するために全パターンが必要
  onSelectPattern: (patternId: string) => void;
}

export function CoverageTab({ patterns, allPatterns, onSelectPattern }: Props) {
  // pattern_id → カバレッジ済みパターン
  const coveredById = new Map(patterns.map((p) => [p.pattern_id, p]));

  return (
    <div className="space-y-3">
      {CATEGORIES.map((cat) => {
        const allInCat = allPatterns
          .filter((p) => p.category === cat)
          .sort((a, b) => a.code.localeCompare(b.code));

        const reachedCount = allInCat.filter((p) => {
          const cov = coveredById.get(p.id);
          return cov && cov.stuck_type === null && cov.level_reached >= 2;
        }).length;
        const stuckCount = allInCat.filter((p) => {
          const cov = coveredById.get(p.id);
          return cov && cov.stuck_type !== null;
        }).length;

        return (
          <div key={cat}>
            <div className="mb-1 grid grid-cols-[120px_1fr_auto] items-center gap-2 text-xs">
              <span className="font-bold text-gray-900">{CATEGORY_LABEL[cat]}</span>
              <div className="h-1 overflow-hidden rounded bg-gray-100">
                <div
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400"
                  style={{ width: allInCat.length ? `${(reachedCount / allInCat.length) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-gray-500">
                {reachedCount}/{allInCat.length} 到達
                {stuckCount > 0 ? ` + ${stuckCount} 詰まり` : ''}
              </span>
            </div>
            <div className="grid grid-cols-12 gap-1">
              {allInCat.map((p) => (
                <CoverageCell
                  key={p.id}
                  pattern={coveredById.get(p.id) ?? null}
                  fallbackCode={p.code.split('-')[1] ?? p.code}
                  onSelect={onSelectPattern}
                />
              ))}
            </div>
          </div>
        );
      })}

      <Legend />
    </div>
  );
}

function Legend() {
  const items = [
    { color: 'bg-gray-100', label: '未到達' },
    { color: 'bg-gray-400', label: '詰まり' },
    { color: 'bg-red-300', label: 'L1' },
    { color: 'bg-amber-200', label: 'L2' },
    { color: 'bg-emerald-300', label: 'L3' },
    { color: 'bg-emerald-500', label: 'L4' },
  ];
  return (
    <div className="flex justify-center gap-3 border-t border-gray-100 pt-2 text-[10px] text-gray-500">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded ${it.color}`} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: コミット**

```bash
git add apps/web/app/\(interviewer\)/interviews/_components/report/coverage-cell.tsx apps/web/app/\(interviewer\)/interviews/_components/report/coverage-tab.tsx
git commit -m "feat(report): add CoverageTab and CoverageCell components"
```

---

## Task 9: PatternDetailPanel（ドリルダウンサイドパネル）

**Files:**
- Create: `apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx`

- [ ] **Step 1: ドリルダウンパネルを Client Component で作成**

`apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx`:

```typescript
'use client';

/**
 * パターン詳細ドリルダウンパネル（右からスライドイン）
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §7
 */

import { useEffect } from 'react';
import type { HeatmapData } from '@bulr/types/evaluation';
import type { InterviewTurn } from '@bulr/db/schema';
import { DIMENSION_LABEL, DIMENSION_ORDER } from '@/lib/heatmap-benchmarks';
import { STUCK_TYPE_LABEL } from '@/lib/stuck-type-label';

type Pattern = HeatmapData['patterns'][number];

interface Props {
  pattern: Pattern | null;
  relatedTurns: InterviewTurn[];
  onClose: () => void;
}

export function PatternDetailPanel({ pattern, relatedTurns, onClose }: Props) {
  // Esc で閉じる
  useEffect(() => {
    if (!pattern) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pattern, onClose]);

  if (!pattern) return null;

  const isStuck = pattern.stuck_type !== null;

  return (
    <>
      {/* 背景クリックで閉じる */}
      <div
        className="fixed inset-0 z-40 bg-black/10"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="false"
        aria-label={`${pattern.pattern_code} ${pattern.pattern_title}`}
        className="fixed right-0 top-0 z-50 flex h-full w-80 max-w-[90vw] flex-col overflow-y-auto border-l border-gray-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="font-mono text-xs font-bold text-cyan-700">{pattern.pattern_code}</p>
            <h3 className="text-sm font-bold text-gray-900">{pattern.pattern_title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 p-4 text-xs">
          {/* スコア */}
          <section className="mb-4 rounded bg-sky-50 p-3 text-sky-900">
            <div className="mb-1 flex justify-between">
              <span>到達段階</span>
              <span className="font-bold">L{pattern.level_reached}</span>
            </div>
            {isStuck && (
              <div className="mb-2 rounded bg-white px-2 py-1 text-center text-[11px] font-semibold text-gray-700">
                詰まり: {STUCK_TYPE_LABEL[pattern.stuck_type!]}
              </div>
            )}
            {DIMENSION_ORDER.map((dim) => (
              <div key={dim} className="my-0.5 flex justify-between">
                <span>{DIMENSION_LABEL[dim]}</span>
                <span className="font-bold tabular-nums">{pattern.scores[dim]}</span>
              </div>
            ))}
          </section>

          {/* 関連ターン */}
          <section className="mb-4">
            <h4 className="mb-2 text-[10px] uppercase tracking-wide text-gray-400">
              関連ターン ({relatedTurns.length}件)
            </h4>
            {relatedTurns.length === 0 ? (
              <p className="italic text-gray-400">関連ターンなし</p>
            ) : (
              <div className="space-y-1">
                {relatedTurns.map((t) => (
                  <div key={t.id} className="rounded bg-gray-50 px-2 py-1">
                    <p className="text-[10px] text-gray-500">Q{t.sequence_no}</p>
                    <p className="text-gray-700">{t.question_text}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* notes */}
          <section>
            <h4 className="mb-2 text-[10px] uppercase tracking-wide text-gray-400">
              評価メモ
            </h4>
            <div className="rounded bg-gray-50 p-2 text-gray-700 whitespace-pre-wrap">
              {pattern.notes || '（メモなし）'}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: コミット**

```bash
git add apps/web/app/\(interviewer\)/interviews/_components/report/pattern-detail-panel.tsx
git commit -m "feat(report): add PatternDetailPanel sliding side drawer"
```

---

## Task 10: ReportView（タブ + ドリルダウン状態管理）

**Files:**
- Create: `apps/web/app/(interviewer)/interviews/_components/report/report-view.tsx`

- [ ] **Step 1: 統合クライアントコンポーネントを作成**

`apps/web/app/(interviewer)/interviews/_components/report/report-view.tsx`:

```typescript
'use client';

/**
 * レポート画面の上位 Client Component。
 * タブの選択状態と、開いているパターン詳細の状態を保持する。
 *
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §3, §12
 */

import { useMemo, useState } from 'react';
import type { HeatmapData } from '@bulr/types/evaluation';
import type { AssessmentPattern, InterviewTurn } from '@bulr/db/schema';

import { VerdictSummary } from './verdict-summary';
import { ObservationTab } from './observation-tab';
import { CoverageTab } from './coverage-tab';
import { PatternDetailPanel } from './pattern-detail-panel';

type TabKey = 'observation' | 'coverage';

interface Props {
  heatmapData: HeatmapData;
  allPatterns: AssessmentPattern[];
  allTurns: InterviewTurn[];
}

export function ReportView({ heatmapData, allPatterns, allTurns }: Props) {
  const [tab, setTab] = useState<TabKey>('observation');
  const [openPatternId, setOpenPatternId] = useState<string | null>(null);

  const openPattern = useMemo(
    () => heatmapData.patterns.find((p) => p.pattern_id === openPatternId) ?? null,
    [heatmapData.patterns, openPatternId],
  );

  const relatedTurns = useMemo(
    () =>
      openPatternId
        ? allTurns
            .filter((t) => t.pattern_id === openPatternId)
            .sort((a, b) => a.sequence_no - b.sequence_no)
        : [],
    [allTurns, openPatternId],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <VerdictSummary heatmapData={heatmapData} />

      <div className="mt-3 flex border-b border-gray-200 text-sm">
        <TabButton active={tab === 'observation'} onClick={() => setTab('observation')}>
          観察
        </TabButton>
        <TabButton active={tab === 'coverage'} onClick={() => setTab('coverage')}>
          カバレッジ
        </TabButton>
      </div>

      <div className="pt-4">
        {tab === 'observation' ? (
          <ObservationTab
            patterns={heatmapData.patterns}
            onSelectPattern={setOpenPatternId}
          />
        ) : (
          <CoverageTab
            patterns={heatmapData.patterns}
            allPatterns={allPatterns}
            onSelectPattern={setOpenPatternId}
          />
        )}
      </div>

      <PatternDetailPanel
        pattern={openPattern}
        relatedTurns={relatedTurns}
        onClose={() => setOpenPatternId(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 transition ${
        active
          ? 'border-cyan-600 font-bold text-cyan-700'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: コミット**

```bash
git add apps/web/app/\(interviewer\)/interviews/_components/report/report-view.tsx
git commit -m "feat(report): add ReportView client component (tabs + drilldown state)"
```

---

## Task 11: get-report-data クエリヘルパー

**Files:**
- Create: `apps/web/lib/queries/get-report-data.ts`

- [ ] **Step 1: ページから必要なデータをまとめて取得するヘルパー**

`apps/web/lib/queries/get-report-data.ts`:

```typescript
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';

/**
 * レポート画面が必要とするデータをまとめて取得する。
 * - session_report
 * - そのセッションの interview_turn 全件（ドリルダウンの関連ターン表示用）
 * - assessment_pattern 全件（カバレッジタブの未到達セル表示用）
 */
export async function getReportData(sessionId: string) {
  const [report, allTurns, allPatterns] = await Promise.all([
    db.query.sessionReport.findFirst({
      where: eq(schema.sessionReport.session_id, sessionId),
    }),
    db.query.interviewTurn.findMany({
      where: eq(schema.interviewTurn.session_id, sessionId),
    }),
    db.query.assessmentPattern.findMany({
      where: eq(schema.assessmentPattern.is_active, true),
    }),
  ]);

  return { report, allTurns, allPatterns };
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: コミット**

```bash
git add apps/web/lib/queries/get-report-data.ts
git commit -m "feat(report): add getReportData query helper"
```

---

## Task 12: report/page.tsx を新コンポーネントで再構築

**Files:**
- Modify: `apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx`

- [ ] **Step 1: ページを書き換える**

`apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx` 全体を以下に置き換える:

```typescript
/**
 * 面接レポートページ（Server Component）
 *
 * v2 (2026-05-18 redesign):
 * - 新ヒートマップ（スティッキー判定 + 観察/カバレッジタブ + ドリルダウン）
 * - 旧「補足情報」セクションは削除（フリー質問数はスティッキーに統合済み）
 */

import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@bulr/db';
import { interviewSession } from '@bulr/db/schema';
import ReactMarkdown from 'react-markdown';

import { requireUser } from '@/lib/guards';
import { getReportData } from '@/lib/queries/get-report-data';
import { ReportView } from '../../_components/report/report-view';

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function ReportPage({ params }: Props) {
  const { sessionId } = await params;

  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    redirect('/sign-in');
  }

  const session = await db.query.interviewSession.findFirst({
    where: eq(interviewSession.id, sessionId),
  });

  if (!session || session.interviewer_id !== user.id) {
    notFound();
  }

  const { report, allTurns, allPatterns } = await getReportData(sessionId);

  if (!report) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl bg-white px-8 py-16 text-center shadow-sm">
            <p className="text-gray-600">
              レポートはまだ生成されていません。面接終了ボタンを押してください。
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">面接レポート</h1>
          <p className="mt-1 text-sm text-gray-500">
            生成日時：{formatDate(report.generated_at)}
          </p>
        </div>

        <ReportView
          heatmapData={report.heatmap_data}
          allPatterns={allPatterns}
          allTurns={allTurns}
        />

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">AIサマリー</h2>
          <div className="prose prose-sm max-w-none text-gray-700">
            <ReactMarkdown>{report.summary_text}</ReactMarkdown>
          </div>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

期待: 全体が通る（heatmap.tsx は未使用になるが残っているので、まだ削除しない）。

- [ ] **Step 3: コミット**

```bash
git add apps/web/app/\(interviewer\)/interviews/\[sessionId\]/report/page.tsx
git commit -m "feat(report): replace old heatmap with new ReportView in report page"
```

---

## Task 13: 印刷 CSS

**Files:**
- Create: `apps/web/app/(interviewer)/interviews/_components/report/report-print.css`
- Modify: `apps/web/app/(interviewer)/interviews/_components/report/report-view.tsx`
- Modify: `apps/web/app/(interviewer)/interviews/_components/report/verdict-summary.tsx`
- Modify: `apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx`

- [ ] **Step 1: 印刷 CSS を作成**

`apps/web/app/(interviewer)/interviews/_components/report/report-print.css`:

```css
/* 印刷時の表示調整 */
@media print {
  /* スティッキー解除 */
  [data-report-sticky] {
    position: static !important;
    backdrop-filter: none !important;
    background-color: white !important;
    border-bottom-width: 1px !important;
  }

  /* タブの両方を展開表示 */
  [data-report-tab-body='observation'],
  [data-report-tab-body='coverage'] {
    display: block !important;
    page-break-inside: avoid;
  }
  [data-report-tab-body='coverage'] {
    margin-top: 1rem;
    border-top: 1px solid #e5e7eb;
    padding-top: 1rem;
  }

  /* タブバー・ドリルダウン非表示 */
  [data-report-tabs] {
    display: none !important;
  }
  [data-report-detail-panel],
  [data-report-detail-backdrop] {
    display: none !important;
  }
}
```

- [ ] **Step 2: ReportView に data 属性を追加して CSS を読み込む**

`report-view.tsx` の冒頭 import に追加:

```typescript
import './report-print.css';
```

次に以下の差分を適用する。

ReportView ルート `<div>` の `VerdictSummary` を囲む部分 — `VerdictSummary` 自身は `data-report-sticky` を付けるために修正が必要。`verdict-summary.tsx` のルート `<div>` に `data-report-sticky` 属性を追加。

```typescript
// verdict-summary.tsx (該当箇所のみ)
<div data-report-sticky className="sticky top-0 z-10 ...">
```

ReportView のタブバーに `data-report-tabs`:

```typescript
<div data-report-tabs className="mt-3 flex border-b border-gray-200 text-sm">
```

ReportView のタブ本体を 2 つとも常にレンダリングし、CSS の display で切り替える（印刷時に両方表示するため）。`<div className="pt-4">` 配下を以下に置き換える:

```typescript
      <div className="pt-4">
        <div
          data-report-tab-body="observation"
          style={{ display: tab === 'observation' ? 'block' : 'none' }}
        >
          <ObservationTab
            patterns={heatmapData.patterns}
            onSelectPattern={setOpenPatternId}
          />
        </div>
        <div
          data-report-tab-body="coverage"
          style={{ display: tab === 'coverage' ? 'block' : 'none' }}
        >
          <CoverageTab
            patterns={heatmapData.patterns}
            allPatterns={allPatterns}
            onSelectPattern={setOpenPatternId}
          />
        </div>
      </div>
```

`PatternDetailPanel` の中で背景とパネルに data 属性を付ける（`pattern-detail-panel.tsx` を修正）:

```typescript
<div
  data-report-detail-backdrop
  className="fixed inset-0 z-40 bg-black/10"
  onClick={onClose}
  aria-hidden="true"
/>
<aside
  data-report-detail-panel
  role="dialog"
  // ...残りは既存通り
>
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: コミット**

```bash
git add apps/web/app/\(interviewer\)/interviews/_components/report/
git commit -m "feat(report): add print CSS and data attributes for print/screen toggles"
```

---

## Task 14: 旧 heatmap.tsx を削除

**Files:**
- Delete: `apps/web/app/(interviewer)/interviews/_components/heatmap.tsx`

- [ ] **Step 1: 削除前に他に参照が無いことを確認**

```bash
grep -rn "from.*_components/heatmap" apps/web --include='*.tsx' --include='*.ts'
```

期待: 出力なし（page.tsx は既に新コンポーネントを使っている）。

- [ ] **Step 2: ファイルを削除（git rm で削除をステージング）**

```bash
git rm apps/web/app/\(interviewer\)/interviews/_components/heatmap.tsx
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: コミット**

```bash
git commit -m "chore(report): remove legacy heatmap.tsx (superseded by ReportView)"
```

（`git rm` で削除済み、再 add は不要）

---

## Task 15: 手動ブラウザ確認

**Files:**
- 動作確認のみ、コード変更なし

- [ ] **Step 1: dev server を起動**

```bash
pnpm db:up   # 既に起動済みなら不要
pnpm --filter @bulr/web dev
```

ブラウザで http://localhost:3020 を開き、ログイン → 既存のレポート画面（`/interviews/{sessionId}/report`）にアクセス。

- [ ] **Step 2: 表示確認チェックリスト**

以下を 1 つずつ確認し、各項目に ✅ を付ける:

- [ ] スティッキー判定バーが上部に表示され、スクロールしても追従する
- [ ] 5 次元バーが緑/黄/赤で色分けされ、各バーに縦のベンチマーク線がある
- [ ] 右側に「詰まり N件 / 経験なし N件 / 未深掘り N件 / フリー質問 N件」が出る
- [ ] 詰まり > 0 のとき該当数字が赤字
- [ ] タブ「観察」「カバレッジ」が表示され、切替できる
- [ ] 観察タブ: 「深掘り到達」「詰まり・未到達」の 2 列で全パターンが振り分けられる
- [ ] 観察タブの行をクリック → 右からドリルダウンパネルがスライドイン
- [ ] カバレッジタブ: カテゴリごとに 6 行のグリッドが出る
- [ ] カバレッジタブの色凡例が末尾に出る
- [ ] カバレッジセル（到達済み）をクリック → ドリルダウンパネル
- [ ] 未到達セルはクリック不可
- [ ] ドリルダウンの「✕」「Esc キー」「外側クリック」すべてで閉じる
- [ ] AI サマリーが下部に表示される
- [ ] 「補足情報」セクションが消えている
- [ ] 評価ラベル（「強み」「弱み」「中堅水準＋」等）が UI 上に出ていない

- [ ] **Step 3: 印刷プレビュー確認**

ブラウザの印刷プレビュー（Cmd+P / Ctrl+P）を開き:

- [ ] スティッキー解除でレイアウトが崩れない
- [ ] 観察 + カバレッジの両方が縦に表示される
- [ ] ドリルダウンパネルとタブバーが非表示

- [ ] **Step 4: 新規セッションでの finalize 動作確認**

新しい面接セッションを作成 → 終了ボタンで finalize → レポート画面に遷移 → 新ヒートマップが正しく出ることを確認。コンソールにエラーが出ないことも確認。

- [ ] **Step 5: コミット不要（コード変更なし）**

---

## Self-Review Notes

設計ドキュメント `docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md` の各セクションが Task でカバーされているか:

- §1–2 背景・設計指針 → 全 Task の前提
- §3 レイアウト全体像 → Task 10, 12
- §4 スティッキー判定 → Task 2 (benchmarks), 6 (VerdictSummary)
- §5 観察タブ B-1 → Task 7
- §6 カバレッジタブ C → Task 8
- §7 ドリルダウン → Task 9
- §8 データ層拡張 → Task 1 (型 + SAFE_FALLBACK), 3 (集計), 4 (LLM/route), 5 (migration)
- §9 AI サマリーと既存セクションの扱い → Task 12（page.tsx 改修で補足情報削除）
- §10 評価ラベルポリシー → Task 4 (LLM プロンプト), Task 6-10 (UI)
- §11 アクセシビリティ・印刷・モバイル → Task 13 (印刷), Task 6/9 (aria 属性)
- §12 コンポーネント分割 → File Structure 全体
- §13 スコープ外 → 触らない（プラン外）
- §14 オープン論点 → Task 15 のチェックリストで実装中に確認
- §15 受け入れ条件 → Task 15 のチェックリストに反映済み

---

## Plan Complete

実装計画は `docs/superpowers/plans/2026-05-18-heatmap-redesign.md` に保存しました。

**実行方法は 2 つ：**

1. **Subagent-Driven（推奨）** — タスクごとに新しいサブエージェントを起動、タスク間で人間がレビュー、高速イテレーション。
2. **Inline Execution** — このセッションで `executing-plans` スキルを使い、チェックポイントごとにバッチ実行。

どちらで進めますか？
