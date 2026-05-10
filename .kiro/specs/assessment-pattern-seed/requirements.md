# Requirements Document: assessment-pattern-seed

## Project Description

bulr Stage 1 MVP の中核資産である「6 カテゴリ × 57 状況パターン × 4 段階質問テンプレ」をデータベースに永続化する基盤を構築する。

- **対象ユーザー**: bulr 創業者（パターン定義の運用者）と、後続 spec `assessment-engine` の実装者（パターンを LLM ツール経由で読み出す利用者）
- **現状**: `docs/02-questionnaire-patterns.md` に 57 パターンの定義（状況・判断点・見極め・射程）、`docs/03-probe-logic.md` に 4 段階質問テンプレ・真贋シグナル・AI 観点問いが Markdown で完成しているが、TypeScript 型と DB レコードへの変換と投入が未着手
- **変えたいこと**: `assessment_pattern` テーブルを定義し、Markdown を真実として手動転記した TypeScript シードデータを idempotent に Neon Postgres へ投入する。これにより `assessment-engine` の `selectNextPattern` Tool が動作可能な前提を整える

`monorepo-foundation` で `packages/db` の Drizzle スケルトンと空スキーマバレル、`scripts/` ディレクトリ、`pnpm --filter @bulr/db generate / push / migrate` コマンドが提供されている。`multi-env-infrastructure` で dev / production の Neon ブランチと `DATABASE_URL` 接続が整っている。本スペックはその上に状況パターンマスタを構築する。

---

## Requirements

### Requirement 1: assessment_pattern テーブルのスキーマ定義

**Objective:** As bulr 創業者および assessment-engine 実装者, I want `assessment_pattern` テーブルが Drizzle スキーマとして定義されている状態を, so that 57 パターンを型安全に保存・参照できる。

#### Acceptance Criteria

1. WHEN 開発者が `packages/db/src/schema/` を確認した時 THEN packages/db SHALL `assessment-pattern.ts` ファイルを提供し、その中で `assessment_pattern` テーブルが pgTable として定義されていること
2. WHERE `assessment_pattern` テーブルの定義 THE packages/db SHALL 主キー `id`、ユニークキー `code`、`category`、`title`、`description`、`expected_scope_min`、`expected_scope_max`、`level_1_intro`、`level_2_focus`、`level_3_focus`、`level_4_focus`、`signals`、`ai_perspective`、`is_active`、`created_at`、`updated_at` の列を含むこと
3. WHEN テーブルが定義された時 THEN packages/db SHALL `code` 列に対してユニーク制約を付与し、シードの upsert キーとして利用可能にすること
4. WHEN テーブルが定義された時 THEN packages/db SHALL `code` の値が正規表現 `^[DTPSOA]-\d{2}$` に一致するパターン番号のみを保持する前提を運用ルールとしてシードデータ生成時に検証可能にすること
5. WHEN テーブルが定義された時 THEN packages/db SHALL `is_active` 列をデフォルト `true` の真偽値として保持し、論理休眠（廃止しても物理削除しない運用）を可能にすること
6. WHEN テーブルが定義された時 THEN packages/db SHALL `created_at` および `updated_at` を `timestamp with time zone` 相当でデフォルト `now()` に設定すること
7. WHEN スキーマバレル `packages/db/src/schema/index.ts` が import された時 THEN packages/db SHALL `assessment_pattern` テーブルおよびその型（`AssessmentPattern`、`NewAssessmentPattern`）が再エクスポートされていること
8. WHEN テーブル名・カラム名を確認した時 THEN packages/db SHALL すべて snake_case で命名されており、`structure.md` の命名規則に準拠していること

### Requirement 2: マイグレーションファイルの生成と適用

**Objective:** As 開発者, I want 新スキーマに対応したマイグレーションが生成済みで適用可能な状態を, so that dev / production の Neon ブランチに同一構造を再現できる。

#### Acceptance Criteria

