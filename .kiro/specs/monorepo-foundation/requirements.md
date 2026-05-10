# Requirements Document

## Introduction

bulr Stage 1 MVP プロトタイプの全実装は、Turborepo + pnpm workspaces + Next.js 16 + Drizzle ORM + 共通パッケージ群を前提とする (`tech.md`, `structure.md`)。しかし現状リポジトリは Initial commit のみで、`package.json` も `apps/` も `packages/` も存在しない。後続の 5 spec（`multi-env-infrastructure` / `authentication` / `assessment-pattern-seed` / `assessment-engine` / `admin-review-panel`）すべてがこの基盤に依存するため、最初に確立する。

本スペックは「ビルド・型チェック・lint が通る + 空のページが表示される」ことをゴールとする最小モノレポの初期化である。機能実装（認証、DB スキーマ、UI、LLM ツール）は一切行わず、後続 spec が安全に乗れる骨組みのみを提供する。リファレンスプロジェクト `dishxdish-app-mvp` の構成を踏襲しつつ、Stage 1 に必要な 4 パッケージ（`db` / `types` / `lib` / `ai`）に削減する。

## Boundary Context

- **In scope**:
  - ルート設定ファイル一式（`package.json`、`pnpm-workspace.yaml`、`turbo.json`、`tsconfig.base.json`、`.gitignore`、`eslint.config.mjs`、`prettier.config.mjs`、`.npmrc`）
  - `apps/web` の Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui ベース初期化（空のランディングページ）
  - `packages/{db, types, lib, ai}` の 4 パッケージスケルトン
  - Drizzle ORM の初期設定（`drizzle.config.ts`、空スキーマディレクトリ、Drizzle client export）
  - workspace 内パッケージ参照エイリアス（`@bulr/db` / `@bulr/types` / `@bulr/lib` / `@bulr/ai`）
  - 開発コマンド（`pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm drizzle-kit generate` / `pnpm drizzle-kit push`）
- **Out of scope**:
  - 認証実装（Better Auth、Magic Link、proxy.ts、guards）→ `authentication` spec
  - DB テーブル定義（`user_profile` / `assessment_session` / `assessment_answer` / `assessment_pattern` / `chat_message`）→ `assessment-pattern-seed` および `assessment-engine` spec
  - LLM ツール実装、システムプロンプト、状態機械 → `assessment-engine` spec
  - UI コンポーネントの本実装、shadcn/ui 個別コンポーネント追加 → 後続 spec で必要に応じて
  - Vercel デプロイ設定、Vercel プロジェクト作成、Neon 接続、Resend 統合 → `multi-env-infrastructure` spec
  - 環境変数定義、`.env.example` の整備 → `multi-env-infrastructure` spec
  - CI/CD ワークフロー → `multi-env-infrastructure` spec
  - テストフレームワーク（Vitest / Playwright）のセットアップ → 必要になった spec で導入
  - `packages/{auth, ui, i18n}` の切り出し → Stage 2（apps/admin 分離時）
- **Adjacent expectations**:
  - 後続 spec は本スペックで定義した workspace エイリアス（`@bulr/*`）と依存方向（`apps/web → packages/{db, types, lib, ai}` / `packages/ai → packages/{db, types, lib}` / `packages/db → packages/types` / `packages/lib → packages/types`）を遵守する
  - 後続 spec は本スペックで提供される `pnpm typecheck` / `pnpm lint` がエラーなく通る状態を維持する
  - 環境変数は本スペックでは定義しないが、`drizzle.config.ts` などが将来読み取る `DATABASE_URL` の存在を `multi-env-infrastructure` spec が満たす

## Requirements

### Requirement 1: ルートワークスペース設定

**Objective:** リポジトリ管理者として、Turborepo + pnpm workspaces による一貫したモノレポ構成を導入したい。それにより、後続 spec が apps と packages を共通のビルド/型チェック/lint パイプラインで扱えるようにする。

#### Acceptance Criteria

