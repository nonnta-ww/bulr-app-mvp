# Requirements Document

## Introduction

`monorepo-foundation` 完了時点では `pnpm dev` がローカルで動作するモノレポは整うが、Vercel デプロイ・Neon Postgres 接続・Resend 統合・環境変数の管理規約がまだ存在しない。bulr Stage 1 のゴール（ベトナム人 50 名 + 日本人 20 名への配信）を達成するには、本番デプロイと PR ごとの Vercel Preview 環境、ローカル開発から Neon dev branch への接続、Resend Magic Link 配信に必要な API キー管理が不可欠である。

本スペックは、Stage 1 の運用に必要な「2 環境構成（dev branch 共有 + production）」を確立する。具体的には (1) Vercel プロジェクト初期化手順、(2) Neon Postgres の dev / production ブランチ分離、(3) Resend Free プラン契約と API キー登録、(4) `.env.example` を頂点とした環境変数規約、(5) `packages/db` 側の DATABASE_URL 読み取り規約、(6) GitHub Actions の最小 CI（typecheck + lint + audit）を整備する。Vercel / Neon / Resend のアカウント作成と初期設定は人間（Owner）が手動実施するため、再現性を担保するため手順書を `docs/setup/` 配下に整備する。

参照プロジェクト `dishxdish-app-mvp` は 4 環境（local / dev / preview / prod）構成だが、bulr Stage 1 は規模感（70 セッション）と運用工数を考慮し 2 環境（dev branch + production）に簡略化する。staging、Cloudflare R2、PostHog、Sentry、Helicone、カスタムドメイン SSL は Stage 2 で導入する。

## Boundary Context

- **In scope**:
  - Vercel プロジェクト `bulr-web` 初期化手順の文書化（Root Directory = `apps/web`、Build / Install / Output 設定、Production Branch = `main`）
  - Neon Postgres プロジェクト作成と dev / production の 2 ブランチ運用手順の文書化
  - Resend Free プラン契約 + API キー取得手順の文書化（Resend テストドメイン利用、カスタムドメイン認証は対象外）
  - リポジトリルート `.env.example`（Stage 1 の全環境変数を網羅: `DATABASE_URL` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `RESEND_API_KEY` / `NEXT_PUBLIC_APP_URL` / `ANTHROPIC_API_KEY` / `ADMIN_ALLOWED_EMAILS` / `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD`）
  - `apps/web/.env.local.example` の作成（ローカル開発者がコピーして利用するテンプレート）
  - `packages/db/drizzle.config.ts` が `.env.local` をルートから自動読込し、`DATABASE_URL` を解決する設定
  - `packages/db/src/client.ts` の DATABASE_URL 読み取り（`monorepo-foundation` で骨組みは存在するため、本スペックでは環境変数解決経路を確認）
  - Vercel Preview 環境（PR ごと自動デプロイ）が dev branch DATABASE_URL を共有する規約
  - Vercel Production 環境（main マージで自動デプロイ）が production branch DATABASE_URL を使う規約
  - Vercel ダッシュボード設定の文書化（環境変数を Production / Preview / Development の 3 スコープに割り当てる手順）
  - drizzle-kit push（dev branch、開発時の高速反映）と drizzle-kit migrate（production branch、履歴管理付き反映）の運用ルール文書化
  - `.github/workflows/ci.yml` 最小構成（PR 時に typecheck + lint + `pnpm audit --audit-level=moderate` を実行）
  - `README.md` または `docs/setup/README.md` への初期セットアップ案内追加（既存 README を阻害しない範囲で）
  - `vercel.json` の必要性判定（必要な場合のみ最小構成を提供、不要なら作成しない判断を文書化）

