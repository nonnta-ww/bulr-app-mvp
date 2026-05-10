# Brief: assessment-pattern-seed

## Problem

問診の実体である「57 状況パターン × 4 段階質問テンプレ」が DB に存在しないと、`assessment-engine` の Tool（`selectNextPattern`, `recordAnswer` 等）が動作確認できない。問診設計は `docs/02-questionnaire-patterns.md` と `docs/03-probe-logic.md` に Markdown で詳細記述されているが、TypeScript 型と DB レコードへの変換と投入が必要。

## Current State

- `docs/02-questionnaire-patterns.md`: 6 カテゴリ × 57 パターンの定義（状況・判断点・見極め・射程）が Markdown で完成
- `docs/03-probe-logic.md`: 各パターンの 4 段階質問テンプレ（1段導入・2段の核・3段の核・4段の核・真贋シグナル・AI 観点）が Markdown で完成
- `assessment_pattern` テーブル未定義
- シードスクリプトなし
- `monorepo-foundation` で `packages/db` の Drizzle 初期化あり、空スキーマ

## Desired Outcome

- `packages/db/src/schema/assessment-pattern.ts` に `assessment_pattern` テーブルが定義されている
- 57 パターン × 4 段階質問テンプレが TypeScript の型安全なオブジェクト配列として `packages/db/src/seeds/assessment-patterns.ts` に存在
- `scripts/seed-assessment-patterns.ts` で dev branch / production branch に投入可能
- `pnpm seed:patterns` のコマンドで実行できる
- パターン番号（D-01 等）は不変、`is_active` フラグで論理休眠サポート
- 投入後、`assessment_pattern` テーブルに 57 行（D:15 + T:12 + P:8 + S:8 + O:8 + A:6）が存在
- 各レコードで第 1〜4 段の質問テンプレ・真贋シグナル・AI 観点問いが取り出せる
- 再実行可能（idempotent）：既存レコードは upsert で更新、削除は手動運用

## Approach

Markdown ドキュメントから手動で TypeScript シードデータに変換し、Drizzle のシードスクリプトで投入する。LLM による自動変換は試みず、Markdown を唯一の真実として TypeScript を生成し、生成物を git でレビュー可能にする。

- **スキーマ設計**: `assessment_pattern` を 1 テーブルで完結。マスタ（code / category / title / description / 期待射程レンジ）+ 4 段階質問テンプレ（level1_intro / level2_focus / level3_focus / level4_focus）+ 真贋シグナル + AI 観点問い + is_active フラグ
- **TypeScript シード**: `assessment-patterns.ts` で `AssessmentPatternSeed[]` 型の配列を定義、各要素に上記のフィールドを持つ
- **シードスクリプト**: tsx で実行可能な `scripts/seed-assessment-patterns.ts`、ON CONFLICT (code) DO UPDATE で upsert
- **migration**: drizzle-kit generate でマイグレーションファイル生成、dev branch には push、本番には migrate
- **Markdown → TypeScript 変換**: 手動。`docs/02-questionnaire-patterns.md` のパターン定義と `docs/03-probe-logic.md` の質問テンプレを 1 パターンずつ TypeScript オブジェクトに転記。ドキュメントとコードの差分は将来「ドキュメントを正」とする運用で管理（変更時は Markdown と TS を両方更新）

## Scope

- **In**:
  - `packages/db/src/schema/assessment-pattern.ts`: Drizzle スキーマ定義
  - migration ファイル（drizzle-kit generate の出力、`packages/db/migrations/`）
  - `packages/db/src/seeds/assessment-patterns.ts`: 57 パターンの TypeScript シードデータ
  - `packages/db/src/seeds/types.ts`: シードデータ用の型定義（`AssessmentPatternSeed` 等）
  - `scripts/seed-assessment-patterns.ts`: tsx で実行する投入スクリプト
  - `pnpm seed:patterns` コマンド（ルート package.json scripts に追加）
  - upsert ロジック（`code` をユニークキーに、ON CONFLICT DO UPDATE）
  - dev branch / production branch 両方への投入手順を README または `docs/setup/seed.md` に文書化
  - 各カテゴリ（D / T / P / S / O / A）の網羅性チェック（投入後にカウントが 15 / 12 / 8 / 8 / 8 / 6 になっていることを確認するログ）