1. The Monorepo Foundation shall provide a root `package.json` that declares `private: true`、`packageManager: "pnpm@10+"`、Node.js 22 LTS 以上の `engines` 制約、および `dev` / `build` / `typecheck` / `lint` スクリプトを含む。
2. The Monorepo Foundation shall provide a `pnpm-workspace.yaml` that registers `apps/*` と `packages/*` を workspace として認識する。
3. The Monorepo Foundation shall provide a `turbo.json` that defines `build` / `dev` / `typecheck` / `lint` タスクを `^build` / `^typecheck` / `^lint` の依存関係付きで宣言し、`dev` を `cache: false, persistent: true` として扱う。
4. The Monorepo Foundation shall provide a `tsconfig.base.json` that enables `strict: true`、`noUncheckedIndexedAccess: true`、`module: "ESNext"`、`moduleResolution: "bundler"`、`target: "ES2022"`、および `isolatedModules: true` を強制する。
5. When 開発者が repository ルートで `pnpm install` を実行する場合、the Monorepo Foundation shall すべての workspace パッケージ依存を解決し、`node_modules` を構築する。
6. The Monorepo Foundation shall provide a `.npmrc` that sets `auto-install-peers=true` and `strict-peer-dependencies=false` to align with pnpm 10 monorepo conventions。

### Requirement 2: コード品質ツール統一設定

**Objective:** 開発者として、ESLint と Prettier の統一設定をリポジトリ全体に適用したい。それにより、複数 spec で並行実装される際にもコードスタイルと型安全性が一貫する。

#### Acceptance Criteria

1. The Monorepo Foundation shall provide a root `eslint.config.mjs` that enables `typescript-eslint` recommended rules、`no-unused-vars` (with `_` prefix exclusion)、および `no-explicit-any` を warn 以上で扱う。
2. The Monorepo Foundation shall provide a root `prettier.config.mjs` that fixes `semi: true`、`singleQuote: true`、`trailingComma: "all"`、`printWidth: 100`、`tabWidth: 2`、`endOfLine: "lf"` を強制する。
3. When 開発者が `pnpm lint` を実行する場合、the Monorepo Foundation shall apps と packages の全 TypeScript ファイルを ESLint で検証し、ルール違反がなければ exit code 0 を返す。
4. The Monorepo Foundation shall ignore `node_modules`、`.next`、`dist`、`.turbo`、`coverage`、`.vercel` を ESLint と git 管理対象から除外する。
5. When 開発者が新規 TypeScript ファイルを追加し `any` 型を使用した場合、the Monorepo Foundation shall ESLint warning を出力する。

### Requirement 3: apps/web (Next.js 16) スケルトン

**Objective:** 受験者向けアプリの開発者として、Next.js 16 App Router + React 19 + Tailwind CSS 4 + shadcn/ui ベースの最小アプリを起動できる状態が欲しい。それにより、後続 spec で認証フロー・チャット UI・管理画面を順次積み上げられる。

#### Acceptance Criteria

1. The Monorepo Foundation shall initialize `apps/web` with Next.js 16 (App Router、Turbopack stable、React Compiler 有効) and React 19。
2. The Monorepo Foundation shall provide an `app/layout.tsx` and `app/page.tsx` that render an empty landing page describing the bulr ベータプロトタイプ。
3. When 開発者が `pnpm dev` を repository ルートで実行する場合、the Monorepo Foundation shall apps/web を `http://localhost:3000` で起動し、ランディングページを表示する。
4. The Monorepo Foundation shall configure Tailwind CSS 4 in `apps/web` so that utility classes are recognized at build time without runtime errors。
5. The Monorepo Foundation shall configure shadcn/ui ベース設定（`components.json` 等）so that future spec が `npx shadcn@latest add` 等のコマンドで個別コンポーネントを追加できる準備を整える（個別コンポーネントの追加は本スペックでは行わない）。
6. The Monorepo Foundation shall provide `apps/web/tsconfig.json` that extends `tsconfig.base.json` and configures `paths` alias `@/*` を `./src/*` または `./*` 配下に解決する。
7. When apps/web のビルドを `pnpm build` で実行する場合、the Monorepo Foundation shall TypeScript エラーを発生させずに本番ビルド成果物を出力する。

### Requirement 4: 共通パッケージ (packages/db, types, lib, ai) のスケルトン

**Objective:** モノレポ開発者として、bulr 固有の 4 つの共通パッケージ（DB / 型 / ユーティリティ / AI）が空スケルトンとして存在し、相互に正しい方向で参照できる状態が欲しい。それにより、`assessment-pattern-seed` / `assessment-engine` 等の後続 spec が安全に DB スキーマや LLM ツールを追加できる。

