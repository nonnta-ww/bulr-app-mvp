# Requirements Document — assessment-pattern-seed

## Project Description (Input)

bulr Stage 1 MVP プロトタイプ（**AI 面接アシスタント型**）における、**問診の素材データ層** を確立する。具体的には：

- **57 個の状況パターン**（D:15 / T:12 / P:8 / S:8 / O:8 / A:6）と、各パターンに紐づく **4 段階質問テンプレ + 真贋シグナル + AI 観点問い** を Drizzle スキーマ (`assessment_pattern`) として定義する
- 既に Markdown で完成している `docs/02-questionnaire-patterns.md`（パターン定義）と `docs/03-probe-logic.md`（4 段階質問テンプレ）を、TypeScript の型安全なシードデータに **手動転記** して `packages/db/src/seeds/patterns/` 配下にカテゴリ別 6 ファイルで配置する
- `pnpm seed:patterns` コマンドで dev branch / production branch に **idempotent upsert** で投入できるシードスクリプトを提供する
- 投入後、6 カテゴリの件数（D=15 / T=12 / P=8 / S=8 / O=8 / A=6）と総数 57 件が DB に存在する

v2 移行後、本 spec の役割は **ほぼ v1 と同じ**：パターン定義のスキーマと内容は変更なし。ただし用途は **「LLM が候補者に直接質問するための素材」** から **「LLM が面接官に提案する質問候補の素材」** に変わる。後続の `assessment-engine` spec が `proposeNextQuestions`（3 候補生成）等の LLM 関数で本テーブルを参照し、4 段階質問テンプレを LLM プロンプトに動的注入する。

スキーマ・シード構造自体は v1 から大きく変わらないため、本 spec は v2 用に再生成するが内容は v1 とほぼ同等。本 spec は **データ層の素材** のみを所有し、LLM 関数実装、評価ロジック、面接フロー、UI、パターン編集機能は全て **out of scope**（後続 spec / Stage 2 以降）。

## Requirements

### Requirement 1: assessment_pattern テーブルのスキーマ定義

**Objective:** As a 後続 spec の実装担当者 (`assessment-engine`), I want `assessment_pattern` テーブルの Drizzle スキーマ定義が `packages/db/src/schema/assessment-pattern.ts` に存在すること, so that LLM 関数（`proposeNextQuestions`、`analyzeTurn` 等）が型安全にパターンレコードを取得できる。

#### Acceptance Criteria

1. WHEN 開発者が `packages/db/src/schema/assessment-pattern.ts` を `import` する THEN `@bulr/db` SHALL `assessmentPattern` という名前の Drizzle pgTable オブジェクトを公開する
2. WHEN `assessment_pattern` テーブルがマイグレーションされる THEN テーブル SHALL 以下のカラムを snake_case で持つ：`id` (text, primary key)、`code` (text, unique not null)、`category` (enum not null)、`title` (text not null)、`description` (text not null)、`expected_scope_min` (integer not null)、`expected_scope_max` (integer not null)、`level_1_intro` (text not null)、`level_2_focus` (text not null)、`level_3_focus` (text not null)、`level_4_focus` (text not null)、`signals` (text[] not null)、`ai_perspective` (text not null)、`is_active` (boolean not null default true)、`created_at` (timestamp not null default now)、`updated_at` (timestamp not null default now)
3. WHEN `category` カラムに値が代入される THEN DB SHALL `'design' | 'trouble' | 'performance' | 'security' | 'organization' | 'ai'` のいずれか（フル文字列）のみを許容する
4. WHEN `code` カラムに値が代入される THEN シードレベルで `^[DTPSOA]-\d{2}$` の正規表現に一致する文字列のみが投入される（DB CHECK 制約は任意、TypeScript 型レベルで保証）
5. WHEN `expected_scope_min` および `expected_scope_max` に値が代入される THEN 値 SHALL `1 <= min <= max <= 5` の範囲整数（評価ルーブリック準拠：1=タスク〜5=組織）
6. WHEN テーブルがマイグレーションされる THEN `code` カラム SHALL UNIQUE インデックスを持ち、upsert の conflict target として利用可能である
7. IF パターンが論理的に廃止される THEN `is_active` カラム SHALL `false` にセットされ、レコード自体は物理削除されない（採番不変原則の保証）

### Requirement 2: マイグレーションファイルの生成と適用

**Objective:** As a 開発者, I want `assessment_pattern` テーブルのマイグレーション SQL ファイルが drizzle-kit によって生成され、dev branch / production branch に適用できる, so that DB 上に物理的にテーブルが存在し、シード投入が可能になる。

#### Acceptance Criteria