1. WHEN 開発者が `pnpm --filter @bulr/db generate` を実行した時 THEN drizzle-kit SHALL `assessment_pattern` テーブルの `CREATE TABLE` を含むマイグレーション SQL を `packages/db/drizzle/` 配下に生成すること
2. WHEN 生成されたマイグレーションを確認した時 THEN マイグレーション SHALL `code` カラムに UNIQUE 制約、`is_active` のデフォルト値、`created_at`/`updated_at` のデフォルト値を含むこと
3. WHEN dev 環境で `pnpm --filter @bulr/db push` を実行した時 THEN 開発者 SHALL Neon dev ブランチに `assessment_pattern` テーブルが作成されたことを確認できること
4. WHEN production 環境で `pnpm --filter @bulr/db migrate` を実行した時 THEN drizzle-kit SHALL マイグレーション履歴を残しつつ Neon production ブランチに同テーブルを反映できること
5. WHILE マイグレーションが既に適用済みの環境 THE drizzle-kit SHALL 再実行しても差分なしと判定し、既存テーブルを破壊しないこと

### Requirement 3: 57 パターンの TypeScript シードデータ

**Objective:** As bulr 創業者, I want 57 パターン × 4 段階質問テンプレが TypeScript の型安全なオブジェクト配列として一元管理されている状態を, so that ドキュメント変更時に diff レビュー可能な形でコード上で更新できる。

#### Acceptance Criteria

1. WHEN 開発者が `packages/db/src/seeds/` を確認した時 THEN packages/db SHALL `types.ts` に `AssessmentPatternSeed` 型を定義し、シード投入用の正規化された形を提供すること
2. WHEN 開発者がシードデータファイルを確認した時 THEN packages/db SHALL `assessment-patterns.ts`（または同等の構成）から 57 パターンを `AssessmentPatternSeed[]` 型として export すること
3. WHEN シード配列を集計した時 THEN シードデータ SHALL カテゴリ別の件数として D:15 / T:12 / P:8 / S:8 / O:8 / A:6（合計 57）を満たすこと
4. WHERE 各シードオブジェクト THE シードデータ SHALL `code`、`category`、`title`、`description`、`expected_scope_min`、`expected_scope_max`、`level_1_intro`、`level_2_focus`、`level_3_focus`、`level_4_focus`、`signals`、`ai_perspective`、`is_active` のフィールドを必須で含むこと
5. WHEN 各 `code` を検証した時 THEN シードデータ SHALL 正規表現 `^[DTPSOA]-\d{2}$` に一致し、かつ全件で重複が無いこと
6. WHEN 各 `category` を検証した時 THEN シードデータ SHALL `code` の接頭辞（D / T / P / S / O / A）と整合するカテゴリ識別子を持つこと
7. WHEN `expected_scope_min` および `expected_scope_max` を検証した時 THEN シードデータ SHALL `evaluation-rubric.md` の射程定義（1=タスク / 2=機能 / 3=プロダクト / 4=事業 / 5=組織）の整数値を保持し、かつ `min <= max` を満たすこと
8. WHEN シードデータの内容を確認した時 THEN シードデータ SHALL `docs/02-questionnaire-patterns.md` の状況・判断点・見極め・射程と、`docs/03-probe-logic.md` の 4 段階テンプレ・真贋シグナル・AI 観点問いを忠実に転記したものであること
9. IF Markdown と TypeScript の内容に差分が発生した場合 THEN 運用ルール SHALL Markdown を正として TypeScript を更新する方針を採用すること
10. WHILE シードデータが TypeScript で記述されている THE シードデータ SHALL `tech.md` の strict mode と no `any` ルールに準拠した型安全な形で記述されていること

### Requirement 4: 冪等な投入スクリプト

**Objective:** As 開発者, I want `pnpm seed:patterns` 一発で 57 パターンを Neon Postgres に投入・更新できる状態を, so that 環境構築・パターン更新・本番反映を再現可能なオペレーションで実行できる。

#### Acceptance Criteria