#### Acceptance Criteria

1. The Monorepo Foundation shall provide `packages/db`、`packages/types`、`packages/lib`、`packages/ai` の 4 ディレクトリ、それぞれが `package.json`、`tsconfig.json`、`src/index.ts` を含む。
2. The Monorepo Foundation shall name the 4 packages as `@bulr/db`、`@bulr/types`、`@bulr/lib`、`@bulr/ai` and shall mark them `private: true` for workspace 内専用。
3. The Monorepo Foundation shall enforce the dependency direction: `apps/web` may depend on all 4 packages、`packages/ai` may depend on `packages/{db, types, lib}`、`packages/db` may depend only on `packages/types`、`packages/lib` may depend only on `packages/types`、and `packages/types` shall depend on no other workspace package。
4. If a package が逆方向の依存（例: `packages/types` が `packages/db` を import）を試みる場合、the Monorepo Foundation shall TypeScript の型解決または ESLint で問題が顕在化する設定を維持する（package.json の dependencies に追加しないことで防御）。
5. The Monorepo Foundation shall ensure that workspace パッケージ参照は `workspace:*` プロトコルで解決される。
6. When 開発者が `apps/web` から `import { db } from '@bulr/db'` を試みる場合、the Monorepo Foundation shall workspace alias で `packages/db/src/index.ts` を解決する。
7. When 開発者が repository ルートで `pnpm typecheck` を実行する場合、the Monorepo Foundation shall apps と全 packages の型チェックをエラーなく完了する。

### Requirement 5: Drizzle ORM 初期化（空スキーマ）

**Objective:** バックエンド開発者として、`packages/db` に Drizzle ORM の最小構成（client export + 空スキーマディレクトリ + drizzle.config.ts）が用意されている状態が欲しい。それにより、後続 spec が DB テーブル定義とマイグレーションを安全に追加できる。

#### Acceptance Criteria

1. The Monorepo Foundation shall provide `packages/db/drizzle.config.ts` that uses `dialect: "postgresql"`、`schema: "./src/schema/index.ts"`、`out: "./drizzle"`、`casing: "snake_case"`。
2. The Monorepo Foundation shall provide `packages/db/src/schema/index.ts` as an empty (no tables) file so that `assessment-pattern-seed` / `assessment-engine` spec が後からテーブルを追加できる。
3. The Monorepo Foundation shall provide `packages/db/src/index.ts` that exports a Drizzle client instance（後続 spec で `DATABASE_URL` が設定されれば動作する）と `DB` 型エイリアス。
4. The Monorepo Foundation shall declare `drizzle-orm` 0.45.x stable と `drizzle-kit` を `packages/db` の依存に含める。
5. When `DATABASE_URL` 環境変数が未設定の状態で `packages/db/src/index.ts` を import する場合、the Monorepo Foundation shall 明示的なエラーメッセージ（`DATABASE_URL is required` 相当）で失敗し、暗黙の挙動を起こさない。
6. When 開発者が `pnpm --filter @bulr/db generate` を実行する場合、the Monorepo Foundation shall drizzle-kit を介してマイグレーションファイル生成を起動できる（空スキーマのため成果物は最小だが、コマンド自体はエラーなく完了する）。
7. The Monorepo Foundation shall NOT define application-level tables (`user_profile` / `assessment_session` / `assessment_answer` / `assessment_pattern` / `chat_message`) in this spec; これらは後続 spec で追加される。

### Requirement 6: AI / 共通ユーティリティパッケージの依存追加

**Objective:** AI 機能開発者として、`packages/ai` に Vercel AI SDK 6 と Anthropic SDK の依存が登録され、`packages/lib` と `packages/types` がスケルトンとして存在する状態が欲しい。それにより、`assessment-engine` spec が Tool 定義を追加するだけで AI 問診ロジックを実装できる。

#### Acceptance Criteria

1. The Monorepo Foundation shall declare `ai` (Vercel AI SDK 6.x)、`@ai-sdk/anthropic`、`@ai-sdk/react`、`zod` を `packages/ai` の依存に含める。
2. The Monorepo Foundation shall provide `packages/ai/src/index.ts` as a minimal export skeleton (例: `export {};` または最小型のみ) that compiles without error。
3. The Monorepo Foundation shall provide `packages/types/src/index.ts` and `packages/lib/src/index.ts` as minimal export skeletons that compile without error。
4. The Monorepo Foundation shall NOT implement LLM tools、システムプロンプト、評価ロジック in this spec; これらは `assessment-engine` spec で追加される。
5. When 開発者が repository ルートで `pnpm typecheck` を実行する場合、the Monorepo Foundation shall `packages/ai`、`packages/lib`、`packages/types` の型チェックをエラーなく完了する。

