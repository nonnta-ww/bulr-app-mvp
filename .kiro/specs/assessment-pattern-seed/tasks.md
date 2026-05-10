# Implementation Plan: assessment-pattern-seed

> 凡例: `(P)` = 並列実行可能。`_Boundary:_` = タスクが触る design.md のコンポーネント / ファイル境界。`_Depends:_` = 他タスクへの依存。`_Requirements:_` = requirements.md の Acceptance Criteria 番号。

---

- [ ] 1. assessment_pattern Drizzle スキーマの定義
- [ ] 1.1 assessment-pattern.ts に pgTable 定義を追加する
  - `packages/db/src/schema/assessment-pattern.ts` を新規作成
  - `pgTable('assessment_pattern', { ... })` で全カラム（`id`, `code`, `category`, `title`, `description`, `expected_scope_min`, `expected_scope_max`, `level_1_intro`, `level_2_focus`, `level_3_focus`, `level_4_focus`, `signals`, `ai_perspective`, `is_active`, `created_at`, `updated_at`）を定義
  - `code` に `.unique()` 制約、`is_active` のデフォルト `true`、`created_at` / `updated_at` のデフォルト `now()` を設定
  - `signals` は `text('signals').array().notNull().default(sql\`'{}'::text[]\`)` で配列型
  - `AssessmentPattern` (`$inferSelect`) と `NewAssessmentPattern` (`$inferInsert`) 型を export
  - 完了条件: `pnpm --filter @bulr/db typecheck` がエラーなく完了する
  - _Boundary: SchemaPattern_
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8_

- [ ] 1.2 schema バレルから assessment_pattern を再エクスポートする
  - `packages/db/src/schema/index.ts` の `export {};` を `export * from './assessment-pattern';` に置換
  - `packages/db/src/index.ts` から `import { assessmentPattern } from '@bulr/db'` 相当が解決可能になる
  - 完了条件: `import { assessmentPattern, type AssessmentPattern, type NewAssessmentPattern } from '@bulr/db'` が typecheck 通過する確認 import を一時 fixture で書く（または後続 1.3 のシード型タスクで間接確認）
  - _Boundary: SchemaIndex_
  - _Depends: 1.1_
  - _Requirements: 1.7, 6.1_

- [ ] 2. マイグレーション SQL 生成と dev 適用
- [ ] 2.1 drizzle-kit generate でマイグレーションを生成する
  - `pnpm --filter @bulr/db generate` を実行
  - `packages/db/drizzle/*_<adjective>_<noun>.sql`（drizzle-kit が次に利用可能な連番で出力。`authentication` と並列 Wave 2 のため、実行順序により `0001` または `0002` になる）と `meta/_journal.json`、対応する `meta/<NNNN>_snapshot.json` が生成される
  - 生成 SQL に `CREATE TABLE assessment_pattern`、`code VARCHAR(8) NOT NULL`、`UNIQUE` 制約、`signals TEXT[] NOT NULL DEFAULT '{}'`、`is_active BOOLEAN NOT NULL DEFAULT true`、`created_at TIMESTAMPTZ NOT NULL DEFAULT now()` が含まれることを目視確認（例: `grep 'CREATE TABLE assessment_pattern' packages/db/drizzle/*_*.sql`）
  - 完了条件: 生成された SQL ファイルと meta ファイルがコミット可能な状態（手動編集なし）
  - _Boundary: Migration_
  - _Depends: 1.2_
  - _Requirements: 2.1, 2.2_

- [ ] 2.2 dev Neon ブランチにスキーマを反映する
  - `.env.local` の `DATABASE_URL` が dev ブランチを指していることを確認
  - `pnpm --filter @bulr/db push` を実行
  - `psql $DATABASE_URL -c '\d assessment_pattern'` で全 16 カラムと UNIQUE 制約・デフォルト値を目視確認
  - 完了条件: dev ブランチに `assessment_pattern` テーブルが存在し、`SELECT COUNT(*) FROM assessment_pattern;` が `0` を返す
  - _Boundary: Migration_
  - _Depends: 2.1_
  - _Requirements: 2.3_

- [ ] 3. シード型定義の整備
- [ ] 3.1 AssessmentPatternSeed 型と関連列挙を定義する
  - `packages/db/src/seeds/types.ts` を新規作成
  - `PATTERN_CATEGORIES` const tuple（`'design'` 〜 `'ai'`）、`PatternCategory` type、`ScopeLevel = 1 | 2 | 3 | 4 | 5`、`AssessmentPatternSeed` type を export
  - `code` は template literal type で接頭辞 D/T/P/S/O/A を制約
  - `isActive` は省略可能（`?: boolean`）
  - 完了条件: `pnpm --filter @bulr/db typecheck` がエラーなく完了
  - _Boundary: SeedTypes_
  - _Depends: 1.2_
  - _Requirements: 3.1, 3.4, 3.7, 3.10, 6.2_