1. WHEN 開発者が `pnpm --filter @bulr/db generate` を実行する THEN drizzle-kit SHALL `packages/db/drizzle/*_assessment_patterns.sql` の glob パターンに一致するマイグレーションファイルを生成する（連番は drizzle-kit が決定、ハードコードしない）
2. WHEN マイグレーションが dev branch に適用される THEN `pnpm --filter @bulr/db push` SHALL エラーなく完了し、`assessment_pattern` テーブルが DB に作成される
3. WHEN マイグレーションが production branch に適用される THEN `pnpm --filter @bulr/db migrate` SHALL 履歴管理付きで適用され、`drizzle.__drizzle_migrations` に記録される
4. IF マイグレーションファイルが既に存在する状態で再度 `generate` が実行される AND スキーマ差分がない THEN drizzle-kit SHALL 新規ファイルを生成しない
5. WHEN マイグレーションファイル名が `docs/setup/seed.md` 等のドキュメントから参照される THEN ドキュメント SHALL 番号をハードコードせず `*_assessment_patterns.sql` の glob 表現で記載する

### Requirement 3: TypeScript シードデータ型定義

**Objective:** As a 開発者, I want シードデータ用の TypeScript 型定義（`AssessmentPatternSeed` / `PatternCategory`）が `packages/db/src/seeds/types.ts` に存在すること, so that 6 カテゴリのシードファイルが型安全に記述でき、編集ミス（カラム漏れ・型不一致）を TypeScript コンパイラで検出できる。

#### Acceptance Criteria

1. WHEN 開発者が `packages/db/src/seeds/types.ts` を `import` する THEN ファイル SHALL `PatternCategory` 型（`'design' | 'trouble' | 'performance' | 'security' | 'organization' | 'ai'` のユニオン）を公開する
2. WHEN 開発者が `packages/db/src/seeds/types.ts` を `import` する THEN ファイル SHALL `AssessmentPatternSeed` 型を公開し、Requirement 1.2 の全カラム（`id` / `created_at` / `updated_at` を除く）を必須プロパティとして持つ
3. WHEN シードオブジェクトに `code` を記述する THEN TypeScript 型 SHALL template literal types または regex-validated string で `^[DTPSOA]-\d{2}$` を強制（実装難易度に応じて、最低でも `string` で受けて runtime で検証）
4. WHEN シードオブジェクトに `signals` を記述する THEN プロパティ SHALL `readonly string[]`（または `string[]`）で複数の真贋シグナルを保持できる
5. WHEN シードオブジェクトに `expected_scope_min` / `expected_scope_max` を記述する THEN プロパティ SHALL `1 | 2 | 3 | 4 | 5` のリテラル型で 1-5 のみを許容する

### Requirement 4: カテゴリ別 6 ファイルへの 57 パターンの分割配置

**Objective:** As a 開発者, I want 57 個のパターン定義が `packages/db/src/seeds/patterns/` 配下にカテゴリ別 6 ファイルで分割配置されること, so that PR レビューがファイル単位で実施でき、Markdown ドキュメントとの差分検証が容易になる。

#### Acceptance Criteria

1. WHEN シードファイル群がリポジトリに存在する THEN 以下 6 ファイル SHALL 全て存在する：`packages/db/src/seeds/patterns/design.ts`、`trouble.ts`、`performance.ts`、`security.ts`、`organization.ts`、`ai.ts`
2. WHEN `design.ts` が読み込まれる THEN ファイル SHALL `D-01` から `D-15` の 15 個の `AssessmentPatternSeed` オブジェクトを `readonly` 配列として default export または named export する
3. WHEN `trouble.ts` が読み込まれる THEN ファイル SHALL `T-01` から `T-12` の 12 個のオブジェクトを export する
4. WHEN `performance.ts` が読み込まれる THEN ファイル SHALL `P-01` から `P-08` の 8 個のオブジェクトを export する
5. WHEN `security.ts` が読み込まれる THEN ファイル SHALL `S-01` から `S-08` の 8 個のオブジェクトを export する
6. WHEN `organization.ts` が読み込まれる THEN ファイル SHALL `O-01` から `O-08` の 8 個のオブジェクトを export する
7. WHEN `ai.ts` が読み込まれる THEN ファイル SHALL `A-01` から `A-06` の 6 個のオブジェクトを export する
8. WHEN `packages/db/src/seeds/assessment-patterns.ts`（集約 index）が読み込まれる THEN ファイル SHALL 6 ファイルを `import` し、57 件すべてを連結した単一配列を export する
9. WHEN 各シードオブジェクトが定義される THEN `category` プロパティ SHALL ファイル名と一致するカテゴリ文字列となる（`design.ts` → `'design'` 等）
10. WHEN 各シードオブジェクトが定義される THEN `code` プロパティ SHALL ファイル内で重複せず、カテゴリプレフィックス（D/T/P/S/O/A）と一致する

