# Implementation Tasks — assessment-pattern-seed

> 本タスクリストは `assessment-pattern-seed` spec の実装手順を記述する。各サブタスクは 1〜3 時間で完了できる粒度。`(P)` マーカーは並列実行可能タスク。`_Boundary:_` は責務範囲、`_Depends:_` は他タスクへの依存。
>
> **重要**: 57 パターンの内容は `docs/02-questionnaire-patterns.md` および `docs/03-probe-logic.md` を真実とし、TypeScript シードはその転記物として扱う。差分が出た場合はドキュメントを正として TypeScript を更新する。

---

## 1. スキーマ定義

### 1.1 ✅ `assessmentPattern` Drizzle pgTable + `pattern_category` pgEnum を実装

- `bulr-app-mvp/packages/db/src/schema/assessment-pattern.ts` を新規作成
- `pgEnum('pattern_category', ['design', 'trouble', 'performance', 'security', 'organization', 'ai'])` を `patternCategory` という名前で export
- `pgTable('assessment_pattern', { ... })` を `assessmentPattern` という名前で export
- カラム順は brief / design.md 準拠：`id`、`code`、`category`、`title`、`description`、`expected_scope_min`、`expected_scope_max`、`level_1_intro`〜`level_4_focus`、`signals` (text[])、`ai_perspective`、`is_active` (default true)、`created_at`、`updated_at`
- `id`：`text('id').primaryKey().$defaultFn(() => nanoid())`
- `code`：`text('code').notNull().unique()`（onConflictDoUpdate の target に利用）
- `signals`：`text('signals').array().notNull()`
- timestamps：`timestamp({ withTimezone: true }).notNull().defaultNow()`
- `AssessmentPattern` / `NewAssessmentPattern` 型を `$inferSelect` / `$inferInsert` で export
- 完了時の観察可能状態：`pnpm typecheck` が `packages/db` で成功し、`import { assessmentPattern, patternCategory } from './schema/assessment-pattern'` が解決する
- _Boundary: SchemaModule_
- _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7_

### 1.2 ✅ schema バレル更新

- `bulr-app-mvp/packages/db/src/schema/index.ts` の既存空バレルに `export * from './assessment-pattern';` を追加
- 既存コメント（`monorepo-foundation` で書かれた「テーブルは後続 spec で追加」）は適宜整理
- 完了時の観察可能状態：`import { assessmentPattern } from '@bulr/db'` 経由で SchemaModule が解決する（typecheck 成功）
- _Boundary: SchemaModule_
- _Depends: 1.1_
- _Requirements: 1.1_

---

## 2. マイグレーション生成

### 2.1 ✅ drizzle-kit generate でマイグレーション SQL 生成

- `bulr-app-mvp` ルートで `pnpm --filter @bulr/db generate` を実行
- `bulr-app-mvp/packages/db/drizzle/*_assessment_patterns.sql` の glob に一致するマイグレーションファイルが 1 つ生成されることを確認（連番は drizzle-kit が決定、ハードコードしない）
- `bulr-app-mvp/packages/db/drizzle/meta/_journal.json` および `*_snapshot.json` が並行生成されることを確認
- 生成された SQL の内容を目視レビュー：`CREATE TYPE pattern_category AS ENUM (...)`、`CREATE TABLE assessment_pattern (...)`、`CREATE UNIQUE INDEX ... ON assessment_pattern(code)` を含むこと
- 完了時の観察可能状態：`ls bulr-app-mvp/packages/db/drizzle/` でファイルが 1 つ以上存在、SQL を `cat` で確認すると上記 DDL が含まれる
- _Boundary: MigrationFile_
- _Depends: 1.1, 1.2_
- _Requirements: 2.1, 2.4_

### 2.2 ✅ dev branch への push 動作確認