- **Out of scope**:
  - Better Auth の設定実装、Magic Link 送信ロジック、Cookie 設計 → `authentication` spec
  - DB のアプリケーションテーブル定義 → `assessment-pattern-seed` および `assessment-engine` spec
  - Resend のメールテンプレート（Magic Link 本文 HTML / プレーンテキスト） → `authentication` spec
  - Resend カスタムドメイン認証（DNS SPF / DKIM 設定）→ Stage 2
  - 監視スタック（PostHog / Sentry / Helicone / BetterStack） → Stage 2
  - Cloudflare R2（画像ストレージ）→ Stage 2
  - staging 環境の追加 → Stage 2
  - Resend Pro プラン契約 → Stage 2
  - Custom domain（`bulr.net` 等）の Vercel 接続と SSL 設定 → Stage 1 末期に必要なら追加（本スペックは Vercel 標準ドメイン `*.vercel.app` 前提）
  - Anthropic API キーの実利用検証（取得手順の文書化のみ、実際の Claude 呼び出しは `assessment-engine` spec）
  - Better Auth Secret の鍵生成自動化スクリプト（手順書に `openssl rand -hex 32` 等の生成コマンドを記載するに留める）
  - Neon の IP 制限（Vercel IP のみ許可）→ Stage 2
  - シークレットスキャンツール（gitleaks 等）→ Stage 2
  - Dependabot / CodeQL の有効化 → Stage 2

- **Adjacent expectations**:
  - 後続 spec（`authentication` / `assessment-pattern-seed` / `assessment-engine` / `admin-review-panel`）は本スペックで定義された `.env.example` のキー名と意味に従う。新たな環境変数を追加する際は本スペックが提供する `.env.example` に追記する形を取る。
  - 後続 spec は Vercel Preview 環境が dev branch DATABASE_URL を共有する前提で動作する（Preview で本番データを触らせない）。
  - `monorepo-foundation` で提供された `packages/db/src/client.ts` と `drizzle.config.ts` の構造を本スペックは変更しない。環境変数の解決経路を確認・補強するに留める。
  - 後続 spec は本スペックが整える `.github/workflows/ci.yml` を継承し、必要に応じてジョブを追加する。

## Requirements

### Requirement 1: 環境変数規約とテンプレート

**Objective:** リポジトリ管理者として、Stage 1 で必要なすべての環境変数を `.env.example` で一元的に文書化したい。それにより、新規開発者と Owner が漏れなく環境変数を準備でき、後続 spec の実装者が「どの変数が既に定義されているか」を即座に把握できる。

#### Acceptance Criteria

1. The Multi Env Infrastructure shall provide a repository-root `.env.example` that lists all Stage 1 environment variables: `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`RESEND_API_KEY`、`NEXT_PUBLIC_APP_URL`、`ANTHROPIC_API_KEY`、`ADMIN_ALLOWED_EMAILS`、`ADMIN_BASIC_AUTH_USER`、`ADMIN_BASIC_AUTH_PASSWORD`。
2. The `.env.example` shall include a short comment for each variable explaining (a) what it controls, (b) example value or generation command (例: `openssl rand -hex 32` for `BETTER_AUTH_SECRET`)、(c) whether it is required in Production / Preview / Development scope。
3. The Multi Env Infrastructure shall provide an `apps/web/.env.local.example` that mirrors the root `.env.example` so that ローカル開発者は `cp apps/web/.env.local.example apps/web/.env.local` で雛形を取得できる。
4. The Multi Env Infrastructure shall NOT commit any actual secret values; `.env.example` shall contain placeholder values only (例: `DATABASE_URL=postgres://user:password@host/db`).
5. When 新たな環境変数が後続 spec で追加される場合、the Multi Env Infrastructure shall require that `.env.example` and `apps/web/.env.local.example` の両方を更新する規約を文書化する。
6. The Multi Env Infrastructure shall ensure that `.env.local`、`.env*.local` are listed in `.gitignore` (本項目は `monorepo-foundation` で導入済みのため、本スペックでは存在を確認する程度に留める)。
7. The Multi Env Infrastructure shall require that `NEXT_PUBLIC_` prefix のついた環境変数のみがクライアントコードから参照可能であることを `.env.example` のコメントまたは `docs/setup/env-vars.md` で明示する。

### Requirement 2: Vercel プロジェクトセットアップ手順

**Objective:** Owner として、Vercel Hobby プランで `bulr-web` プロジェクトを初期化し、main ブランチへのマージで本番デプロイ、PR ごとに Preview デプロイが自動で走る状態を作りたい。それにより、ベトナム人受験者・日本人受験者への配信と、PR レビュー時の動作確認が可能になる。

#### Acceptance Criteria