- [ ] 3.2 seeds バレルとパッケージ index への露出を整える (P)
  - `packages/db/src/seeds/index.ts` を新規作成し `export * from './types'; export * from './assessment-patterns';` を記述（後者は 5.1 で実体化）
  - `packages/db/src/index.ts` に `export * from './seeds';` を追記
  - 完了条件: 5.1 完了後に `import { type AssessmentPatternSeed, assessmentPatternSeeds } from '@bulr/db'` が typecheck 通過することを 5.x で間接検証可能になる
  - _Boundary: SeedIndex / DbIndex_
  - _Depends: 3.1_
  - _Requirements: 6.1, 6.2_

- [ ] 4. 57 パターンの TypeScript シードデータの転記
  > 各サブタスクは「Markdown を読み、TypeScript の `AssessmentPatternSeed[]` 配列に転記する」作業。レビュー単位を「カテゴリ単位の PR」に分割して負荷分散する。`docs/02-questionnaire-patterns.md` から状況・判断点・見極め・射程、`docs/03-probe-logic.md` から 4 段階質問テンプレ・真贋シグナル・AI 観点問いを取得し転記する。

- [ ] 4.1 設計判断パターン D-01..D-15 を転記する
  - `packages/db/src/seeds/patterns/design.ts` を新規作成
  - `export const designSeeds: AssessmentPatternSeed[] = [...]` で D-01〜D-15 の 15 オブジェクトを定義
  - 各オブジェクトの `category` は `'design'`、`code` は `D-01` 〜 `D-15`
  - 各レベルテンプレと `signals`、`aiPerspective` は Markdown を忠実に転記（句読点・改行を保つ）
  - 完了条件: `designSeeds.length === 15` であり、`pnpm --filter @bulr/db typecheck` がエラーなく完了
  - _Boundary: SeedCategoryFiles (design.ts)_
  - _Depends: 3.1_
  - _Requirements: 3.2, 3.3, 3.4, 3.8, 3.10_

- [ ] 4.2 トラブル対応パターン T-01..T-12 を転記する (P)
  - `packages/db/src/seeds/patterns/trouble.ts` を新規作成、`troubleSeeds` を export
  - T-01 〜 T-12 の 12 オブジェクトを Markdown から忠実に転記
  - 完了条件: `troubleSeeds.length === 12`、typecheck 通過
  - _Boundary: SeedCategoryFiles (trouble.ts)_
  - _Depends: 3.1_
  - _Requirements: 3.2, 3.3, 3.4, 3.8, 3.10_

- [ ] 4.3 性能・規模パターン P-01..P-08 を転記する (P)
  - `packages/db/src/seeds/patterns/performance.ts` を新規作成、`performanceSeeds` を export
  - P-01 〜 P-08 の 8 オブジェクトを転記
  - 完了条件: `performanceSeeds.length === 8`、typecheck 通過
  - _Boundary: SeedCategoryFiles (performance.ts)_
  - _Depends: 3.1_
  - _Requirements: 3.2, 3.3, 3.4, 3.8, 3.10_

- [ ] 4.4 セキュリティ・データパターン S-01..S-08 を転記する (P)
  - `packages/db/src/seeds/patterns/security.ts` を新規作成、`securitySeeds` を export
  - S-01 〜 S-08 の 8 オブジェクトを転記
  - 完了条件: `securitySeeds.length === 8`、typecheck 通過
  - _Boundary: SeedCategoryFiles (security.ts)_
  - _Depends: 3.1_
  - _Requirements: 3.2, 3.3, 3.4, 3.8, 3.10_

- [ ] 4.5 組織・プロセスパターン O-01..O-08 を転記する (P)
  - `packages/db/src/seeds/patterns/organization.ts` を新規作成、`organizationSeeds` を export
  - O-01 〜 O-08 の 8 オブジェクトを転記
  - 完了条件: `organizationSeeds.length === 8`、typecheck 通過
  - _Boundary: SeedCategoryFiles (organization.ts)_
  - _Depends: 3.1_
  - _Requirements: 3.2, 3.3, 3.4, 3.8, 3.10_

- [ ] 4.6 AI 活用パターン A-01..A-06 を転記する (P)
  - `packages/db/src/seeds/patterns/ai.ts` を新規作成、`aiSeeds` を export
  - A-01 〜 A-06 の 6 オブジェクトを転記
  - 完了条件: `aiSeeds.length === 6`、typecheck 通過
  - _Boundary: SeedCategoryFiles (ai.ts)_
  - _Depends: 3.1_
  - _Requirements: 3.2, 3.3, 3.4, 3.8, 3.10_