### Requirement 5: Markdown ドキュメントからの内容転記の正確性

**Objective:** As a 創業者（評価設計担当）, I want シードデータの内容が `docs/02-questionnaire-patterns.md` および `docs/03-probe-logic.md` の記述と一致すること, so that 問診設計の真実が一箇所（Markdown）に集約され、TypeScript シードはその転記物として扱える。

#### Acceptance Criteria

1. WHEN シードオブジェクトの `title` / `description` が記述される THEN 内容 SHALL `docs/02-questionnaire-patterns.md` の対応パターンの「状況」記述から転記される
2. WHEN シードオブジェクトの `expected_scope_min` / `expected_scope_max` が記述される THEN 値 SHALL `docs/02-questionnaire-patterns.md` の対応パターンの「射程」記述から導出される（例：「機能〜プロダクト」→ min=2, max=3）
3. WHEN シードオブジェクトの `level_1_intro` / `level_2_focus` / `level_3_focus` / `level_4_focus` が記述される THEN 内容 SHALL `docs/03-probe-logic.md` の対応パターンの 4 段階質問テンプレから転記される
4. WHEN シードオブジェクトの `signals` が記述される THEN 内容 SHALL `docs/03-probe-logic.md` の対応パターンの「真贋シグナル」記述から配列として転記される
5. WHEN シードオブジェクトの `ai_perspective` が記述される THEN 内容 SHALL `docs/03-probe-logic.md` の対応パターンの「AI 観点問い」記述から転記される
6. IF 将来 Markdown と TypeScript シードの間で差分が発生する THEN ドキュメント側 SHALL 真実とみなされ、TypeScript シードは差分を解消するように更新される（ドキュメント正の運用）

### Requirement 6: 冪等な upsert シードスクリプト

**Objective:** As a 開発者 / 創業者, I want `scripts/seed-assessment-patterns.ts` が再実行可能（idempotent）なシードスクリプトであること, so that 開発中の繰り返し投入で既存レコードが破壊されず、`is_active` の手動操作が保護される。

#### Acceptance Criteria

1. WHEN 開発者が `pnpm seed:patterns` を実行する THEN スクリプト SHALL `tsx scripts/seed-assessment-patterns.ts` 等で実行され、`DATABASE_URL` 環境変数を参照する
2. WHEN スクリプトが実行される THEN スクリプト SHALL `db.transaction` でラップされた `INSERT ... ON CONFLICT (code) DO UPDATE`（Drizzle の `onConflictDoUpdate({ target: code, set: ... })`）を 57 件分まとめて実行する
3. WHEN upsert の SET 句が構築される THEN SET 句 SHALL `is_active` を含まない（手動 deactivate を保護）
4. WHEN upsert の SET 句が構築される THEN SET 句 SHALL `updated_at` に `new Date()` または `sql\`now()\`` を含む
5. WHEN スクリプトが同じデータで 2 回連続実行される THEN 2 回目の実行 SHALL エラーなく完了し、`assessment_pattern` のレコード数 SHALL 57 のまま変わらない
6. WHEN スクリプトが完了する THEN スクリプト SHALL カテゴリ別件数（D / T / P / S / O / A）と総数を `console.log` 出力する
7. IF カテゴリ別件数が `D=15 / T=12 / P=8 / S=8 / O=8 / A=6` の期待値と一致しない THEN スクリプト SHALL 警告を `console.error` または `console.warn` で出力する（exit code は任意、開発者が気付ける形式であること）
8. WHEN スクリプトが本番 DB に対して実行される THEN 実行は **明示的なコマンド**（環境変数で `DATABASE_URL` を本番ブランチに切り替え + `pnpm seed:patterns`）を要求する（自動実行されない）

### Requirement 7: pnpm scripts への登録

**Objective:** As a 開発者, I want ルート `package.json` の scripts に `seed:patterns` コマンドが登録されていること, so that 統一されたコマンド体系（`pnpm <task>`）でシード投入を実行できる。

#### Acceptance Criteria

1. WHEN 開発者が `pnpm seed:patterns` を実行する THEN ルート `package.json` の `scripts.seed:patterns` SHALL `tsx scripts/seed-assessment-patterns.ts` 等の有効なコマンドを実行する
2. WHEN `package.json` の scripts に `seed:patterns` が追加される THEN 既存の `dev` / `build` / `typecheck` / `lint` / `drizzle-kit generate` 等の scripts SHALL 影響を受けない
3. WHEN スクリプト実行時に `tsx` が要求される THEN `tsx` SHALL ルートまたは `packages/db` の devDependencies に存在する（`monorepo-foundation` で既に `packages/db` に追加済み）

### Requirement 8: ドキュメンテーション（投入手順）