- `DATABASE_URL` を dev branch（Neon dev）に設定（`.env.local` 経由 or 環境変数）
- `pnpm --filter @bulr/db push` を実行し、エラーなく完了することを確認
- `psql $DATABASE_URL -c "\d assessment_pattern"` または Neon Console で、テーブル + 全カラム + UNIQUE INDEX が DB 上に作成されていることを確認
- `psql $DATABASE_URL -c "\dT pattern_category"` で enum 値 6 個が作成されていることを確認
- 完了時の観察可能状態：上記 `\d` 出力で全カラムが brief.md 通り、`\dT` 出力で 6 つの enum 値が確認できる
- _Boundary: MigrationFile_
- _Depends: 2.1_
- _Requirements: 2.2_

---

## 3. シードデータ型定義

### 3.1 ✅ `AssessmentPatternSeed` / `PatternCategory` 型を実装 (P)

- `bulr-app-mvp/packages/db/src/seeds/types.ts` を新規作成
- `PatternCategory` 型：`'design' | 'trouble' | 'performance' | 'security' | 'organization' | 'ai'` のユニオン（schema の `patternCategory.enumValues` から導出してもよい、その場合 `(typeof patternCategory.enumValues)[number]`）
- `AssessmentPatternCode` 型：template literal type で `\`${'D'|'T'|'P'|'S'|'O'|'A'}-${string}\`` 程度の緩い制約（厳密な regex 検証は SeedScript の runtime で実施）
- `AssessmentPatternSeed` 型：`code` / `category` / `title` / `description` / `expected_scope_min` (1-5 リテラル) / `expected_scope_max` (1-5 リテラル) / `level_1_intro` 〜 `level_4_focus` / `signals` (`readonly string[]`) / `ai_perspective` / `is_active?` (boolean、optional)
- snake_case フィールド名（DB カラムと 1:1）
- 完了時の観察可能状態：`pnpm typecheck` が `packages/db` で成功、空ファイルでもよい placeholder seed を別ファイルで作成して型注釈付与しても通る
- _Boundary: TypesModule_
- _Depends: 1.1_
- _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 3.5_

---

## 4. 57 パターンの手動転記（カテゴリ別 6 ファイル）

> 各カテゴリのファイルは `docs/02-questionnaire-patterns.md` と `docs/03-probe-logic.md` から手動転記する。サブタスクごとに PR レビューが可能な単位に分割。各サブタスクの完了基準は「ファイル内に該当数の `AssessmentPatternSeed` オブジェクトが宣言され、TypeScript typecheck が通る」+「Markdown 元と内容が一致（PR diff レビュー）」。

### 4.1 ✅ 設計判断カテゴリ D-01〜D-15 を `design.ts` に転記 (P)

- `bulr-app-mvp/packages/db/src/seeds/patterns/design.ts` を新規作成
- `import type { AssessmentPatternSeed } from '../types'`
- `export const designPatterns: readonly AssessmentPatternSeed[] = [{...D-01}, {...D-02}, ..., {...D-15}] as const;`
- 各オブジェクトの `category: 'design'`、`code: 'D-01'`〜`'D-15'`
- `title` / `description`：`docs/02-questionnaire-patterns.md` の D-XX セクションの「状況」記述から転記
- `expected_scope_min` / `expected_scope_max`：「射程」記述から導出（例：「機能〜プロダクト」→ min=2, max=3）
- `level_1_intro` / `level_2_focus` / `level_3_focus` / `level_4_focus` / `signals` / `ai_perspective`：`docs/03-probe-logic.md` の D-XX セクションから転記
- 完了時の観察可能状態：`designPatterns.length === 15`（実装内 console.log でも検証可能）、`pnpm typecheck` が成功、PR で Markdown 元と diff レビュー
- _Boundary: SeedFiles (design)_
- _Depends: 3.1_
- _Requirements: 4.1, 4.2, 4.9, 4.10, 5.1, 5.2, 5.3, 5.4, 5.5_

