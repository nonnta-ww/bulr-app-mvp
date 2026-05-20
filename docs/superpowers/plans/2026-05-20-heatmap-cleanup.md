# 評価ヒートマップ Minor クリーンアップ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-05-18 ヒートマップ再設計の最終レビューで挙がった Minor 6 件を 4 コミットで片付ける。

**Architecture:** 既存ファイルの修正のみ。新規ファイル無し、機能追加無し。コード変更 3 コミット + 仕様更新 1 コミット + 手動確認 1 ステップ。

**Tech Stack:** TypeScript / pnpm workspace (turbo) / Drizzle ORM / Next.js 16 / 本リポジトリは単体テストフレーム未導入のため `pnpm typecheck` + マイグレーション再実行 + ブラウザ手動確認で検証する。

**設計の根拠:** `docs/superpowers/specs/2026-05-20-heatmap-cleanup-design.md`

**重要な前提:**
- main ブランチに直接コミット（前回の redesign と同じ運用）。
- 各タスクのコード変更は完全独立。途中で typecheck エラーが残るシーケンスはない。
- T5 は手動確認のみでコミット無し。

---

## File Structure

### 修正

```
packages/ai/src/lib/validate-llm-output.ts                 # SAFE_SESSION_REPORT_FALLBACK + 補助定数削除
packages/ai/src/index.ts                                   # SAFE_SESSION_REPORT_FALLBACK の re-export 削除
scripts/migrate-heatmap-v2.ts                              # skip 条件除去、常に v2 で UPSERT
apps/web/lib/queries/get-report-data.ts                    # is_active=true フィルタ除去
apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx  # stuck_type! 解消
docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md  # §6, §8, §14 を更新
```

### 新規 / 削除

なし。

---

## Task 1: SAFE_SESSION_REPORT_FALLBACK + 補助定数を削除

**Files:**
- Modify: `packages/ai/src/lib/validate-llm-output.ts`
- Modify: `packages/ai/src/index.ts`

### Step 1: validate-llm-output.ts から削除対象を除去

`packages/ai/src/lib/validate-llm-output.ts` の以下を全て削除する（行番号は現状基準、参考）:

- L2 の import から `HeatmapData` を除く（`LlmAnalysis`, `LlmEvaluation` のみ残す）
- L81–L125 の以下全て:
  - コメント `// Requirement 14.7: SAFE_SESSION_REPORT_FALLBACK`
  - `_zeroCategory` 定数
  - `_safeHeatmapData` 定数
  - `SAFE_SESSION_REPORT_FALLBACK` 定数（export 付き）

修正後の冒頭 import 行は以下:

```typescript
import type { LlmAnalysis, LlmEvaluation } from '@bulr/types/evaluation';
import { z } from 'zod';
```

ファイル末尾の最後の export 定数は `SAFE_PROPOSAL_FALLBACK`（既存）になる。

### Step 2: index.ts から re-export を除去

`packages/ai/src/index.ts` の re-export ブロックから `SAFE_SESSION_REPORT_FALLBACK,` を削除する。修正後:

```typescript
// Validation helpers and safe fallbacks
export {
  validateAndFallback,
  SAFE_LLM_ANALYSIS_FALLBACK,
  SAFE_LLM_EVALUATION_FALLBACK,
  SAFE_PROPOSAL_FALLBACK,
} from './lib/validate-llm-output';
```

### Step 3: 削除後に参照が残っていないことを確認

```bash
grep -rn "SAFE_SESSION_REPORT_FALLBACK\|_safeHeatmapData\|_zeroCategory" packages apps scripts --include='*.ts' --include='*.tsx'
```

Expected: 出力なし。

### Step 4: typecheck

```bash
pnpm typecheck
```

Expected: 5/5 packages PASS。

### Step 5: コミット

```bash
git add packages/ai/src/lib/validate-llm-output.ts packages/ai/src/index.ts
git commit -m "chore(ai): remove orphaned SAFE_SESSION_REPORT_FALLBACK"
```

(No Co-Authored-By line. プロジェクトの最近のコミットスタイルに合わせています。)

---