1. WHEN 開発者がリポジトリルートで `pnpm seed:patterns` を実行した時 THEN ルート package.json SHALL `scripts/seed-assessment-patterns.ts` を tsx で実行するスクリプトを提供すること
2. WHEN シードスクリプトが起動した時 THEN シードスクリプト SHALL `DATABASE_URL` 環境変数の存在を検証し、未設定なら明確なエラーメッセージで終了すること
3. WHEN シードスクリプトが配列を読み込んだ時 THEN シードスクリプト SHALL 全 57 パターンを `code` をキーにした upsert（INSERT ... ON CONFLICT (code) DO UPDATE）で DB に書き込むこと
4. WHEN シードスクリプトが完了した時 THEN シードスクリプト SHALL 投入後のテーブル件数およびカテゴリ別件数（D:15 / T:12 / P:8 / S:8 / O:8 / A:6）をログに出力すること
5. IF カテゴリ別件数が期待値と一致しない場合 THEN シードスクリプト SHALL 非ゼロ終了コードで exit し、不一致の内訳をエラーログに出力すること
6. WHEN シードスクリプトが 2 回連続で実行された時 THEN シードスクリプト SHALL 既存レコードを破壊せず、同じ最終状態に収束すること（idempotent）
7. WHEN 既存レコードと投入データに差分がある場合 THEN シードスクリプト SHALL `updated_at` を更新しつつ、本文（`title` / `description` / 各段テンプレ等）を上書きすること
8. WHILE 同シードスクリプトが production ブランチに対して実行される時 THE シードスクリプト SHALL DB から既存パターンを物理削除しないこと（廃止運用は `is_active = false` の手動設定に限る）
9. WHEN 開発者が dev ブランチと production ブランチに投入手順を参照した時 THEN リポジトリ SHALL `README.md` または `docs/setup/seed.md` に手順を文書化していること

### Requirement 5: パターン番号の不変性と論理休眠

**Objective:** As bulr 創業者, I want パターン番号（D-01 等）が永続的に固定され、廃止時も物理削除されない運用を, so that 受験データの過去比較と再分析が継続的に可能となる。

#### Acceptance Criteria

1. WHEN パターンを廃止する場合 THEN 運用ルール SHALL 当該パターンの `is_active` を `false` に変更し、レコードを物理削除しないこと
2. WHEN 新規パターンを追加する場合 THEN 運用ルール SHALL 既に使用したパターン番号（is_active を問わず）を再利用しないこと
3. WHEN シードスクリプトが既存パターンを upsert する場合 THEN シードスクリプト SHALL DB 側にあって TypeScript 配列に存在しないパターンを削除しないこと（オーファン検出はログ警告のみ）
4. IF DB に存在するが TypeScript 配列に存在しない `code` が検出された場合 THEN シードスクリプト SHALL `WARN: orphan pattern in DB: <code>` のメッセージを出力し、処理は継続すること
5. WHEN `is_active = false` のパターンが DB に存在する時 THEN `assessment-engine` 側の参照ロジック SHALL これを出題候補から除外することを前提とした運用とすること（本スペックでは前提のみ宣言、実装は assessment-engine spec）

### Requirement 6: スキーマ・シードの命名と配置の整合性

**Objective:** As 後続 spec の実装者, I want パッケージ構成・命名・依存方向が `monorepo-foundation` と `structure.md` の規約に揃った状態を, so that `@bulr/db` から型と関数を一貫した経路で import できる。

#### Acceptance Criteria