- **Out**:
  - 受験セッション・回答テーブル（assessment-engine spec）
  - LLM ツール実装（assessment-engine spec）
  - 評価スコアリング（assessment-engine spec）
  - パターン編集 UI（Stage 2、創業者は当面 TypeScript ファイル編集 + シード再実行で運用）
  - パターン使用統計（Stage 2）
  - 多言語対応（Stage 1 は日本語のみ）

## Boundary Candidates

- Drizzle スキーマ（`packages/db/src/schema/assessment-pattern.ts`）
- TypeScript シードデータ（`packages/db/src/seeds/assessment-patterns.ts`、57 オブジェクト）
- シードスクリプト（`scripts/seed-assessment-patterns.ts`）
- migration ファイル

## Out of Boundary

- 受験セッション、回答記録、評価結果のテーブル（assessment-engine spec で定義）
- LLM が `assessment_pattern` を読み取る Tool（`selectNextPattern`、assessment-engine spec）
- 管理画面でのパターン閲覧・編集（Stage 2）
- 受験者プロファイルに応じたパターン優先順位付けロジック（assessment-engine spec のシステムプロンプト + Tool で行う）

## Upstream / Downstream

- **Upstream**:
  - `monorepo-foundation`（packages/db スケルトン、Drizzle 初期化、scripts/ ディレクトリ）
  - `multi-env-infrastructure`（dev / production Neon ブランチ、DATABASE_URL）
- **Downstream**:
  - `assessment-engine`（`assessment_pattern` テーブルを `selectNextPattern` Tool で読み取る、4 段階質問テンプレを LLM プロンプトに動的注入する）

## Existing Spec Touchpoints

- **Extends**: なし
- **Adjacent**:
  - `monorepo-foundation`: packages/db のスキーマファイル配置場所と命名規則を共有
  - `assessment-engine`: スキーマ設計（特に 4 段階質問テンプレのカラム構造）が assessment-engine の Tool 実装と密結合。本 spec で確定したカラム構造を assessment-engine が前提とする
  - `multi-env-infrastructure`: drizzle-kit push / migrate の運用手順を共有

## Constraints

- **`assessment-design.md` 準拠**:
  - パターン番号（D-01 等）は不変、再利用しない
  - `is_active` フラグで論理休眠（廃止しても DB から削除しない）
  - 6 カテゴリ × 57 パターン（D:15 / T:12 / P:8 / S:8 / O:8 / A:6）
  - 各パターンに状況・判断点・見極め・射程 + 4 段階質問テンプレ + 真贋シグナル + AI 観点問い
- **`structure.md` 準拠**:
  - DB テーブル名 snake_case（`assessment_pattern`）
  - DB カラム名 snake_case（`level_1_intro`、`level_2_focus`、`is_active` 等）
  - パターンコードの正規表現: `/^[DTPSOA]-\d{2}$/`
- **`tech.md` 準拠**:
  - Drizzle ORM 0.45.x stable、drizzle-kit
  - TypeScript strict mode、no `any`
- **再現性**: シードスクリプトは idempotent（再実行しても既存レコードを破壊しない、`code` で upsert）
- **データソース**: `docs/02-questionnaire-patterns.md` と `docs/03-probe-logic.md` を真実とし、TypeScript シードはその転記。差分が出た場合はドキュメントを正として TypeScript を更新
- **ローカル開発**: `pnpm seed:patterns` で dev branch に投入、本番投入は手動コマンドで明示的に
- **57 パターンの粒度**: 1 パターンあたり TypeScript で 30〜50 行程度、ファイル全体 2000-3000 行程度を許容（パターンを別ファイルに分割するかは design で判断）