- [ ] 5. シードデータの集約
- [ ] 5.1 6 カテゴリを連結し assessmentPatternSeeds を export する
  - `packages/db/src/seeds/assessment-patterns.ts` を新規作成
  - 6 ファイルから配列を import、`export const assessmentPatternSeeds: AssessmentPatternSeed[] = [...designSeeds, ...troubleSeeds, ...performanceSeeds, ...securitySeeds, ...organizationSeeds, ...aiSeeds];`
  - 完了条件: `assessmentPatternSeeds.length === 57`、`pnpm --filter @bulr/db typecheck` がエラーなく完了し、`@bulr/db` バレル経由で `assessmentPatternSeeds` を import 可能
  - _Boundary: SeedAggregate_
  - _Depends: 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - _Requirements: 3.2, 6.1, 6.2_

- [ ] 6. 投入スクリプトの実装
- [ ] 6.1 シードスクリプトを実装する
  - `scripts/seed-assessment-patterns.ts` を新規作成
  - design.md の SeedScript セクションのスケルトンに沿って実装:
    1. `DATABASE_URL` 検証（未設定で `console.error('FATAL: DATABASE_URL is required')` + exit 1）
    2. `assessmentPatternSeeds` の事前 validate（code 正規表現 `^[DTPSOA]-\d{2}$`、code 重複なし、code 接頭辞と category の整合、`expectedScopeMin <= expectedScopeMax`、`signals` 非空、配列件数 === 57）
    3. `db.transaction()` 内で `db.insert(assessmentPattern).values(...).onConflictDoUpdate({ target: assessmentPattern.code, set: { ...本文列, updatedAt: new Date() } })`（`is_active` は更新対象外）
    4. 投入後 `SELECT category, COUNT(*) GROUP BY category` を取得し、D:15/T:12/P:8/S:8/O:8/A:6 と assertion（不一致は `MISMATCH ...` ログ + exit 1）
    5. オーファン検出（DB にあって配列にない code を `WARN: orphan pattern in DB: <code>` で出力、exit code は 0）
    6. 成功時 `seeded 57 patterns (D:15, T:12, P:8, S:8, O:8, A:6)` を stdout に出力し exit 0
  - 完了条件: `pnpm --filter @bulr/db typecheck` を含む全 typecheck がエラーなく完了し、ファイルが strict mode + no `any` 準拠
  - _Boundary: SeedScript_
  - _Depends: 5.1, 2.2_
  - _Requirements: 1.4, 3.5, 3.6, 3.7, 3.10, 4.2, 4.3, 4.6, 4.7, 4.8, 5.3, 5.4, 7.1, 7.2, 7.3_

- [ ] 6.2 ルート package.json に seed:patterns スクリプトを追加する
  - ルート `package.json` の `scripts` に `"seed:patterns": "tsx scripts/seed-assessment-patterns.ts"` を追加
  - ルート `devDependencies` に `tsx` がない場合は `tsx@^4` を追加（`monorepo-foundation` で `packages/db` 側に入っているため通常は不要、要 hoisting 確認）
  - 完了条件: リポジトリルートで `pnpm seed:patterns --help` 相当の dry に近い起動（`DATABASE_URL` 未設定で `FATAL: DATABASE_URL is required` を出力して exit 1）が確認できる
  - _Boundary: RootPackageJson_
  - _Depends: 6.1_
  - _Requirements: 4.1, 6.5_

- [ ] 7. 投入手順の文書化
- [ ] 7.1 docs/setup/seed.md に dev / production 投入手順と運用ルールを記述する (P)
  - `docs/setup/seed.md` を新規作成
  - セクション: (1) 概要、(2) dev 投入手順、(3) production 投入手順、(4) Markdown を正とする運用ルール、(5) パターン廃止（is_active=false）、(6) 新規パターン追加（番号再利用禁止）、(7) トラブルシュート
  - 完了条件: 文書を読んだ第三者が dev / production への投入を独立に再現でき、運用ルールを理解できる
  - _Boundary: DocSeedSetup_
  - _Depends: 6.2_
  - _Requirements: 3.9, 4.9, 5.1, 5.2_

- [ ] 8. 検証
- [ ] 8.1 dev ブランチでシード投入と冪等性を検証する
  - 8.1.a `pnpm seed:patterns` 初回実行 → `seeded 57 patterns (D:15, T:12, P:8, S:8, O:8, A:6)` がログ出力され exit 0
  - 8.1.b `psql $DATABASE_URL -c "SELECT COUNT(*) FROM assessment_pattern;"` が `57` を返す
  - 8.1.c `psql $DATABASE_URL -c "SELECT category, COUNT(*) FROM assessment_pattern GROUP BY category ORDER BY category;"` が design:15 / trouble:12 / performance:8 / security:8 / organization:8 / ai:6 を返す
  - 8.1.d `pnpm seed:patterns` を 2 回目実行 → exit 0、件数 57 のまま、`updated_at` が進む
  - 8.1.e `psql $DATABASE_URL -c "SELECT code, level_1_intro IS NOT NULL AS l1, level_2_focus IS NOT NULL AS l2, level_3_focus IS NOT NULL AS l3, level_4_focus IS NOT NULL AS l4, ai_perspective IS NOT NULL AS ai FROM assessment_pattern ORDER BY code;"` で全 57 行の必須項目が埋まっていることを目視確認
  - 完了条件: 上記 5 つすべてが期待通りの結果を返す
  - _Boundary: SeedScript + DB（dev）_
  - _Depends: 6.2_
  - _Requirements: 4.4, 4.6, 7.1, 7.2, 7.4_