### 4.2 ✅ トラブル対応カテゴリ T-01〜T-12 を `trouble.ts` に転記 (P)

- `bulr-app-mvp/packages/db/src/seeds/patterns/trouble.ts` を新規作成
- `troublePatterns: readonly AssessmentPatternSeed[]` を export、12 件
- 各オブジェクトの `category: 'trouble'`、`code: 'T-01'`〜`'T-12'`
- 内容は `docs/02` / `docs/03` の T-XX セクションから転記
- 完了時の観察可能状態：`troublePatterns.length === 12`、typecheck 成功、PR diff レビュー
- _Boundary: SeedFiles (trouble)_
- _Depends: 3.1_
- _Requirements: 4.1, 4.3, 4.9, 4.10, 5.1, 5.2, 5.3, 5.4, 5.5_

### 4.3 ✅ 性能・規模カテゴリ P-01〜P-08 を `performance.ts` に転記 (P)

- `bulr-app-mvp/packages/db/src/seeds/patterns/performance.ts` を新規作成
- `performancePatterns: readonly AssessmentPatternSeed[]` を export、8 件
- 各オブジェクトの `category: 'performance'`、`code: 'P-01'`〜`'P-08'`
- 内容は `docs/02` / `docs/03` の P-XX セクションから転記
- 完了時の観察可能状態：`performancePatterns.length === 8`、typecheck 成功、PR diff レビュー
- _Boundary: SeedFiles (performance)_
- _Depends: 3.1_
- _Requirements: 4.1, 4.4, 4.9, 4.10, 5.1, 5.2, 5.3, 5.4, 5.5_

### 4.4 ✅ セキュリティ・データカテゴリ S-01〜S-08 を `security.ts` に転記 (P)

- `bulr-app-mvp/packages/db/src/seeds/patterns/security.ts` を新規作成
- `securityPatterns: readonly AssessmentPatternSeed[]` を export、8 件
- 各オブジェクトの `category: 'security'`、`code: 'S-01'`〜`'S-08'`
- 内容は `docs/02` / `docs/03` の S-XX セクションから転記
- 完了時の観察可能状態：`securityPatterns.length === 8`、typecheck 成功、PR diff レビュー
- _Boundary: SeedFiles (security)_
- _Depends: 3.1_
- _Requirements: 4.1, 4.5, 4.9, 4.10, 5.1, 5.2, 5.3, 5.4, 5.5_

### 4.5 ✅ 組織・プロセスカテゴリ O-01〜O-08 を `organization.ts` に転記 (P)

- `bulr-app-mvp/packages/db/src/seeds/patterns/organization.ts` を新規作成
- `organizationPatterns: readonly AssessmentPatternSeed[]` を export、8 件
- 各オブジェクトの `category: 'organization'`、`code: 'O-01'`〜`'O-08'`
- 内容は `docs/02` / `docs/03` の O-XX セクションから転記
- 完了時の観察可能状態：`organizationPatterns.length === 8`、typecheck 成功、PR diff レビュー
- _Boundary: SeedFiles (organization)_
- _Depends: 3.1_
- _Requirements: 4.1, 4.6, 4.9, 4.10, 5.1, 5.2, 5.3, 5.4, 5.5_

### 4.6 ✅ AI 活用カテゴリ A-01〜A-06 を `ai.ts` に転記 (P)

- `bulr-app-mvp/packages/db/src/seeds/patterns/ai.ts` を新規作成
- `aiPatterns: readonly AssessmentPatternSeed[]` を export、6 件
- 各オブジェクトの `category: 'ai'`、`code: 'A-01'`〜`'A-06'`
- 内容は `docs/02` / `docs/03` の A-XX セクションから転記
- 完了時の観察可能状態：`aiPatterns.length === 6`、typecheck 成功、PR diff レビュー
- _Boundary: SeedFiles (ai)_
- _Depends: 3.1_
- _Requirements: 4.1, 4.7, 4.9, 4.10, 5.1, 5.2, 5.3, 5.4, 5.5_

