# Requirements Document

## Introduction

bulr Stage 1 MVP プロトタイプ（AI 面接アシスタント型）を構築するための、最初のスペック。現在リポジトリは bootstrap commit + `docs/` + `.kiro/` のみで、`package.json` も `apps/` も `packages/` も存在しない。後続の 5 spec（`multi-env-infrastructure`、`authentication`、`assessment-pattern-seed`、`assessment-engine`、`admin-review-panel`）はすべてこの基盤に依存するため、ここで「pnpm install → pnpm dev で apps/web (port 3000) が起動し、pnpm typecheck / pnpm lint がエラーなく通る」最小モノレポを確立する。

本スペックの責務は **モノレポ初期化のスケルトン作成のみ** である。Drizzle スキーマ実体、LLM 関数実装、Whisper / Vercel Blob 実装、認証実装、UI 実装、CI/CD、環境変数定義、Vercel デプロイ設定は **すべて後続 spec の責務** であり、本スペックでは扱わない。`packages/ai` には Vercel AI SDK 6 / Anthropic SDK / OpenAI SDK / Zod の依存を追加するが、関数実装は assessment-engine spec で行う。`packages/types/package.json` には `./profile` および `./evaluation` のサブパス export を予約するが、実体ファイルは assessment-engine spec で追加する。

## Boundary Context

- **In scope**: ルート設定ファイル一式（`package.json` / `pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` / `.gitignore` / `eslint.config.mjs` / `prettier.config.mjs` / `.npmrc`）、`apps/web` の Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui ベースのスケルトン、`packages/{db, types, lib, ai}` の 4 パッケージのスケルトン（package.json + tsconfig.json + src バレル）、`@bulr/*` workspace エイリアスでのパッケージ間参照、`pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint` の開発コマンド整備、`drizzle.config.ts` と空 schema ディレクトリ、`packages/types/package.json` の exports map にサブパス export 予約、`packages/ai/package.json` への AI/Whisper SDK 依存追加。

- **Out of scope**:
  - 認証実装（Better Auth 設定、Magic Link、proxy.ts）→ `authentication` spec
  - DB テーブル実体定義（candidate / interview_session / question_proposal / interview_turn / pattern_coverage / session_report / assessment_pattern / user_profile / rate_limit）→ 後続 spec
  - LLM 関数実装、システムプロンプト、Whisper クライアント実装 → `assessment-engine` spec
  - Vercel プロジェクト作成、Neon 接続、Resend / Vercel Blob 統合 → `multi-env-infrastructure` spec
  - 環境変数定義、`.env.example` → `multi-env-infrastructure` spec
  - 管理画面 UI、面接官 UI（状態 A/B、新規セッション作成、面接後レポート）→ 後続 spec
  - Vercel Cron 設定、CI/CD（GitHub Actions）→ `multi-env-infrastructure` spec
  - テストフレームワーク（Vitest / Playwright 等）のセットアップ → 必要になった spec で導入
  - Drizzle migration の dev/prod への push → 後続 spec で必要なタイミングで

- **Adjacent expectations**:
  - 後続 5 spec は本スペックが整えた `apps/web` および `packages/{db, types, lib, ai}` の上に追加実装する。本スペックはディレクトリ構造・ビルド契約・パッケージ依存方向（`apps/web → packages/{db, types, lib, ai}` / `packages/ai → packages/{db, types, lib}` / `packages/db → packages/types` / `packages/lib → packages/types` / `packages/types → なし`）を確立する。
  - `packages/types` は Zod 等の runtime 依存を持たない（純粋な TypeScript 型のみ）。Zod 利用は `apps/web/lib/` または `packages/lib` に限定。
  - `assessment-engine` spec は `packages/ai/src/functions/`、`packages/ai/src/prompts/`、`packages/ai/src/whisper/` ディレクトリへ実装を追加する想定。本スペックではこれらディレクトリの予約のみ行う。

## Requirements

### Requirement 1: モノレポ ルート設定の確立

**Objective:** As a プロトタイプ開発を担当する開発者, I want pnpm workspaces + Turborepo によるモノレポのルート設定が一式揃った状態, so that 後続 spec の実装者が apps/packages を追加する際にビルド・型チェック・lint の枠組みを再構築せずに済む。

