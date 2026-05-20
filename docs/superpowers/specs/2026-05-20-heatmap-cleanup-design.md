# 評価ヒートマップ Minor クリーンアップ — Design Spec

**作成日**: 2026-05-20
**前段**: `docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md`（v2 redesign）の最終レビューで挙がった Minor 6件を回収する。

---

## 1. 背景

2026-05-18 のヒートマップ再設計（コミット `911a7e4..697f341`、18 コミット）は Approved で完了。最終レビュー subagent が Minor 6件のフォローアップを推奨した。本タスクはそれらを単一の小さなパッチセットで片付ける。

## 2. 設計原則

- 機能追加なし、リファクタ拡張なし、新規ファイル作成なし（既存ファイル修正と仕様更新のみ）。
- 各項目はレビュアー指摘そのまま実装する。判断分岐は事前にユーザー確認済み（is_active 取り扱い・scores nullability・列数方針）。

## 3. 変更内容

### Item 1: `SAFE_SESSION_REPORT_FALLBACK` の削除

**ファイル**: `packages/ai/src/lib/validate-llm-output.ts`, `packages/ai/src/index.ts`

- T4（2026-05-18）で `generateSessionReport` の戻り値型を `{ summary_text: string }` に絞った結果、`SAFE_SESSION_REPORT_FALLBACK` は完全に未参照になった（`grep -rn` で 3 件すべて宣言・export 元）。
- 削除対象:
  - `SAFE_SESSION_REPORT_FALLBACK` 定数
  - `_safeHeatmapData` 定数
  - `_zeroCategory` ヘルパ
  - `packages/ai/src/index.ts` の barrel re-export 行
- `HeatmapData` import が他で使われていなければ削除（要確認）。

### Item 2: `migrate-heatmap-v2.ts` の skip 条件除去

**ファイル**: `scripts/migrate-heatmap-v2.ts`

現在の条件 `if (allCoverage.length === 0 && freeQuestions.length === 0) { skip }` を削除する。理由:

- skip された行は v1 スキーマ（`overall` / `patterns` 無し）のまま残り、画面アクセス時に TypeError リスクがある。
- `aggregateHeatmap` は空入力でも v2 形（全 0 / `patterns: []`）を生成するため、常に UPSERT で v2 化する方が一貫する。
- スクリプトは冪等のまま（既に v2 形なら同じ結果を上書き）。

### Item 3: `is_active` 取り扱いの統一

**ファイル**: `apps/web/lib/queries/get-report-data.ts`

現状の `where: eq(schema.assessmentPattern.is_active, true)` フィルタを除去する。理由:

- `finalize/route.ts` と `migrate-heatmap-v2.ts` は `assessmentPattern.findMany()` 全件取得（フィルタなし）で、レポート画面側だけがフィルタしていた。
- 過去セッションが「面接時はアクティブだったが後にdeactivateされたパターン」を参照していると、カバレッジタブから消える一方で観察タブには残り、UI 不整合になる。
- 全箇所「全パターン取得」に統一すれば、過去セッションの完全な表示が可能になる。

### Item 4: 設計仕様 §14 のオープン論点クローズ（列数）

**ファイル**: `docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md`

§14「オープン論点」の「カバレッジタブの列数」項を更新:

- 現状: 「パターンの最大値（カテゴリごとに 8–10 個程度）を見て確定」
- 更新後: 「**12 列固定で確定**。design (15) / trouble (12) など 12 を超えるカテゴリは 2 段目に折り返す。動的列数は対費用効果が低いため採用しない」

§6「カバレッジタブ」内の「最大 10 程度」も実態に合わせて「カテゴリにより 6〜15、12 列で折り返し」に修正。

### Item 5: `stuck_type!` non-null assertion の解消

**ファイル**: `apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx`

`isStuck && (...)` ブロック内で `pattern.stuck_type!` を使っている箇所を、ローカル変数で narrowing する形に書き換える:

```typescript
// Before:
{isStuck && (
  <div>...{STUCK_TYPE_LABEL[pattern.stuck_type!]}</div>
)}

// After:
{(() => {
  const stuckType = pattern.stuck_type;
  if (!stuckType) return null;
  return <div>...{STUCK_TYPE_LABEL[stuckType]}</div>;
})()}
```

または `isStuck` 変数自体を `const stuckType = pattern.stuck_type` に置き換え、`stuckType` の真偽で分岐させる（より素直）。実装時に読みやすい方を選ぶ。

### Item 6: 設計仕様 §8 の scores nullability 明示

**ファイル**: `docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md`

§8「データ層の拡張」内、`HeatmapData.patterns[]` 型定義の `scores` 部分を修正:

- 現状: `scores.authenticity: number | null; // null は未深掘り（詰まり等）`
- 更新後: `scores.authenticity: number;`（全フィールド非null）

理由: `pattern_coverage.llm_evaluation` は NOT NULL 制約、`aggregatePatternCoverage` の SAFE_LLM_EVALUATION_FALLBACK も全フィールド 0 を保証。`not_experienced` パターンも `authenticity=0` で記録されるため、null は発生し得ない。

§4「色のルール」周辺の「null は…」のような付帯記述があれば併せて削除。

## 4. スコープ外

- 機能追加・新コンポーネント
- 既存テスト整備（テストフレームワーク未導入）
- ARIA 改善の追加対応（最終レビュー T15 後のフォロー `697f341` で完了済み）
- 他の Minor 候補（最終レビューが「Minor」未満と判定したもの）

## 5. コミット戦略

main ブランチ直コミット（前回と同じ）、以下の **4 コミット** に分割:

1. `chore(ai): remove orphaned SAFE_SESSION_REPORT_FALLBACK` — Item 1
2. `refactor(report): unify pattern fetching and migration overwrites` — Items 2 + 3（is_active 関連 + migrate skip 除去、共通テーマ「パターン取得の対称性」）
3. `refactor(report): replace stuck_type! assertion with local narrow` — Item 5
4. `docs(report): close open items in heatmap redesign spec` — Items 4 + 6（仕様更新のみ）

## 6. 受け入れ条件

1. `pnpm typecheck` 全 5 パッケージ PASS
2. `pnpm exec tsx scripts/migrate-heatmap-v2.ts` 再実行で全 5 行が v2 形のまま冪等動作
3. `grep -rn SAFE_SESSION_REPORT_FALLBACK packages apps scripts` で 0 件
4. `grep -n 'stuck_type!' apps/web/app/\(interviewer\)/interviews/_components/report/` で 0 件
5. `docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md` §14 から「カバレッジタブの列数」のオープン論点が消えている、§8 の scores 型から `| null` が消えている
6. `/interviews/{sessionId}/report` を開いて regression なし（ヒートマップ表示・タブ切替・ドリルダウンが従来通り動作）

---

設計はシンプルで決定論点も事前に確定済み。次は `writing-plans` で実装計画を作成。