1. The Multi Env Infrastructure shall provide `docs/setup/vercel.md` that documents the manual steps for Owner: (a) Vercel アカウント作成、(b) GitHub リポジトリ連携、(c) `bulr-web` プロジェクト作成、(d) Root Directory を `apps/web` に設定、(e) Build Command / Install Command / Output Directory の指定、(f) Production Branch を `main` に固定。
2. The `docs/setup/vercel.md` shall document the Build Command as `cd ../.. && pnpm turbo build --filter=web` (or equivalent that triggers Turborepo build from monorepo root)、Install Command as `cd ../.. && pnpm install --frozen-lockfile`、Output Directory として Next.js 16 デフォルトの `.next` を Vercel に認識させる設定。
3. The `docs/setup/vercel.md` shall document the procedure to register all Stage 1 environment variables to Vercel with three scopes: Production (production branch DATABASE_URL 等)、Preview (dev branch DATABASE_URL 等)、Development (任意、ローカル開発用には主に `.env.local` を使うため Vercel Development scope は最小限)。
4. When Owner が main ブランチに PR をマージする場合、the Multi Env Infrastructure shall Vercel が自動で本番デプロイを起動する状態が成立する（手順書に従って Production Branch = `main` を設定済みであれば自動実行される）。
5. When Owner または開発者が任意のブランチで PR を作成する場合、the Multi Env Infrastructure shall Vercel が自動で Preview デプロイを起動し、PR コメントに Preview URL が投稿される状態が成立する。
6. The Multi Env Infrastructure shall determine whether a `vercel.json` file is necessary; if Vercel ダッシュボードの設定だけで Stage 1 要件が満たせる場合は `vercel.json` を作成しないことを `docs/setup/vercel.md` に記載する。
7. The Multi Env Infrastructure shall use Vercel 標準ドメイン (`*.vercel.app` 自動生成名) for Stage 1 and shall NOT configure custom domain (`bulr.net` 等); カスタムドメイン接続手順はコメントで参照のみ留める。

### Requirement 3: Neon Postgres ブランチ運用

**Objective:** バックエンド開発者として、Neon Postgres に dev / production の 2 ブランチを用意し、開発時は dev branch にスキーマ変更を試行し、本番反映時は production branch に migration 履歴を残す運用を確立したい。それにより、本番データを破壊せず、開発速度と安全性を両立できる。

#### Acceptance Criteria

1. The Multi Env Infrastructure shall provide `docs/setup/neon.md` that documents the manual steps for Owner: (a) Neon アカウント作成、(b) `bulr` プロジェクト作成、(c) production branch (デフォルト) の DATABASE_URL 取得、(d) `dev` ブランチ (production からブランチ作成) の DATABASE_URL 取得、(e) 各 DATABASE_URL を Vercel および `.env.local` にコピーする手順。
2. The `docs/setup/neon.md` shall describe the branching strategy: production branch is the source of truth、dev branch は production からブランチして開発・スキーマ変更検証に使う、Vercel Preview は dev branch を共有する。
3. The Multi Env Infrastructure shall document the migration workflow: (a) ローカルでスキーマ変更 → `pnpm --filter @bulr/db generate` で migration ファイル生成、(b) `pnpm --filter @bulr/db push` で dev branch に反映 (高速、履歴なし)、(c) PR レビュー後 main マージ前に `pnpm --filter @bulr/db migrate` で production branch に反映 (履歴管理付き)。
4. The Multi Env Infrastructure shall require that Vercel Preview 環境の `DATABASE_URL` 環境変数は Neon dev branch の接続文字列を指す。
5. The Multi Env Infrastructure shall require that Vercel Production 環境の `DATABASE_URL` 環境変数は Neon production branch の接続文字列を指す。
6. The `docs/setup/neon.md` shall warn that Vercel Preview から本番データへ書き込まないために `DATABASE_URL` が production branch を指していないことを定期的に確認すること。
7. The Multi Env Infrastructure shall document that Neon Free プラン (1 プロジェクト、複数ブランチ) で Stage 1 は十分であり、有料プラン契約は不要であることを `docs/setup/neon.md` に記載する。

### Requirement 4: Resend 統合準備