## Task 2: パターン取得の対称性 — `is_active` フィルタ除去 + migrate skip 除去

**Files:**
- Modify: `apps/web/lib/queries/get-report-data.ts`
- Modify: `scripts/migrate-heatmap-v2.ts`

両者とも「assessment_pattern を全件取得し、空セッションでも v2 形を生成する」という共通テーマ。1 コミットにまとめる。

### Step 1: get-report-data.ts から is_active フィルタを除去

`apps/web/lib/queries/get-report-data.ts` の `assessmentPattern.findMany` 呼び出しを `where` 句無しに変更:

```typescript
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';

/**
 * レポート画面が必要とするデータをまとめて取得する。
 * - session_report
 * - そのセッションの interview_turn 全件（ドリルダウンの関連ターン表示用）
 * - assessment_pattern 全件（カバレッジタブの未到達セル表示用。過去セッションが現在は
 *   非アクティブなパターンを参照していても表示できるよう、is_active フィルタはかけない）
 */
export async function getReportData(sessionId: string) {
  const [report, allTurns, allPatterns] = await Promise.all([
    db.query.sessionReport.findFirst({
      where: eq(schema.sessionReport.session_id, sessionId),
    }),
    db.query.interviewTurn.findMany({
      where: eq(schema.interviewTurn.session_id, sessionId),
    }),
    db.query.assessmentPattern.findMany(),
  ]);

  return { report, allTurns, allPatterns };
}
```

注: import の `eq` は他で引き続き使用するため残す。

### Step 2: migrate-heatmap-v2.ts から skip 条件を除去

`scripts/migrate-heatmap-v2.ts` を以下に書き換える（差分は skip ブロック削除、ログ整理、変数 `skipped` の削除）:

```typescript
/**
 * 既存 session_report.heatmap_data を v2 スキーマに再計算してアップデートする。
 * v1 では LLM が heatmap_data を生成しており overall / patterns が無いので、
 * pattern_coverage + assessment_pattern + interview_turn から再算出する。
 *
 * 空セッション（coverage も freeQuestion も無い）も v2 形（全 0 / patterns: []）で
 * 上書きする。skip すると v1 シェイプが残り、画面アクセス時に TypeError 化するため。
 *
 * 実行: pnpm exec tsx scripts/migrate-heatmap-v2.ts
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

  console.log(`[migrate] done. updated=${updated}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### Step 3: typecheck

```bash
pnpm typecheck
```

Expected: PASS。

### Step 4: コミット

```bash
git add apps/web/lib/queries/get-report-data.ts scripts/migrate-heatmap-v2.ts
git commit -m "refactor(report): unify pattern fetching and migration overwrites"
```

(No Co-Authored-By line.)

注: migrate スクリプトの実際の再実行（v2 冪等性の確認）は Task 5 で行う。

---

## Task 3: stuck_type non-null assertion を解消

**Files:**
- Modify: `apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx`

### Step 1: stuck_type をローカル変数で narrow

`pattern-detail-panel.tsx` 中、現状 L39–L84 周辺の `isStuck` ベースの分岐をローカル変数化する。具体的には:

- L39 `const isStuck = pattern.stuck_type !== null;` を削除
- L80–L84 の `{isStuck && (...)}` ブロックを、ローカル変数 `stuckType` でガードする形に書き換え

修正後の該当部分（L37 の `if (!pattern) return null;` 直後から、`return ...` 内の該当 section まで）は以下のとおり:

```typescript
  if (!pattern) return null;

  const stuckType = pattern.stuck_type;

  return (
    <>
      {/* 背景クリックで閉じる */}
      <div
        data-report-detail-backdrop
        className="fixed inset-0 z-40 bg-black/10"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        data-report-detail-panel
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
            ref={closeRef}
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
            {stuckType && (
              <div className="mb-2 rounded bg-white px-2 py-1 text-center text-[11px] font-semibold text-gray-700">
                詰まり: {STUCK_TYPE_LABEL[stuckType]}
              </div>
            )}
            {DIMENSION_ORDER.map((dim) => (
              <div key={dim} className="my-0.5 flex justify-between">
                <span>{DIMENSION_LABEL[dim]}</span>
                <span className="font-bold tabular-nums">{pattern.scores[dim]}</span>
              </div>
            ))}
          </section>
          {/* 関連ターン と notes 以下は変更なし */}
```