### Requirement 7: 開発コマンドとビルドパイプライン

**Objective:** 開発者として、リポジトリルートから単一のコマンドで開発サーバー起動・ビルド・型チェック・lint を実行できる状態が欲しい。それにより、開発体験が一貫し、後続 spec の CI 設定（`multi-env-infrastructure`）が安定して呼び出せる。

#### Acceptance Criteria

1. When 開発者が repository ルートで `pnpm dev` を実行する場合、the Monorepo Foundation shall Turbo 経由で apps/web を起動し、`http://localhost:3000` でアクセス可能にする。
2. When 開発者が repository ルートで `pnpm build` を実行する場合、the Monorepo Foundation shall apps/web と全 packages のビルドを依存順（`^build`）に実行し、エラーなく完了する。
3. When 開発者が repository ルートで `pnpm typecheck` を実行する場合、the Monorepo Foundation shall apps/web と全 packages の `tsc --noEmit` を依存順に実行し、エラーなく完了する。
4. When 開発者が repository ルートで `pnpm lint` を実行する場合、the Monorepo Foundation shall apps/web と全 packages の ESLint を実行し、エラーなく完了する。
5. The Monorepo Foundation shall expose `pnpm --filter @bulr/db generate` および `pnpm --filter @bulr/db push` を Drizzle migration 操作として提供する（Stage 1 では空スキーマだが、コマンド自体は機能する）。
6. The Monorepo Foundation shall configure Turbo cache outputs (`.next/**`、`!.next/cache/**`、`dist/**`) so that 再ビルドが効率化される。

### Requirement 8: ファイル命名規則とディレクトリ構造の遵守

**Objective:** 後続 spec の実装者として、`structure.md` で定義された命名規則とディレクトリ規約が初期段階から守られている状態が欲しい。それにより、後から規約を後付けする手戻りを避けられる。

#### Acceptance Criteria

1. The Monorepo Foundation shall use kebab-case for all file names within apps/web and packages (例: `eslint.config.mjs`、`drizzle.config.ts`、`page.tsx`)。
2. The Monorepo Foundation shall structure `apps/web` so that future spec が `app/(assessment)/`、`app/admin/`、`app/api/` ルートグループを追加できる前提のディレクトリ構成を提供する（本スペックでは `app/page.tsx` と `app/layout.tsx` のみ存在）。
3. The Monorepo Foundation shall structure `packages/db/src/schema/` ディレクトリを存在させ、後続 spec がテーブル定義ファイルを kebab-case で追加できる準備を整える。
4. The Monorepo Foundation shall NOT create `packages/auth`、`packages/ui`、`packages/i18n` in this spec（Stage 2 で切り出し予定）。
5. The Monorepo Foundation shall include `docs/`、`scripts/`、`.github/workflows/` の存在を阻害しない（既存の `docs/` を維持し、`scripts/` ディレクトリは本スペックでは作成しない）。

### Requirement 9: ドキュメンテーションの最小整備

**Objective:** リポジトリ参照者として、ルートに最小限の README が存在し、開発コマンドの起動方法とディレクトリ構成の概要が把握できる状態が欲しい。それにより、後続 spec の実装者がオンボーディングコストを下げられる。

#### Acceptance Criteria

1. The Monorepo Foundation shall provide a root `README.md` that describes プロジェクト概要（bulr Stage 1 MVP）、前提（Node.js 22 LTS+、pnpm 10+）、初期セットアップ手順（`pnpm install`）、および主要コマンド一覧（`pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint`）。
2. The Monorepo Foundation shall NOT duplicate steering ドキュメント（`product.md` / `tech.md` / `structure.md` / `security.md` / `roadmap.md`）の内容を README に転記する; README は steering ドキュメントへのポインタのみ示す。
3. The Monorepo Foundation shall preserve existing `docs/` ディレクトリと `.kiro/` ディレクトリを変更せず、新規ファイル追加のみで本スペックの作業を完了する。