**Objective:** Owner として、Resend Free プラン (100 通/日) で Magic Link メール配信に必要な API キーを取得し、Vercel 環境変数に登録したい。それにより、`authentication` spec が Magic Link 機能を実装する際にメール送信が即座に動作する状態を整える。

#### Acceptance Criteria

1. The Multi Env Infrastructure shall provide `docs/setup/resend.md` that documents the manual steps for Owner: (a) Resend アカウント作成 (Free プラン)、(b) API キー生成 (`RESEND_API_KEY`)、(c) Vercel 環境変数および `.env.local` への登録。
2. The `docs/setup/resend.md` shall describe that Stage 1 では Resend のテストドメイン (例: `onboarding@resend.dev`) を `from` に使い、カスタムドメイン認証 (DNS SPF / DKIM) は Stage 2 で実施する。
3. The Multi Env Infrastructure shall require that `RESEND_API_KEY` は Vercel Production / Preview / Development の各スコープで同じ Free プラン API キーを共有する (Stage 1 では分離不要)。
4. The Multi Env Infrastructure shall NOT implement Magic Link 送信ロジック in this spec; これは `authentication` spec が `RESEND_API_KEY` を消費する形で実装する。
5. The `docs/setup/resend.md` shall document that Free プラン制限 (100 通/日、月 3,000 通) は Stage 1 規模 (70 セッション × 数回 Magic Link 再送 = 月数百通程度) に対して十分であることを明記する。
6. The Multi Env Infrastructure shall document that `RESEND_API_KEY` 漏洩時の手順 (Resend ダッシュボードでキー再発行、Vercel 環境変数を更新、再デプロイ) を `docs/setup/resend.md` のトラブルシューティング節に記載する。

### Requirement 5: Anthropic API キー登録準備

**Objective:** Owner として、Anthropic Claude API のキーを取得し、Vercel 環境変数とローカル `.env.local` に登録したい。それにより、`assessment-engine` spec が LLM 問診機能を実装する際に Claude Sonnet 4.6 への接続が動作する状態を整える。

#### Acceptance Criteria

1. The Multi Env Infrastructure shall provide `docs/setup/anthropic.md` that documents the manual steps for Owner: (a) Anthropic Console アカウント作成、(b) API キー生成 (`ANTHROPIC_API_KEY`)、(c) Vercel 環境変数および `.env.local` への登録、(d) Anthropic Console で月額予算アラート設定 ($300 で警告、$500 で停止)。
2. The Multi Env Infrastructure shall require that `ANTHROPIC_API_KEY` は Vercel Production / Preview / Development の各スコープで設定される (Preview でも実 Claude API を呼ぶケースが発生するため)。
3. The Multi Env Infrastructure shall NOT implement any Claude API calls in this spec; これは `assessment-engine` spec が `ANTHROPIC_API_KEY` を消費する形で実装する。
4. The `docs/setup/anthropic.md` shall recommend that Stage 1 のコスト目安 ($50-150/月、70 セッション規模) を提示し、Anthropic Console 上で月額予算アラートを設定することを必須手順として記載する。
5. The `docs/setup/anthropic.md` shall warn that `ANTHROPIC_API_KEY` はサーバー専用 (server-only) であり、`NEXT_PUBLIC_` プレフィックスを付けない、クライアントコードから参照しないことを強調する。

### Requirement 6: Admin 認証用環境変数準備

**Objective:** Owner として、管理画面 (`/admin`) の Basic 認証と許可メールリストに必要な環境変数を `.env.example` に登録したい。それにより、`admin-review-panel` spec が Basic 認証ガード実装時に環境変数の存在を前提にできる。

#### Acceptance Criteria