変更ポイントは 3 行のみ:
- `const isStuck = pattern.stuck_type !== null;` → `const stuckType = pattern.stuck_type;`
- `{isStuck && (` → `{stuckType && (`
- `{STUCK_TYPE_LABEL[pattern.stuck_type!]}` → `{STUCK_TYPE_LABEL[stuckType]}`

### Step 2: assertion が残っていないことを確認

```bash
grep -n 'stuck_type!' 'apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx'
```

Expected: 出力なし。

### Step 3: typecheck

```bash
pnpm typecheck
```

Expected: PASS。

### Step 4: コミット

```bash
git add 'apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx'
git commit -m "refactor(report): replace stuck_type! assertion with local narrow"
```

(No Co-Authored-By line.)

---

## Task 4: 設計仕様のオープン論点クローズ（列数 + scores nullability）

**Files:**
- Modify: `docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md`

3 セクションを更新。

### Step 1: §6 「カバレッジタブ」の最大数表記を実態に合わせる

§6 (`## 6. カバレッジタブ`) の構造説明の冒頭、現在:

> カテゴリごとに行を持つ。各行は **カテゴリ名 + 進捗バー + 到達数バッジ** のヘッダーと、**そのカテゴリの全パターン**（最大 10 程度）をセルで並べたグリッドからなる。

を以下に変更:

> カテゴリごとに行を持つ。各行は **カテゴリ名 + 進捗バー + 到達数バッジ** のヘッダーと、**そのカテゴリの全パターン**（実データではカテゴリにより 6〜15 個）をセルで並べたグリッドからなる。**グリッドは 12 列固定**で、12 を超えるカテゴリ（design=15, trouble=12 等）は 2 段目に折り返す。

### Step 2: §8 「データ層の拡張」の scores nullability を実装に揃える

§8 内の `patterns: Array<{ ... }>` 型定義の `scores` と `notes` を以下に書き換える（現状の `| null` 付きを非 null に）。元のブロックは:

```ts
    scores: {
      authenticity: number | null;  // null は未深掘り（詰まり等）
      judgment: number | null;
      scope: number | null;
      meta_cognition: number | null;
      ai_literacy: number | null;
    };
    notes: string | null;
```

修正後:

```ts
    scores: {
      authenticity: number;
      judgment: number;
      scope: number;
      meta_cognition: number;
      ai_literacy: number;
    };
    notes: string;
```

§8 末尾、「方針 A」直前あたりに以下の補足を追加:

> 注: `pattern_coverage.llm_evaluation` は NOT NULL かつ `SAFE_LLM_EVALUATION_FALLBACK` が全 0 を保証するため、`scores.*` と `notes` は非 null で十分。`not_experienced` パターンも `authenticity=0` 等の 0 値で記録されるため、null は構造的に発生しない。

### Step 3: §14 「オープン論点」からカバレッジタブの列数を削除

§14 (`## 14. オープン論点`) の箇条書きから「カバレッジタブの列数」項目を削除する。現状:

