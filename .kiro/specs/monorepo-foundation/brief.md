# Brief: monorepo-foundation

## Problem

bulr Stage 1 の全実装は、モノレポ + Next.js 16 + Drizzle + 共通パッケージ群を前提とする (`tech.md`, `structure.md`)。しかし現状リポジトリは bootstrap commit のみで、`package.json` も `apps/` も `packages/` も存在しない。後続の 5 spec すべてがこの基盤に依存するため、ここを最初に確立する必要がある。

v2 移行に伴い、`packages/ai` の依存に **OpenAI SDK（Whisper API ラッパー用）** を追加する必要がある（v1 の monorepo-foundation には含まれていなかった）。

## Current State

- リポジトリ: bootstrap commit + `docs/` + `.kiro/`（steering 7 ファイル + 6 spec brief）+ `.claude/` のみ
- ルート: `package.json` / `pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` 全て未作成
- `apps/` ディレクトリなし
- `packages/` ディレクトリなし
- 参照プロジェクト `dishxdish-app-mvp` が一部同一スタック（Turborepo + pnpm + Next.js 16）で稼働中。構成・設定ファイルを参考に bulr 用に簡略化して移植可能（ただし dishxdish には Whisper / Vercel Blob はない、bulr 独自）

## Desired Outcome

- ルートに `package.json` / `pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` / `.gitignore` / `eslint.config.mjs` / `prettier.config.mjs` が揃う
- `apps/web` が Next.js 16 + React 19 + Tailwind 4 + shadcn/ui ベースで初期化されている
- `packages/db` / `packages/types` / `packages/lib` / `packages/ai` の 4 パッケージがスケルトンとして存在し、相互参照が可能
- `packages/ai` の package.json に `ai` (Vercel AI SDK 6) / `@ai-sdk/anthropic` / `openai` (OpenAI SDK) / `zod` の依存追加（実装は assessment-engine spec で）
- `pnpm install` → `pnpm dev` で apps/web (port 3000) が起動
- `pnpm typecheck` / `pnpm lint` がエラーなく通る
- Drizzle の設定ファイル（`drizzle.config.ts`）と最小スキーマ（空でも可）が `packages/db` にある
- `packages/types/package.json` の exports map で `./profile` / `./evaluation` 等のサブパス export が宣言されている（実体ファイルは assessment-engine spec で追加）

## Approach

dishxdish の構成を踏襲し、Stage 1 用に packages 数を削減した最小モノレポを構築する。

- **Turborepo + pnpm workspaces** で apps と packages を管理
- **TypeScript strict mode** + ESLint + Prettier をルートに統一設定
- **Drizzle ORM** は packages/db でスキーマ + クエリ関数を管理（このスペックでは空スキーマで OK、後続 spec で投入）
- **Next.js 16 App Router** + React 19 + Tailwind CSS 4 + shadcn/ui を apps/web に
- **Vercel AI SDK 6 + Anthropic SDK + OpenAI SDK** は packages/ai の依存に追加するが、関数実装は assessment-engine spec で行う

このスペックでは「ビルド・型チェック・lint が通る + 空のページが表示される」をゴールとし、機能は実装しない。

## Scope

- **In**:
  - ルート設定: `package.json`、`pnpm-workspace.yaml`、`turbo.json`、`tsconfig.base.json`、`.gitignore`、`eslint.config.mjs`、`prettier.config.mjs`、`.npmrc`
  - `apps/web` 初期化: Next.js 16 + React 19 + TypeScript strict + Tailwind CSS 4 + shadcn/ui ベース、`app/page.tsx`（空のランディング）、`app/layout.tsx`、`tsconfig.json`
  - `packages/db` 初期化: `drizzle.config.ts`、`src/index.ts`（Drizzle client export）、空スキーマ用の `src/schema/` ディレクトリ
  - `packages/types` 初期化: `src/index.ts`、`package.json` に exports map（`.`、`./profile`、`./evaluation` のサブパス予約）
  - `packages/lib` 初期化: 共通ユーティリティの export スケルトン
  - `packages/ai` 初期化: Vercel AI SDK 6 / Anthropic SDK / OpenAI SDK / Zod の依存追加、`src/index.ts` のスケルトン、`src/functions/` / `src/prompts/` / `src/whisper/` ディレクトリ予約
  - 各パッケージの `package.json` + `tsconfig.json`
  - workspace 内パッケージ参照の設定（`@bulr/db`、`@bulr/types`、`@bulr/lib`、`@bulr/ai`）
  - 開発コマンド: `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm drizzle-kit generate` / `pnpm drizzle-kit push`