- [ ] 8.2 上書きとオーファン検出の挙動を検証する
  - 8.2.a `psql $DATABASE_URL -c "UPDATE assessment_pattern SET title = 'tampered' WHERE code = 'D-01';"` で 1 件改ざん
  - 8.2.b `pnpm seed:patterns` 実行後 `SELECT title FROM assessment_pattern WHERE code='D-01';` が元の title に戻ることを確認（上書き挙動）
  - 8.2.c `psql $DATABASE_URL -c "INSERT INTO assessment_pattern (code, category, title, description, expected_scope_min, expected_scope_max, level_1_intro, level_2_focus, level_3_focus, level_4_focus, signals, ai_perspective) VALUES ('D-99', 'design', 'orphan', 'orphan', 1, 1, 'x', 'x', 'x', 'x', '{}', 'x');"` でオーファンを作成
  - 8.2.d `pnpm seed:patterns` 実行 → `WARN: orphan pattern in DB: D-99` がログ出力され exit 0、`SELECT COUNT(*)` が 58 のまま（DELETE されない）
  - 8.2.e クリーンアップ: `psql $DATABASE_URL -c "DELETE FROM assessment_pattern WHERE code = 'D-99';"`
  - 完了条件: 上書き・オーファン検出・物理削除しない挙動が検証される
  - _Boundary: SeedScript + DB（dev）_
  - _Depends: 8.1_
  - _Requirements: 4.7, 4.8, 5.3, 5.4_

- [ ] 8.3 is_active 保持の挙動を検証する
  - 8.3.a `psql $DATABASE_URL -c "UPDATE assessment_pattern SET is_active = false WHERE code = 'D-15';"` で 1 件を論理休眠
  - 8.3.b `pnpm seed:patterns` 実行後 `SELECT is_active FROM assessment_pattern WHERE code = 'D-15';` が `false` のまま保持されることを確認
  - 8.3.c クリーンアップ: `psql $DATABASE_URL -c "UPDATE assessment_pattern SET is_active = true WHERE code = 'D-15';"`
  - 完了条件: シードスクリプトが `is_active` を上書きしないことが検証される
  - _Boundary: SeedScript + DB（dev）_
  - _Depends: 8.1_
  - _Requirements: 1.5, 4.7, 5.1_

- [ ] 8.4 不整合シナリオで exit code 非ゼロを確認する
  - 8.4.a `DATABASE_URL` を unset して `pnpm seed:patterns` 実行 → `FATAL: DATABASE_URL is required` を stderr 出力し exit 1
  - 8.4.b 一時的にローカル fixture で `code` 重複や category 不整合を含む配列を作って実行（または該当パスを目視レビュー）→ pre-validate で exit 1
  - 完了条件: validation 失敗が exit code 非ゼロで終了することが確認できる
  - _Boundary: SeedScript_
  - _Depends: 6.2_
  - _Requirements: 4.2, 4.5, 7.3_

- [ ] 8.5 production ブランチへの初回投入を実施する
  - 8.5.a 環境変数を production の `DATABASE_URL` に切り替え（`.env.local` 編集 or `DATABASE_URL=... pnpm ...`）
  - 8.5.b `pnpm --filter @bulr/db migrate` で migration を履歴付き反映
  - 8.5.c `pnpm seed:patterns` で 57 パターンを投入
  - 8.5.d production の Neon ブランチで `SELECT COUNT(*)` と `GROUP BY category` を実行し dev と同一分布を確認
  - 完了条件: production ブランチに 57 行が冪等に投入されている
  - _Boundary: Migration + SeedScript + DB（production）_
  - _Depends: 7.1, 8.1_
  - _Requirements: 2.4, 2.5, 4.6_

- [ ] 8.6 typecheck と lint の最終確認 (P)
  - リポジトリルートで `pnpm typecheck` を実行 → 全 workspace でエラーなく完了
  - リポジトリルートで `pnpm lint` を実行 → エラーなし、`no-explicit-any` warning が 0 件
  - 完了条件: 全 workspace の typecheck / lint が通る
  - _Boundary: 全 component_
  - _Depends: 6.2, 5.1_
  - _Requirements: 3.10, 6.4_