#### Acceptance Criteria

1. The モノレポ ルート shall ルート直下に `package.json`、`pnpm-workspace.yaml`、`turbo.json`、`tsconfig.base.json`、`.gitignore`、`eslint.config.mjs`、`prettier.config.mjs`、`.npmrc` を含む。
2. The `package.json` shall `apps/*` および `packages/*` を pnpm workspaces のメンバーとして宣言する。
3. The `package.json` shall Node.js 22 LTS 以上、pnpm 10 以上を `engines` で要求する。
4. The `tsconfig.base.json` shall TypeScript strict mode、`noUncheckedIndexedAccess: true`、`module: ESNext`、`moduleResolution: bundler`、`target: ES2022` を設定する。
5. The Prettier 設定 shall `singleQuote: true`、`semi: true`、`trailingComma: "all"`、`printWidth: 100`、`tabWidth: 2` を採用する。
6. When 開発者がルートで `pnpm install` を実行した場合、the モノレポ shall 全 workspace パッケージの依存解決を完了し、エラーを返さない。
7. The `.gitignore` shall `node_modules`、`.next`、`.turbo`、`dist`、`.vercel`、`coverage`、`.env*.local` を除外対象に含める。
8. The `.npmrc` shall pnpm の strict-peer-dependencies およびワークスペース解決方針を明示し、本プロジェクトのインストール時の警告を抑制する設定を含む。

### Requirement 2: apps/web スケルトンの構築

**Objective:** As a 後続 spec の実装者, I want apps/web に Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui ベースの空アプリが起動可能な状態で存在すること, so that 認証・面接 UI・管理画面・API Routes を追加する際にフレームワーク初期化作業を行わずに済む。

#### Acceptance Criteria

1. The apps/web ディレクトリ shall `package.json`、`tsconfig.json`、`next.config.ts`、`postcss.config.mjs`、`tailwind.config.ts` を含む。
2. The apps/web shall `app/page.tsx`（空のランディングページ）と `app/layout.tsx`（ルートレイアウト）を含む App Router 構成を採用する。
3. The apps/web shall Next.js 16（App Router、Turbopack stable、React Compiler 有効）と React 19 を使用する。
4. The apps/web shall Tailwind CSS 4 を有効化し、`app/globals.css` で `@import "tailwindcss";` を読み込む。
5. The apps/web shall TypeScript strict mode を `tsconfig.base.json` から継承する。
6. When 開発者がルートで `pnpm dev` を実行した場合、the apps/web shall ポート 3000 で起動し、ランディングページが HTTP 200 で応答する。
7. When 開発者がルートで `pnpm build` を実行した場合、the apps/web shall ビルドエラーなく `.next` 配下に成果物を生成する。
8. The apps/web shall `@bulr/db`、`@bulr/types`、`@bulr/lib`、`@bulr/ai` を `dependencies` に `workspace:*` として宣言する。
9. The apps/web shall `components/` および `lib/` ディレクトリを予約する（空でも可、本スペックでは中身は実装しない）。

### Requirement 3: packages/db スケルトンと Drizzle 初期化

**Objective:** As a 後続 spec（assessment-pattern-seed / authentication / assessment-engine）の実装者, I want packages/db に Drizzle ORM のクライアント初期化と空 schema のスケルトンが存在すること, so that テーブル定義を追加するだけで他パッケージから `@bulr/db` 経由で参照できる。

#### Acceptance Criteria

1. The packages/db shall `package.json`、`tsconfig.json`、`drizzle.config.ts`、`src/index.ts`、`src/client.ts`、`src/schema/index.ts`、`src/queries/index.ts` を含む。
2. The packages/db shall `drizzle-orm` と `drizzle-kit` を依存に持ち、Postgres 用ドライバ（`pg` または `@neondatabase/serverless` のどちらか）を選択して宣言する。
3. The `drizzle.config.ts` shall schema のソースディレクトリと migration 出力先を指定する（migration 実体投入は後続 spec）。
4. The `src/schema/index.ts` shall 空のバレルエクスポート（コメントのみ可）として後続 spec のスキーマ追加を待つ。
5. The `src/index.ts` shall `db` クライアントと schema バレルを再エクスポートし、他パッケージから `import { db } from '@bulr/db'` で参照可能にする。
6. The packages/db shall `package.json` の `peerDependencies` または `dependencies` に `@bulr/types` を `workspace:*` として宣言する。
7. When 開発者がルートで `pnpm typecheck` を実行した場合、the packages/db shall 型エラーなく完了する。
8. When 開発者がルートで `pnpm drizzle-kit generate` を `packages/db` で実行できるよう、the packages/db shall `package.json` の `scripts` に `generate` / `push` / `migrate` を含める。