---

## 5. 集約 + 件数チェック

### 5.1 ✅ 6 ファイルを集約する `assessment-patterns.ts` を実装

- `bulr-app-mvp/packages/db/src/seeds/assessment-patterns.ts` を新規作成
- 6 つの SeedFiles を import し、`assessmentPatterns: readonly AssessmentPatternSeed[]` を spread で結合 export
- `EXPECTED_COUNTS: Readonly<Record<PatternCategory, number>>` を定数 export（`{ design: 15, trouble: 12, performance: 8, security: 8, organization: 8, ai: 6 }`）
- `countByCategory(patterns: readonly AssessmentPatternSeed[]): Record<PatternCategory, number>` 純関数を export
- 完了時の観察可能状態：`assessmentPatterns.length === 57` を別スクリプト or REPL で確認、`countByCategory(assessmentPatterns)` が EXPECTED_COUNTS と一致、`pnpm typecheck` 成功
- _Boundary: SeedAggregator_
- _Depends: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
- _Requirements: 4.8, 4.10, 9.2_

---

## 6. シードスクリプト実装

### 6.1 ✅ `scripts/seed-assessment-patterns.ts` を実装

- `bulr-app-mvp/scripts/seed-assessment-patterns.ts` を新規作成
- `import { db } from '@bulr/db'`、`import { assessmentPattern } from '@bulr/db/...'`（または相対 path）、`import { assessmentPatterns, EXPECTED_COUNTS, countByCategory } from '@bulr/db/...'`
- `process.env.DATABASE_URL` 未定義時は throw
- `db.transaction(async (tx) => { ... })` で全件 upsert：`tx.insert(assessmentPattern).values(p).onConflictDoUpdate({ target: assessmentPattern.code, set: { ... } })` を 57 回（または `db.insert(...).values([...]).onConflictDoUpdate(...)` のバッチ）
- SET 句に含めるカラム：`category`、`title`、`description`、`expected_scope_min`、`expected_scope_max`、`level_1_intro`〜`level_4_focus`、`signals`、`ai_perspective`、`updated_at: new Date()`（または `sql\`now()\``）
- SET 句から **除外** するカラム：`is_active`（手動 deactivate 保護）、`created_at`（INSERT 時のみ）、`code`、`id`
- 投入前に `code` 全件を regex `/^[DTPSOA]-\d{2}$/` でチェック、不一致あれば throw
- 完了時の観察可能状態：1 回目実行で DB に 57 行 INSERT、2 回目実行で 0 件追加（57 のまま）、典型的な実行時間 1-3 秒
- _Boundary: SeedScript_
- _Depends: 1.2, 2.2, 5.1_
- _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

### 6.2 ✅ 件数ログ + 期待値比較を SeedScript に追加

- `scripts/seed-assessment-patterns.ts` に投入後の検証 + ログ出力を実装
- 投入完了後、DB に対して `SELECT category, COUNT(*) FROM assessment_pattern GROUP BY category` または `SELECT COUNT(*) FROM assessment_pattern` を実行（または `countByCategory(assessmentPatterns)` を投入直前に算出）
- ログフォーマット：
  ```
  assessment_pattern: total = 57
  category: design = 15, trouble = 12, performance = 8, security = 8, organization = 8, ai = 6
  ```
- 不一致時は `console.error` に `expected = {...}, actual = {...}` を出力（プロセスは正常終了）
- 完了時の観察可能状態：実行時に上記 2 行が stdout に出る、件数を意図的に 1 件抜いた状態でテスト実行すると stderr に warning が出る
- _Boundary: SeedScript_
- _Depends: 6.1_
- _Requirements: 6.6, 6.7, 9.1, 9.2, 9.3, 9.4_

---

## 7. pnpm scripts 登録

### 7.1 ✅ ルート `package.json` に `seed:patterns` スクリプトを追加