1. WHEN 開発者が `@bulr/db` パッケージから assessment_pattern 関連を import する時 THEN packages/db SHALL `import { assessmentPattern, type AssessmentPattern, type NewAssessmentPattern } from '@bulr/db'` のいずれの形でも解決できること
2. WHEN シード型を import する時 THEN packages/db SHALL `import type { AssessmentPatternSeed } from '@bulr/db/seeds/types'` 相当の経路または `@bulr/db` バレル経由で `AssessmentPatternSeed` 型を提供すること
3. WHEN ファイル配置を確認した時 THEN packages/db SHALL `src/schema/assessment-pattern.ts`、`src/seeds/types.ts`、`src/seeds/assessment-patterns.ts`（または `src/seeds/patterns/<category>.ts` の分割）の配置とし、`structure.md` の packages/db 配下の規約に準拠すること
4. WHEN `pnpm --filter @bulr/db typecheck` を実行した時 THEN packages/db SHALL strict mode かつ no `any` でエラーなく完了すること
5. WHEN シードスクリプトが `scripts/` 配下に配置される時 THEN scripts/seed-assessment-patterns.ts SHALL `monorepo-foundation` で確立された scripts ディレクトリの命名規則（kebab-case）に従うこと

### Requirement 7: 投入結果の検証

**Objective:** As 開発者, I want シード実行後に DB の状態が期待通りであることを自動検証できる, so that 環境構築の成功を客観的に確認できる。

#### Acceptance Criteria

1. WHEN シードスクリプトが完了した時 THEN シードスクリプト SHALL `assessment_pattern` テーブルの総レコード数を取得し、57 と一致するかを assertion すること
2. WHEN シードスクリプトが完了した時 THEN シードスクリプト SHALL カテゴリ別の件数を SQL の `GROUP BY category` で取得し、D:15 / T:12 / P:8 / S:8 / O:8 / A:6 と一致するかを assertion すること
3. IF assertion に失敗した場合 THEN シードスクリプト SHALL exit code 非ゼロで終了し、不一致の詳細をログに出力すること
4. WHEN 開発者が手動で SQL を実行した時 THEN 開発者 SHALL `SELECT code, category, title, level_1_intro IS NOT NULL AS has_l1, level_2_focus IS NOT NULL AS has_l2, level_3_focus IS NOT NULL AS has_l3, level_4_focus IS NOT NULL AS has_l4, ai_perspective IS NOT NULL AS has_ai FROM assessment_pattern ORDER BY code` で全 57 行が必須項目を埋めていることを目視確認できること

---

## Out of Scope（明示的な除外）

本スペックは状況パターンマスタの定義と投入のみを担う。以下は別 spec の責務であり、本スペックは契約と前提のみを宣言する：

- **assessment-engine spec の責務**:
  - `assessment_session`、`assessment_answer`、`chat_message` テーブルの定義
  - `selectNextPattern` / `recordAnswer` / `evaluateAnswer` / `generateFollowUp` / `finalizeSession` 等の LLM ツール実装
  - 受験プロファイルに応じたパターン優先順位付けロジック
  - LLM 評価ロジック・5 次元スコア（authenticity / judgment / scope / meta_cognition / ai_literacy）の付与
  - `is_active = false` パターンの除外フィルタの実装
- **authentication spec の責務**: `user_profile` 等の認証関連テーブル
- **multi-env-infrastructure spec の責務**: Neon ブランチ作成、`DATABASE_URL` 設定、CI 統合
- **Stage 2 以降**:
  - パターン編集 UI（管理画面でのパターン参照・編集）
  - パターン使用統計（出題頻度・判別性データ）
  - 多言語対応（Stage 1 は日本語のみ）
  - 職種拡張（フロントエンド・SRE・PdM 等）

## 隣接スペックとの契約

- **upstream**: `monorepo-foundation`（packages/db の Drizzle 初期化、scripts/、@bulr/db バレル）と `multi-env-infrastructure`（DATABASE_URL）に依存。両者の契約を変更する変更は本スペックでは行わない
- **downstream**: `assessment-engine` は本スペックで確定したカラム構造（特に `level_1_intro` / `level_2_focus` / `level_3_focus` / `level_4_focus` / `signals` / `ai_perspective` / `expected_scope_min` / `expected_scope_max`）を前提として `selectNextPattern` Tool の実装を行う。本スペック完了後にカラム構造を変更する場合は `assessment-engine` の再検証が必要