### Requirement 4: packages/types スケルトンとサブパス export 予約

**Objective:** As a assessment-engine spec の実装者, I want packages/types に `@bulr/types/profile` および `@bulr/types/evaluation` のサブパス export が予約された状態で存在すること, so that 実体ファイルを追加するだけで apps/web から `import type { LlmEvaluation } from '@bulr/types/evaluation'` のような import が動作する。

#### Acceptance Criteria

1. The packages/types shall `package.json`、`tsconfig.json`、`src/index.ts` を含む。
2. The packages/types `package.json` の `exports` map shall `"."`、`"./profile"`、`"./evaluation"` の 3 つのサブパス export を宣言する。
3. The packages/types shall `dependencies` および `devDependencies` に Zod を含まず、runtime 依存ゼロを維持する（純粋な TypeScript 型のみ）。
4. The `src/profile.ts` および `src/evaluation.ts` shall 空ファイルまたはコメントのみのスケルトンとして存在し、本スペックでは型実体を含まない（後続 spec で追加）。
5. The packages/types shall `tsconfig.json` で `tsconfig.base.json` を extends し、追加の compilerOptions は最小限とする。
6. When 開発者がルートで `pnpm typecheck` を実行した場合、the packages/types shall 型エラーなく完了する。
7. When 他のパッケージが `import type { Foo } from '@bulr/types/profile'` を記述した場合、the workspace 解決 shall サブパス export を解決し、TypeScript の型解決が成功する（実体型は空でも import 文自体は解決可能）。

### Requirement 5: packages/lib および packages/ai スケルトン

**Objective:** As a 後続 spec の実装者, I want packages/lib（共通ユーティリティ）と packages/ai（LLM 関数 + Whisper クライアント + プロンプト）がスケルトンとして存在し、AI 関連 SDK の依存が宣言済みであること, so that LLM 関数や共通ユーティリティを追加する際にパッケージ初期化と依存追加作業を行わずに済む。

#### Acceptance Criteria

1. The packages/lib shall `package.json`、`tsconfig.json`、`src/index.ts` を含む。
2. The packages/lib shall `dependencies` に `@bulr/types` を `workspace:*` として宣言し、Zod を `dependencies` として含めることが許される（runtime 依存を許容するレイヤ）。
3. The packages/ai shall `package.json`、`tsconfig.json`、`src/index.ts`、`src/functions/` ディレクトリ、`src/prompts/` ディレクトリ、`src/whisper/` ディレクトリ、`src/client.ts` を含む。
4. The packages/ai `package.json` の `dependencies` shall `ai`（Vercel AI SDK 6 系）、`@ai-sdk/anthropic`、`openai`、`zod` を含み、`@bulr/db` / `@bulr/types` / `@bulr/lib` を `workspace:*` で参照する。
5. The packages/ai の `src/functions/`、`src/prompts/`、`src/whisper/` ディレクトリ shall 各々 `.gitkeep` または空のバレル `index.ts` で存在し、ディレクトリそのものが git に登録される。
6. The packages/ai の `src/index.ts` shall 後続 spec が `analyzeTurn` / `transcribeAudio` 等を追加した際に再エクスポートできるよう、空バレル（コメントのみ）として存在する。
7. The packages/ai shall LLM 関数の実装、システムプロンプト、Whisper ラッパーを **本スペックでは含まない**（依存追加とディレクトリ予約のみ）。
8. When 開発者がルートで `pnpm typecheck` を実行した場合、the packages/lib および packages/ai shall 型エラーなく完了する。

### Requirement 6: パッケージ間依存方向と workspace エイリアス