- `bulr-app-mvp/package.json` の `scripts` セクションに `"seed:patterns": "tsx scripts/seed-assessment-patterns.ts"` を追加（`tsx` 解決パスは実装時に判断、必要なら `pnpm --filter @bulr/db exec tsx ../../scripts/seed-assessment-patterns.ts` 形式）
- 既存 scripts (`dev` / `build` / `typecheck` / `lint` 等) は変更しない
- 完了時の観察可能状態：`pnpm seed:patterns` がリポジトリルートで実行され、SeedScript が起動する（DATABASE_URL があれば 6.2 のログが出る）
- _Boundary: RootPackageJson_
- _Depends: 6.1_
- _Requirements: 7.1, 7.2, 7.3_

---

## 8. ドキュメント

### 8.1 `docs/setup/seed.md` に投入手順を記載

- `bulr-app-mvp/docs/setup/seed.md` を新規作成（`docs/setup/` ディレクトリも新規）
- 内容：
  1. 前提：`DATABASE_URL` が `.env.local` に設定済み（`multi-env-infrastructure` spec を参照と書く）
  2. 初回マイグレーション手順：`pnpm --filter @bulr/db generate` → 出力 SQL のレビュー → `pnpm --filter @bulr/db push`（dev）
  3. シード投入手順：`pnpm seed:patterns`
  4. 検証クエリ：`SELECT COUNT(*) FROM assessment_pattern;`（57 を期待）、`SELECT category, COUNT(*) FROM assessment_pattern GROUP BY category;`（D=15 / T=12 / P=8 / S=8 / O=8 / A=6 を期待）
  5. production 投入手順：`DATABASE_URL` を本番ブランチに切替 → `pnpm --filter @bulr/db migrate` → `pnpm seed:patterns`
  6. 注記：マイグレーションファイル名はハードコードしない（`packages/db/drizzle/*_assessment_patterns.sql` glob で参照）、Markdown ドキュメントが真実、TypeScript シードは転記物（差分発生時は Markdown を正として更新）、`is_active` は SeedScript の SET 句から除外されているため、運用中の手動 deactivate が保護される
- 完了時の観察可能状態：`docs/setup/seed.md` が存在し、新規参画者が手順通りに dev branch に 57 行投入できる
- _Boundary: SetupDoc_
- _Depends: 1.1, 6.2, 7.1_
- _Requirements: 2.5, 5.6, 6.8, 8.1, 8.2, 8.3, 8.4_

---

## 9. 検証 (動作確認)

> Stage 1 は自動テストフレームワーク不採用（design.md 準拠）。手動スモークテストで完了条件を満たす。

### 9.1 シード投入 1 回目 + カウント検証

- dev branch の `DATABASE_URL` で `pnpm seed:patterns` を実行
- stdout に `assessment_pattern: total = 57` が出力されることを確認
- stdout に `category: design = 15, trouble = 12, performance = 8, security = 8, organization = 8, ai = 6` が出力されることを確認
- `psql $DATABASE_URL -c "SELECT COUNT(*) FROM assessment_pattern"` が `57` を返すことを確認
- `psql $DATABASE_URL -c "SELECT category, COUNT(*) FROM assessment_pattern GROUP BY category ORDER BY category"` が `ai 6 / design 15 / organization 8 / performance 8 / security 8 / trouble 12` を返すことを確認
- 完了時の観察可能状態：上記 4 つの確認すべて通過
- _Boundary: SeedScript + DB_
- _Depends: 6.2, 7.1_
- _Requirements: 6.6, 9.1, 9.2_

### 9.2 シード投入 2 回目（冪等性）の検証