1. The Multi Env Infrastructure shall include `ADMIN_ALLOWED_EMAILS`、`ADMIN_BASIC_AUTH_USER`、`ADMIN_BASIC_AUTH_PASSWORD` in `.env.example` with comments explaining: (a) `ADMIN_ALLOWED_EMAILS` は CSV 形式 (例: `taro@example.com,hanako@example.com`) で許可メールリスト、(b) `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` は Basic 認証ダイアログのユーザー名・パスワード。
2. The Multi Env Infrastructure shall require that `ADMIN_BASIC_AUTH_PASSWORD` is generated via a strong password generator (例: `openssl rand -base64 24` 等、文書化する) and shall NOT use weak defaults。
3. The Multi Env Infrastructure shall NOT implement Basic 認証ロジック in this spec; これは `admin-review-panel` spec (または `authentication` spec) が消費する。
4. The Multi Env Infrastructure shall require that `ADMIN_ALLOWED_EMAILS` / `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` are registered in Vercel Production scope (本番管理画面アクセス用)、Preview scope (PR 時の管理画面動作確認用、開発者間で共有可)、Development scope (ローカル `.env.local` で個人利用)。

### Requirement 7: GitHub Actions 最小 CI

**Objective:** リポジトリ管理者として、PR 作成時に typecheck と lint と依存性脆弱性チェックを自動実行する CI を整備したい。それにより、Vercel Preview デプロイ前にコードベースの基本品質と既知脆弱性を検出できる。

#### Acceptance Criteria

1. The Multi Env Infrastructure shall provide `.github/workflows/ci.yml` that triggers on `pull_request` to `main` and on `push` to `main`。
2. The CI workflow shall execute the following jobs in parallel where possible: (a) `pnpm install --frozen-lockfile`、(b) `pnpm typecheck`、(c) `pnpm lint`、(d) `pnpm audit --audit-level=moderate`。
3. When `pnpm audit` detects moderate or higher severity vulnerabilities、the CI workflow shall fail the build。
4. The CI workflow shall use Node.js 22 LTS (matching `engines` in root `package.json`) and pnpm 10+。
5. The CI workflow shall NOT execute `pnpm build` in this spec (Vercel が PR 時に Preview ビルドを実行するため重複を避ける); ただし、将来 build を CI で行う必要が生じた場合は本スペックの後続更新で追加する余地を残す。
6. The CI workflow shall NOT include test execution in this spec (テストフレームワークは Stage 1 の後続 spec で導入時に CI へ追加する)。
7. The Multi Env Infrastructure shall ensure that CI failures block PR merge through GitHub branch protection rule recommendation in `docs/setup/github.md` (実際のブランチ保護ルール設定は GitHub UI で Owner が手動実施)。

### Requirement 8: ローカル開発と Drizzle 接続

**Objective:** 開発者として、ローカルの `.env.local` から Neon dev branch の DATABASE_URL を読んで `pnpm dev` で apps/web を起動し、`pnpm --filter @bulr/db push` でスキーマ変更を dev branch に反映できる状態が欲しい。それにより、ローカル開発と検証が円滑に回る。

#### Acceptance Criteria

1. When 開発者が `apps/web/.env.local.example` を `apps/web/.env.local` にコピーし、Neon dev branch DATABASE_URL を記入する場合、the Multi Env Infrastructure shall `pnpm dev` 実行時に apps/web から `@bulr/db` 経由で Neon dev branch に接続できる状態が成立する。
2. The Multi Env Infrastructure shall ensure that `packages/db/drizzle.config.ts` reads `DATABASE_URL` from the repository-root `.env.local` (or `apps/web/.env.local` 経由) so that `pnpm --filter @bulr/db generate` / `push` / `migrate` が環境変数を解決できる (本ロジックは `monorepo-foundation` の `drizzle.config.ts` 既存実装が `.env.local` を自動読込する前提を確認する)。
3. When 開発者が `pnpm --filter @bulr/db push` を実行する場合、the Multi Env Infrastructure shall `DATABASE_URL` (dev branch) に対してスキーマを反映し、履歴を残さない (高速反復用)。
4. When 開発者または CI が `pnpm --filter @bulr/db migrate` を本番 DATABASE_URL に対して実行する場合、the Multi Env Infrastructure shall production branch に migration 履歴を残しつつ反映する (本スペックでは migration 実行は文書化のみ、実 migration は後続 spec の DB スキーマ追加時に実施)。
5. The Multi Env Infrastructure shall document in `docs/setup/local.md` (または `README.md`) the local setup flow: (a) `cp .env.example apps/web/.env.local` and fill values、(b) `pnpm install`、(c) `pnpm dev` to launch on `http://localhost:3000`、(d) `pnpm --filter @bulr/db push` to apply schema changes to dev branch。
6. The Multi Env Infrastructure shall warn in `docs/setup/local.md` that `DATABASE_URL` を production branch にローカルで接続してはならない (誤って本番データを破壊するリスク回避)。