**Objective:** As a プロジェクト全体の保守者, I want パッケージ間の依存方向が `structure.md` に記載された規則どおり強制され、循環参照や意図しない逆方向参照が起きないこと, so that Stage 2 への構造変化（packages/auth / ui / i18n の切り出し）時にも依存関係が壊れない。

#### Acceptance Criteria

1. The モノレポ shall パッケージ間参照を `@bulr/db` / `@bulr/types` / `@bulr/lib` / `@bulr/ai` の 4 エイリアスで行う。
2. The 各パッケージ `package.json` shall 依存方向を `apps/web → packages/{db, types, lib, ai}` / `packages/ai → packages/{db, types, lib}` / `packages/db → packages/types` / `packages/lib → packages/types` / `packages/types → なし` の規則に従って宣言する。
3. If あるパッケージが上記規則に違反する依存（例: `packages/types` が `packages/db` を参照）を含む場合、the レビュー過程 shall 違反として検出される（本スペックでは構造的に違反が起きないよう `package.json` の `dependencies` で物理的に防ぐ）。
4. The packages/types shall 他のいかなる workspace パッケージも依存に含めない。
5. When 開発者が apps/web 内で `import { db } from '@bulr/db'` を記述した場合、the TypeScript shall 型解決を成功させる。
6. When 開発者が apps/web 内で `import { someLlmFn } from '@bulr/ai'`（後続 spec で追加予定の関数）を本スペック時点で書いた場合、the スケルトン shall 該当 export がないため型エラーを返すが、import path 自体（`@bulr/ai`）は解決される。

### Requirement 7: 開発コマンドと turbo パイプライン

**Objective:** As a 開発者および後続 spec の CI セットアップ担当, I want ルートから `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint` を実行すれば全パッケージに対して並列実行できること, so that 個別パッケージへ `cd` する手間を省き、CI 設定も単純化できる。

#### Acceptance Criteria

1. The ルート `package.json` shall `dev`、`build`、`typecheck`、`lint` の 4 つのスクリプトを `turbo run <task>` 形式で定義する。
2. The `turbo.json` shall `build`、`dev`、`typecheck`、`lint` の 4 タスクを定義し、`build` と `typecheck` は `dependsOn: ["^build"]` または `dependsOn: ["^typecheck"]` で依存パッケージを先に処理する。
3. The `turbo.json` shall `dev` タスクを `cache: false`、`persistent: true` で定義する。
4. When 開発者がルートで `pnpm typecheck` を実行した場合、the Turborepo shall apps/web および packages/{db, types, lib, ai} すべてで `tsc --noEmit` を実行し、エラーなく完了する。
5. When 開発者がルートで `pnpm lint` を実行した場合、the ESLint shall apps/web および packages/{db, types, lib, ai} すべてに対して実行され、エラーなく完了する。
6. The 各 workspace パッケージ `package.json` shall `scripts.typecheck` を `tsc --noEmit` で定義する。
7. The 各 workspace パッケージ `package.json` shall `scripts.lint` を ESLint 実行コマンドで定義する（ルート ESLint 設定を継承）。

### Requirement 8: ESLint および Prettier 統一設定

**Objective:** As a 開発者, I want ルートに統一された ESLint および Prettier 設定が存在し、全 workspace パッケージで同じコードスタイルが強制されること, so that PR レビューでスタイル議論を避け、本質的なロジック議論に集中できる。

#### Acceptance Criteria

1. The モノレポ shall ルート直下に `eslint.config.mjs`（Flat Config 形式）と `prettier.config.mjs` を含む。
2. The ESLint 設定 shall TypeScript ESLint の推奨ルールを採用し、`@typescript-eslint/no-explicit-any` を `warn` 以上に設定する。
3. The ESLint 設定 shall `node_modules`、`.next`、`.turbo`、`dist`、`.vercel`、`coverage` を `ignores` に含める。
4. The Prettier 設定 shall `singleQuote: true`、`semi: true`、`trailingComma: "all"`、`printWidth: 100`、`tabWidth: 2`、`endOfLine: "lf"` を設定する。
5. When 開発者がコードを保存・整形した場合、the Prettier shall 上記設定どおりに整形する。
6. The 各 workspace パッケージ shall ルートの `eslint.config.mjs` を継承し、必要な場合のみ追加の上書き設定を行う（本スペックでは追加上書きを設けない）。