- **Out**:
  - 認証実装（authentication spec）
  - DB テーブル定義（assessment-pattern-seed および assessment-engine spec）
  - LLM 関数実装（assessment-engine spec）
  - Whisper クライアント実装（assessment-engine spec）
  - UI コンポーネントの実装（後続 spec で必要に応じて）
  - Vercel デプロイ設定（multi-env-infrastructure spec）
  - 環境変数（multi-env-infrastructure spec）
  - CI/CD（multi-env-infrastructure spec）
  - Vercel Cron 設定（multi-env-infrastructure spec）
  - テスト framework のセットアップ（必要になった spec で導入）

## Boundary Candidates

- ルートビルド設定（package.json / turbo.json / tsconfig.base.json）
- apps/web スケルトン（Next.js + Tailwind + shadcn/ui ベース設定）
- packages/db スケルトン（Drizzle 初期化、空スキーマ）
- packages/{types, lib, ai} スケルトン（ai は Vercel AI SDK + Anthropic + OpenAI + Zod 依存追加）
- ESLint + Prettier 統一設定
- パッケージ間参照（`@bulr/*` エイリアス + `@bulr/types/*` サブパス）

## Out of Boundary

- 認証関連（Better Auth 設定、Magic Link、proxy.ts）→ authentication spec
- DB スキーマ実体（candidate / interview_session / question_proposal / interview_turn / pattern_coverage / session_report / assessment_pattern / user_profile / rate_limit）→ 後続 spec
- LLM 関数実装、システムプロンプト、Whisper ラッパー → assessment-engine spec
- Vercel プロジェクト作成、Neon 接続、Resend / Vercel Blob 統合 → multi-env-infrastructure spec
- 環境変数定義、`.env.example` → multi-env-infrastructure spec
- 管理画面 UI → admin-review-panel spec
- 面接官 UI（状態A/B、新規セッション作成、面接後レポート）→ assessment-engine spec
- Drizzle migration の実行（dev/prod への push）→ 後続 spec で必要なタイミングで

## Upstream / Downstream

- **Upstream**: なし（最初の spec、ルート設定からビルドアップ）
- **Downstream**: 後続 5 spec すべて
  - `multi-env-infrastructure` がこの基盤の上に Vercel / Neon / Resend / Vercel Blob / Vercel Cron を載せる
  - `authentication` が apps/web 内に Better Auth を直書きで載せる
  - `assessment-pattern-seed` が packages/db にスキーマと シードを追加する
  - `assessment-engine` が packages/ai に LLM 関数 + Whisper ラッパーを、apps/web に状態A/B UI を載せる
  - `admin-review-panel` が apps/web/admin/ に管理画面を載せる

## Existing Spec Touchpoints

- **Extends**: なし（新規 + greenfield）
- **Adjacent**: なし（最初の spec）

## Constraints

- **`tech.md` 準拠**:
  - Next.js 16 (App Router、Turbopack stable、React Compiler)、React 19
  - TypeScript strict mode、no `any`
  - Tailwind CSS 4 + shadcn/ui ベース
  - Drizzle ORM 0.45.x stable、drizzle-kit
  - Vercel AI SDK 6（依存追加のみ、`useChat`/`streamText` は使わない、`generateObject` 中心）
  - Anthropic SDK、OpenAI SDK（依存追加のみ）
  - Zod（依存追加のみ）
  - Node.js 22 LTS or 24 LTS、pnpm 10+
- **`structure.md` 準拠**:
  - `apps/web` 単一アプリ構成（Stage 1）
  - `packages/{db, types, lib, ai}` の 4 パッケージのみ
  - `packages/{auth, ui, i18n}` は Stage 1 で作らない（Stage 2 で切り出し）
  - 命名規則: kebab-case ファイル、PascalCase コンポーネント、camelCase 関数・変数、snake_case DB
  - パッケージ参照エイリアス: `@bulr/db`、`@bulr/types`、`@bulr/lib`、`@bulr/ai`
  - `@bulr/types` は exports map で `./profile`、`./evaluation` 等のサブパス export を予約（実体ファイルは後続 spec で追加）
- **依存ルール**: `apps/web → packages/{db, types, lib, ai}` / `packages/ai → packages/{db, types, lib}` / `packages/db → packages/types` / `packages/lib → packages/types` / `packages/types → なし`、循環参照禁止、`packages/types` は Zod 等 runtime 依存を持たない（純粋な TypeScript 型のみ）
- **開発コマンド**: `pnpm dev` で apps/web (port 3000) が起動、`pnpm build` / `pnpm typecheck` / `pnpm lint` がルートから全パッケージ並列実行
- **dishxdish 参照**: `/Users/takaaki.tanno/Documents/workspace/github/dishxdish-app-mvp/` の構成を参考に、Stage 1 用に packages 数を削減して移植