**Objective:** As a 後続 spec 実装担当者 / 新規参画者, I want dev branch / production branch への投入手順がドキュメント化されていること, so that 環境セットアップ時に迷わず手順を辿れる。

#### Acceptance Criteria

1. WHEN 新規参画者がリポジトリを clone する THEN README または `docs/setup/seed.md` SHALL `pnpm seed:patterns` の実行手順を記載する
2. WHEN ドキュメントが dev branch / production branch への投入手順を記載する THEN `DATABASE_URL` の切り替え方法（`.env.local` 編集または環境変数の export）SHALL 明示される
3. WHEN ドキュメントがマイグレーション適用手順を記載する THEN マイグレーションファイル名 SHALL `*_assessment_patterns.sql` の glob 表現で参照され、連番がハードコードされない
4. WHEN ドキュメントが投入後の検証手順を記載する THEN 検証 SHALL 「`SELECT COUNT(*) FROM assessment_pattern;` が 57 を返す」「`SELECT category, COUNT(*) FROM assessment_pattern GROUP BY category;` が D=15 / T=12 / P=8 / S=8 / O=8 / A=6 を返す」の手順を含む

### Requirement 9: 検証可能性（投入後の自動カウントログ）

**Objective:** As a 開発者, I want シード投入直後にカテゴリ別件数と総数がログ出力されること, so that 投入の成功を目視で確認でき、転記漏れ・重複を早期に発見できる。

#### Acceptance Criteria

1. WHEN シードスクリプトが完了する THEN スクリプト SHALL `console.log` で `assessment_pattern: total = 57` 形式の総件数行を出力する
2. WHEN シードスクリプトが完了する THEN スクリプト SHALL `console.log` で `category: design = 15, trouble = 12, performance = 8, security = 8, organization = 8, ai = 6` 形式のカテゴリ別件数行を出力する
3. IF 投入直後の DB クエリで総数が 57 でない THEN スクリプト SHALL `console.error` で警告を出力する（プロセスは正常終了してよい、開発者が気付ける形式であること）
4. IF 投入直後のカテゴリ別件数が期待値と異なる THEN スクリプト SHALL 期待値と実測値の両方をログに出力する

## 補足: スコープと境界

### このリクワイアメントが含むもの (In Scope)

- `packages/db/src/schema/assessment-pattern.ts`：Drizzle スキーマ定義
- `packages/db/drizzle/*_assessment_patterns.sql`：マイグレーションファイル（drizzle-kit 生成）
- `packages/db/src/seeds/types.ts`：`AssessmentPatternSeed` / `PatternCategory` 型定義
- `packages/db/src/seeds/patterns/{design,trouble,performance,security,organization,ai}.ts`：6 カテゴリ × 57 件のシードオブジェクト
- `packages/db/src/seeds/assessment-patterns.ts`：6 ファイルを集約する index
- `scripts/seed-assessment-patterns.ts`：idempotent upsert シードスクリプト
- `package.json` の `scripts.seed:patterns` 追加
- 投入手順ドキュメント（README または `docs/setup/seed.md`）

### このリクワイアメントが含まないもの (Out of Scope)

- 受験セッション・回答・評価関連テーブル（`candidate` / `interview_session` / `interview_turn` / `pattern_coverage` / `session_report`）→ `assessment-engine` spec
- LLM 関数（`proposeNextQuestions` / `analyzeTurn` / `aggregatePatternCoverage` / `splitInterviewerCandidate` / `generateSessionReport`）→ `assessment-engine` spec
- 評価スコアリング（5 次元 × 0-3 / 1-5、`level_reached`、`stuck_type`）→ `assessment-engine` spec
- パターン編集 UI（管理画面でのパターン CRUD）→ Stage 2 以降
- パターン使用統計・ヒートマップ集計 → Stage 2 以降
- フリー質問（`pattern_id=null`）からの新パターン昇格 UI → Stage 2 以降
- 多言語対応（英語、ベトナム語）→ Stage 2 以降（Stage 1 は日本語のみ）
- Better Auth 関連テーブル（`user` / `user_profile` / `session` / `account` / `verification`）→ `authentication` spec
- 環境変数定義・Vercel 環境セットアップ → `multi-env-infrastructure` spec

### 隣接 spec との依存関係

- **Upstream (依存先)**:
  - `monorepo-foundation`：`packages/db` のスケルトン、Drizzle 初期化（`drizzle.config.ts`、`src/client.ts`、空 `src/schema/index.ts`）、`scripts/` ディレクトリ存在
  - `multi-env-infrastructure`：dev / production Neon ブランチ、`DATABASE_URL` 環境変数
- **Downstream (依存元)**:
  - `assessment-engine`：本 spec の `assessment_pattern` テーブルを LLM 関数で読み取り、4 段階質問テンプレを LLM プロンプトに動的注入。`is_active=true` のレコードのみを対象とする