- 9.1 完了後、即座に `pnpm seed:patterns` を再実行
- エラーなく完了することを確認
- `SELECT COUNT(*) FROM assessment_pattern` が `57` のまま変わらないことを確認
- `SELECT updated_at FROM assessment_pattern WHERE code = 'D-01'` が 9.1 から進んでいる（UPDATE が走った）ことを確認
- 完了時の観察可能状態：2 回連続実行でも DB レコード数が 57、`updated_at` が更新されている
- _Boundary: SeedScript + DB_
- _Depends: 9.1_
- _Requirements: 6.5_

### 9.3 `is_active=false` 保護の検証

- dev branch で `psql $DATABASE_URL -c "UPDATE assessment_pattern SET is_active = false WHERE code = 'D-01'"`
- `pnpm seed:patterns` を実行
- `psql $DATABASE_URL -c "SELECT is_active FROM assessment_pattern WHERE code = 'D-01'"` が `f`（false）のままであることを確認
- 確認後、戻し処理：`UPDATE assessment_pattern SET is_active = true WHERE code = 'D-01'`
- 完了時の観察可能状態：シード再実行後も `is_active=false` が保持される
- _Boundary: SeedScript + DB_
- _Depends: 9.2_
- _Requirements: 6.3_

### 9.4 DB レコードの内容と Markdown ドキュメントの一致確認

- 各カテゴリから抜き取り検証：D-01, T-01, P-01, S-01, O-01, A-01 の 6 レコードを `psql` で SELECT
- 各レコードの `title`、`description`、`level_1_intro`、`level_2_focus`、`level_3_focus`、`level_4_focus`、`signals`、`ai_perspective`、`expected_scope_min`、`expected_scope_max` が `docs/02-questionnaire-patterns.md` および `docs/03-probe-logic.md` の対応セクションと一致することを目視確認
- 完了時の観察可能状態：6 レコードすべてで Markdown と DB 内容が一致、不一致があれば 4.x のシードファイルを修正して 6.1 を再実行
- _Boundary: SeedFiles + DB_
- _Depends: 9.1_
- _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

### 9.5 production 投入手順の動作確認

- `DATABASE_URL` を production Neon ブランチに切り替え
- `pnpm --filter @bulr/db migrate` を実行し、エラーなく完了することを確認
- `pnpm seed:patterns` を実行し、9.1 と同じログが出ることを確認
- 完了時の観察可能状態：production DB に 57 行存在、ログ通りのカテゴリ別件数
- _Boundary: SeedScript + MigrationFile + production DB_
- _Depends: 9.4, 8.1_
- _Requirements: 2.3, 6.8_

### 9.6 ドキュメント手順の再現性確認

- `docs/setup/seed.md` の手順を新規環境（または `git clean -fdx` 後）で頭から実行
- マイグレーション生成 → push → seed → 検証クエリの全手順が、ドキュメント記載通りで再現できることを確認
- 完了時の観察可能状態：ドキュメントの手順だけで dev branch に 57 行を投入完了、検証クエリが期待値を返す
- _Boundary: SetupDoc + 全コンポーネント_
- _Depends: 8.1, 9.1_
- _Requirements: 8.1, 8.2, 8.3, 8.4_

---

## タスクサマリ

- 主要グループ 9 個（スキーマ / マイグレーション / シード型 / 57 パターン転記（6 ファイル） / 集約 / シードスクリプト / pnpm scripts / ドキュメント / 検証）
- サブタスク総数：21 個
- 並列可能タスク `(P)`：3.1 と、4.1〜4.6 の 6 ファイル転記（合計 7 個、ただし 3.1 は 4.x の前提）
  - 実質並列：3.1 完了後に 4.1〜4.6 を 6 並列で実装可能
- 推定工数：1〜3 時間 × 21 タスク = 21〜63 時間（ただし 4.x の手動転記は 1 ファイル 2-4 時間 × 6、合計 12-24 時間が支配的）
- 全 Requirement (1.1〜9.4) がいずれかのタスクでカバーされる
- v2 用途変更（LLM が面接官に提案する素材）はスキーマ・シード本体に影響なし、本タスクリストはそのまま実行可能