### Requirement 9: セットアップドキュメント整備

**Objective:** 新規開発者および将来の Owner として、Vercel / Neon / Resend / Anthropic / GitHub Actions の初期セットアップを再現できる手順書が `docs/setup/` 配下に整備されている状態が欲しい。それにより、Owner 1 人運用でもナレッジが文書化され、Stage 2 移行時の参照資料となる。

#### Acceptance Criteria

1. The Multi Env Infrastructure shall provide a `docs/setup/README.md` that lists all setup documents and recommends the order: (1) Vercel、(2) Neon、(3) Resend、(4) Anthropic、(5) GitHub Actions / branch protection、(6) ローカル `.env.local` 整備。
2. The `docs/setup/README.md` shall include a checklist for Owner to track setup completion (例: `- [ ] Vercel プロジェクト作成`、`- [ ] Neon dev branch 作成` 等)。
3. The Multi Env Infrastructure shall ensure each `docs/setup/{vercel,neon,resend,anthropic,github,local}.md` 文書は単一目的で完結し、相互参照は明示的なリンクで行う。
4. The Multi Env Infrastructure shall update the repository-root `README.md` to include a brief "セットアップは `docs/setup/README.md` を参照" pointer; ただし `monorepo-foundation` で書かれた既存 README の内容は最小限の追記に留め、重複文書化を避ける。
5. The Multi Env Infrastructure shall NOT duplicate steering 内容 (`tech.md`、`security.md`) in setup docs; setup docs は手順 (HOW) に集中し、設計判断 (WHY) は steering へのリンクで参照する。
6. When 後続 spec が新たな外部サービス (例: PostHog、Sentry) を導入する場合、the Multi Env Infrastructure shall require to add a new `docs/setup/{service}.md` and update `docs/setup/README.md` checklist (規約のみ、本スペックでは実施しない)。

### Requirement 10: シークレット管理とセキュリティ規約

**Objective:** リポジトリ管理者として、`security.md` のシークレット管理方針 (Vercel 環境変数で本番・Preview を分離管理、`NEXT_PUBLIC_` プレフィックス規約、`.env.local` のコミット禁止) を本スペックの設定で具体的に実現したい。それにより、後続 spec の実装者が誤ってシークレットを漏洩しない仕組みを整える。

#### Acceptance Criteria

1. The Multi Env Infrastructure shall require that all sensitive environment variables (`DATABASE_URL`、`BETTER_AUTH_SECRET`、`RESEND_API_KEY`、`ANTHROPIC_API_KEY`、`ADMIN_BASIC_AUTH_PASSWORD`) are NOT prefixed with `NEXT_PUBLIC_` and are referenced only from server-side code (Server Component / Server Action / API Route / Node.js scripts)。
2. The Multi Env Infrastructure shall document in `docs/setup/env-vars.md` (または `.env.example` のコメント) that variables prefixed with `NEXT_PUBLIC_` (`NEXT_PUBLIC_APP_URL`) are exposed to client-side bundles and shall contain only public values。
3. The Multi Env Infrastructure shall document in `docs/setup/vercel.md` that Vercel Production scope と Preview scope は別々に環境変数を登録し、Preview は dev branch DATABASE_URL を指す (本番データを Preview から触らせない)。
4. When 開発者が `.env.local` を誤ってコミットしようとする場合、the Multi Env Infrastructure shall `.gitignore` で阻止する (本項目は `monorepo-foundation` で導入済み、本スペックでは存在を確認)。
5. The Multi Env Infrastructure shall document in `docs/setup/secrets.md` (または各サービス setup ドキュメント内) the rotation procedure for each secret: (a) Resend API キー、(b) Anthropic API キー、(c) Better Auth Secret、(d) Admin Basic Auth Password。
6. The Multi Env Infrastructure shall require that the `pnpm audit --audit-level=moderate` CI step (Requirement 7.2) is enforced and not bypassed (CI failure blocks PR merge per Requirement 7.7)。