```
- カバレッジタブの列数: パターンの最大値（カテゴリごとに 8–10 個程度）を見て確定。`packages/db/src/seeds/patterns/*` を集計してデフォルト幅を決める。
- スティッキー判定とタブバーの間のシャドウ / ボーダーの強さ（スクロール感の演出）。
- ベンチマーク線の凡例位置（スティッキー内 vs ツールチップ）。
- 詰まり種別のソート順（経験なし → 浅い → 選択肢が単一 → 固執 の順か、データ準拠か）。
```

修正後:

```
- スティッキー判定とタブバーの間のシャドウ / ボーダーの強さ（スクロール感の演出）。
- ベンチマーク線の凡例位置（スティッキー内 vs ツールチップ）。
- 詰まり種別のソート順（経験なし → 浅い → 選択肢が単一 → 固執 の順か、データ準拠か）。
```

### Step 4: 内容確認

```bash
grep -n "カバレッジタブの列数" docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md
grep -nE "number \| null|string \| null" docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md | grep -v "stuck_type"
```

Expected:
- 1 個目: 出力なし（§14 から消えている）
- 2 個目: 出力なし（scores / notes に `| null` が残っていない。`stuck_type: StuckType | null` は除外）

### Step 5: コミット

```bash
git add docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md
git commit -m "docs(report): close open items in heatmap redesign spec"
```

(No Co-Authored-By line.)

---

## Task 5: マイグレーション再実行 + ブラウザ手動確認

**Files:** 動作確認のみ、コード変更なし。

### Step 1: Postgres 起動確認

```bash
docker compose -f docker/compose.yml ps
```

Expected: `docker-postgres-1` が `running`。未起動なら `pnpm db:up`。

### Step 2: マイグレーション再実行（冪等性確認）

```bash
pnpm exec tsx scripts/migrate-heatmap-v2.ts
```

(pnpm exec が解決できなければ `node_modules/.pnpm/node_modules/.bin/tsx scripts/migrate-heatmap-v2.ts` で実行。)

Expected:
- `[migrate] found N session_report rows` で N>=1
- 各行で `updated` ログ
- `[migrate] done. updated=N`（skip 行のメッセージは出ない）
- 出力の `patterns=` / `reached=` / `stuck=` カウントが、前回実行（5/19）の数値とほぼ同じ範囲に収まっている（冪等の確認）

### Step 3: dev サーバ確認

`http://localhost:3020` がまだ稼働中であることを確認。動いていなければ `pnpm --filter @bulr/web dev` で起動。

### Step 4: ブラウザでのレグレッション確認

`/interviews/{sessionId}/report` を開いて以下が崩れていないことを確認:

- [ ] スティッキー判定バーが表示・スクロール追従
- [ ] 観察タブ: 深掘り到達 / 詰まり・未到達 の 2 列
- [ ] カバレッジタブ: 6 カテゴリ × パターングリッド
- [ ] パターン行 / セルクリック → ドリルダウンパネルがスライドイン
- [ ] ✕ / Esc / 外側クリックで閉じる
- [ ] 評価メモ section にパターンの notes が表示される
- [ ] 詰まりパターンを開いたとき「詰まり: 経験なし / 浅い / 選択肢が単一 / 固執」のラベルが正しく出る
- [ ] AIサマリーが下部に表示

### Step 5: コミット不要

このタスクはコード変更なし。

---

## Self-Review Notes

設計ドキュメント `docs/superpowers/specs/2026-05-20-heatmap-cleanup-design.md` の各 Item が Task でカバーされているか:

- Item 1 (SAFE_SESSION_REPORT_FALLBACK 削除) → Task 1
- Item 2 (migrate skip 除去) → Task 2 Step 2
- Item 3 (is_active 統一) → Task 2 Step 1
- Item 4 (列数のクローズ) → Task 4 Step 3 + Step 1
- Item 5 (stuck_type! 解消) → Task 3
- Item 6 (scores nullability) → Task 4 Step 2

受け入れ条件:
1. `pnpm typecheck` PASS → Task 1/2/3 の各 Step 3 or 4 で確認
2. migrate 再実行で v2 のまま冪等動作 → Task 5 Step 2
3. `grep -rn SAFE_SESSION_REPORT_FALLBACK` で 0 件 → Task 1 Step 3
4. `grep -n 'stuck_type!'` で 0 件 → Task 3 Step 2
5. 設計仕様から「カバレッジタブの列数」が消え scores から `| null` が消える → Task 4 Step 4
6. ブラウザで regression なし → Task 5 Step 4

全項目カバー済み。プレースホルダ無し、後続タスクで参照する型・関数名は前後で整合（実態は既存コードの変更なので新シグネチャ無し）。

---

## Plan Complete

実装計画は `docs/superpowers/plans/2026-05-20-heatmap-cleanup.md` に保存。

**実行方法は 2 つ:**

1. **Subagent-Driven（推奨）** — タスクごとに新サブエージェント、間で確認、高速。
2. **Inline Execution** — このセッションで `executing-plans`、バッチ実行。

どちらで進めますか？
