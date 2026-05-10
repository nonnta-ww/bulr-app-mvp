# Design Document: multi-env-infrastructure

## Overview

**Purpose**: bulr Stage 1 MVP プロトタイプの本番デプロイ・PR Preview デプロイ・ローカル開発接続を成立させるため、Vercel Hobby + Neon Postgres (dev / production 2 ブランチ) + Resend Free + Anthropic API キー + GitHub Actions 最小 CI を統合する。`monorepo-foundation` で骨組みが用意された `apps/web` と `packages/db` に対し、**コードを増やすのではなく「環境変数規約」と「外部サービスのセットアップ手順書」と「最小 CI 設定」**を提供することで、後続 4 spec が本番運用可能な状態で機能を積み上げられるようにする。

**Users**:
- **Owner（創業者）**: Vercel / Neon / Resend / Anthropic のアカウント作成と初期設定を手動実施する。本スペック完了後は管理画面 (`/admin`) と本番デプロイの URL を保有する。
- **後続 4 spec 実装者**: `authentication` / `assessment-pattern-seed` / `assessment-engine` / `admin-review-panel` の実装者は、本スペックで整備された `.env.example` のキー・Vercel 環境変数の存在・Neon ブランチ運用ルール・Resend API キーを前提として機能を積む。
- **ローカル開発者**: `cp apps/web/.env.local.example apps/web/.env.local` で雛形を取得し、Owner から共有された Neon dev branch DATABASE_URL 等を記入することでローカル開発を開始できる。

**Impact**: `monorepo-foundation` 完了直後の状態（ルート設定 + apps/web スケルトン + 4 packages スケルトン）に対し、(1) リポジトリルート `.env.example` と `apps/web/.env.local.example` の追加、(2) `docs/setup/` ディレクトリ配下に 6 つのセットアップ手順書追加、(3) `.github/workflows/ci.yml` 追加、(4) `README.md` への簡潔な setup ポインタ追記、(5) `packages/db/drizzle.config.ts` の `.env.local` 自動読込ロジックの確認・補強（既存実装が適切なら変更しない）を行う。**コードファイルの新規作成は最小化**し、設定ファイル・ドキュメント・CI 定義が中心となる。

### Goals

- リポジトリルート `.env.example` で Stage 1 の全環境変数 (9 変数) を一元文書化する
- `apps/web/.env.local.example` でローカル開発者が雛形をコピーして使える状態を提供する
- `docs/setup/` 配下に Vercel / Neon / Resend / Anthropic / GitHub / Local の 6 つの手順書を配置し、Owner が再現可能な手順で外部サービスを初期化できる状態を作る
- Vercel プロジェクト `bulr-web` の Build Command / Install Command / Root Directory / 環境変数スコープ (Production / Preview / Development) の設定方針を文書化する
- Neon Postgres の dev / production 2 ブランチ運用ルール (push は dev、migrate は production) を文書化する
- `.github/workflows/ci.yml` で PR 時に typecheck + lint + `pnpm audit --audit-level=moderate` を自動実行する
- `monorepo-foundation` で導入された `drizzle.config.ts` が `.env.local` を読み取って動作する経路を確認・必要なら補強する

### Non-Goals

- Better Auth 設定、Magic Link 送信ロジック、Cookie 設計の実装 → `authentication` spec
- DB アプリケーションテーブル定義、Drizzle migration の実 DB 反映 → `assessment-pattern-seed` および `assessment-engine` spec
- Resend のメールテンプレート (Magic Link 本文) 実装 → `authentication` spec
- Resend カスタムドメイン認証 (DNS SPF / DKIM 設定) → Stage 2
- Cloudflare R2、PostHog、Sentry、Helicone、BetterStack の導入 → Stage 2
- Custom domain (`bulr.net` 等) の Vercel 接続と SSL 設定 → Stage 1 末期に必要なら追加 (本スペックは `*.vercel.app` 前提)
- staging 環境の追加 → Stage 2
- Resend Pro プラン契約 → Stage 2
- Neon の IP 制限 (Vercel IP のみ許可) → Stage 2
- Dependabot / CodeQL / gitleaks 等の追加セキュリティスキャン → Stage 2
- テストフレームワーク (Vitest / Playwright) の CI 統合 → 必要になった spec で導入時に追加
- `pnpm build` の CI 実行 (Vercel が PR 時に Preview ビルドを実行するため重複を避ける)
- 自動化シークレットローテーション (本スペックは手動手順を文書化するに留める)

## Boundary Commitments

### This Spec Owns

- リポジトリルート `.env.example` (Stage 1 全環境変数 9 個 + コメント)
- `apps/web/.env.local.example` (ルートと同等のテンプレート)
- `docs/setup/README.md` (セットアップ手順インデックスとチェックリスト)
- `docs/setup/vercel.md` (Vercel プロジェクト初期化手順、Build / Install / 環境変数スコープ設定)
- `docs/setup/neon.md` (Neon プロジェクト + dev / production ブランチ作成、DATABASE_URL 取得、ブランチ運用ルール)
- `docs/setup/resend.md` (Resend Free アカウント、API キー取得、Stage 1 でのテストドメイン利用方針)
- `docs/setup/anthropic.md` (Anthropic Console アカウント、API キー取得、月額予算アラート設定)
- `docs/setup/github.md` (GitHub Actions のためのリポジトリ設定、ブランチ保護ルール推奨)
- `docs/setup/local.md` (ローカル開発の `.env.local` 整備手順、Drizzle push 運用)
- `docs/setup/env-vars.md` (環境変数早見表、`NEXT_PUBLIC_` 規約、シークレットローテーション手順)
- `.github/workflows/ci.yml` (typecheck + lint + audit の最小 CI)
- リポジトリルート `README.md` への setup ポインタ追記 (既存内容を最小限にしか変更しない)
- 環境変数の命名・スコープ規約 (Production / Preview / Development の使い分け)
- Vercel Preview = Neon dev branch DATABASE_URL 共有、Vercel Production = Neon production branch DATABASE_URL の運用ルール

### Out of Boundary

- `packages/db/src/client.ts` の DATABASE_URL 読み取りロジック実装 — `monorepo-foundation` で実装済み。本スペックは存在を前提として動作確認する
- `packages/db/drizzle.config.ts` の構造変更 — `monorepo-foundation` で `.env.local` 自動読込が実装されている前提。動作しない場合のみ最小修正を許容するが、構造変更はしない
- Vercel / Neon / Resend / Anthropic アカウントの実際の作成 (Claude Code が API 経由で作成不可、Owner の手動作業)
- 各サービスの API キーの実値 (シークレットなのでリポジトリには絶対に含めない)
- Better Auth の設定実装、Magic Link 機能、Basic 認証ガード — 後続 spec
- DB スキーマ実体定義、Drizzle migration の実 DB 反映実行 — 後続 spec
- LLM 呼び出し実装、システムプロンプト、評価ロジック — `assessment-engine` spec
- カスタムドメイン (`bulr.net`) の DNS / SSL 設定 — Stage 1 末期 / Stage 2
- 監視・分析ツール統合 — Stage 2

### Allowed Dependencies

- 外部サービス: Vercel (Hobby プラン)、Neon Postgres (Free プラン)、Resend (Free プラン)、Anthropic API、GitHub (リポジトリホスティング + Actions)
- 既存ファイル参照のみ:
  - `monorepo-foundation` で導入された `package.json`、`pnpm-workspace.yaml`、`turbo.json`、`packages/db/drizzle.config.ts`、`packages/db/src/client.ts`、`apps/web/next.config.ts`、`.gitignore`
- 新規 npm パッケージ追加はなし (本スペックは設定とドキュメントが中心)
- ホスト環境: Node.js 22 LTS 以上、pnpm 10 以上 (`monorepo-foundation` の制約を引き継ぐ)

### Revalidation Triggers

以下が発生した場合、本スペック完了後に整合性を再検証する:

- Stage 1 環境変数リストの増減 (例: 後続 spec が新規 API キーを追加 → `.env.example` への追記)
- Vercel プラン変更 (Hobby → Pro)、Neon プラン変更 (Free → Pro)、Resend プラン変更 (Free → Pro)
- Vercel Build Command / Install Command / Root Directory の変更が必要になる構造変化 (例: apps/admin 分離 = Stage 2)
- Neon ブランチ戦略の変更 (例: staging branch 追加 = Stage 2)
- Resend テストドメイン → カスタムドメイン認証への切替 (Stage 2)
- カスタムドメイン (`bulr.net`) の追加
- 監視スタック (PostHog / Sentry / Helicone) 追加に伴う環境変数増 (Stage 2)
- CI ジョブの追加 (テスト導入時に jobs を追加する場合)
- `monorepo-foundation` の `drizzle.config.ts` 構造変更 (`.env.local` 読込経路が変わる場合)

## Architecture

### Architecture Pattern & Boundary Map

```mermaid
graph TB
    subgraph Repo["bulr-app-mvp Repository"]
        EnvExample[.env.example<br/>Stage 1 全環境変数]
        WebEnvExample[apps/web/.env.local.example<br/>ローカル雛形]
        SetupDocs[docs/setup/<br/>6 つの手順書]
        CiYml[.github/workflows/ci.yml<br/>typecheck + lint + audit]
        Readme[README.md<br/>setup ポインタ追記]
    end

    subgraph Existing["monorepo-foundation 既存資産"]
        DbClient[packages/db/src/client.ts<br/>DATABASE_URL 読み取り]
        DrizzleConfig[packages/db/drizzle.config.ts<br/>.env.local 自動読込]
        WebApp[apps/web<br/>Next.js 16 スケルトン]
        Gitignore[.gitignore<br/>.env*.local 除外]
    end

    subgraph External["外部サービス（Owner 手動セットアップ）"]
        Vercel[Vercel Hobby<br/>bulr-web プロジェクト<br/>Production / Preview / Development]
        Neon[Neon Postgres Free<br/>production branch + dev branch]
        Resend[Resend Free<br/>API キー + テストドメイン]
        Anthropic[Anthropic Console<br/>API キー + 月額予算アラート]
        GitHub[GitHub Actions<br/>PR / push トリガー]
    end

    EnvExample -.documents.-> Vercel
    EnvExample -.documents.-> Neon
    EnvExample -.documents.-> Resend
    EnvExample -.documents.-> Anthropic
    WebEnvExample -.derived from.-> EnvExample
    SetupDocs -.guides Owner to setup.-> Vercel
    SetupDocs -.guides Owner to setup.-> Neon
    SetupDocs -.guides Owner to setup.-> Resend
    SetupDocs -.guides Owner to setup.-> Anthropic
    CiYml -.runs on.-> GitHub
    Readme -.points to.-> SetupDocs

    Vercel -.deploys.-> WebApp
    Neon -.connection url consumed by.-> DbClient
    DrizzleConfig -.reads.-> WebEnvExample
    Gitignore -.protects.-> WebEnvExample
```

**Architecture Integration**:

- **Selected pattern**: 「設定 + ドキュメント駆動」のインフラ層スペック。コード変更を最小化し、`.env.example` を中心とした環境変数規約と Owner 向け手順書で外部サービスを統合する。
- **Domain/feature boundaries**: 環境変数規約 (`.env.example` / `.env.local.example`)、外部サービスセットアップ手順 (`docs/setup/`)、CI 設定 (`.github/workflows/`) の 3 つが明確な担当領域。`packages/db` と `apps/web` のコードは `monorepo-foundation` の領域なので、本スペックは触らないことを原則とする (ただし `drizzle.config.ts` が `.env.local` を読み取れない場合のみ最小修正を許容)。
- **Existing patterns preserved**: `monorepo-foundation` で導入された `.gitignore` の `.env*.local` 除外、`packages/db/drizzle.config.ts` の `.env.local` 自動読込、`packages/db/src/client.ts` の `DATABASE_URL` 起動時 throw を尊重する。
- **New components rationale**:
  - `.env.example`: Stage 1 環境変数の唯一の真実。後続 spec が新規変数追加時の追記対象となる。
  - `docs/setup/*.md`: Owner が手動実施する手順を網羅し、知識を文書化する (Owner 1 人運用前提)。
  - `.github/workflows/ci.yml`: Vercel Preview ビルド前にコード品質と既知脆弱性を検出する最小ゲート。
- **Steering compliance**:
  - `tech.md`: Vercel Hobby / Neon Free / Resend Free / Anthropic Console、Stage 1 環境変数 9 個、Node.js 22 LTS + pnpm 10+ をすべて遵守
  - `security.md`: シークレット環境変数を `NEXT_PUBLIC_` 非プレフィックスで管理、`.env.local` を gitignore、Vercel 環境変数で Production / Preview を分離、`pnpm audit --audit-level=moderate` を CI で強制
  - `structure.md`: `apps/web` 単一アプリ + `packages/{db, types, lib, ai}` 構成を維持、`docs/setup/` を新規ディレクトリとして追加 (既存 `docs/` の他ファイルは触らない)

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Hosting | Vercel Hobby (無料) | apps/web のホスティング、Preview 自動デプロイ、本番自動デプロイ | Stage 1 規模で十分。Stage 2 で Pro 検討 |
| Database | Neon Postgres Free (1 プロジェクト + 複数ブランチ) | dev / production 2 ブランチ運用、サーバーレス Postgres | Stage 1 規模 (70 セッション) で Free プラン十分 |
| Email | Resend Free (100 通/日、月 3,000 通) | Magic Link 配信用 API キー提供 | Stage 1 規模 (月数百通) で Free プラン十分。テストドメイン (`onboarding@resend.dev`) 利用 |
| LLM | Anthropic Console (Claude Sonnet 4.6 API) | API キー提供、月額予算アラート | $50-150/月の予算想定。Console で $300 警告 / $500 停止 |
| CI/CD | GitHub Actions (`pull_request` / `push` to main) | typecheck + lint + audit の最小ゲート | Vercel Preview ビルドと並行実行 |
| Build orchestration | Turborepo 2.9 + pnpm 10 | `pnpm typecheck` / `lint` を CI と Vercel 両方で実行 | `monorepo-foundation` で導入済み |
| Type Safety | TypeScript 5.4+ (strict、`noUncheckedIndexedAccess`) | 環境変数アクセス時の型安全 | `monorepo-foundation` で導入済み |
| Secrets management | Vercel 環境変数 (Production / Preview / Development) + ローカル `.env.local` | サーバー側のみシークレット参照、`.env.local` は gitignore | `security.md` の方針に準拠 |
| Documentation | Markdown (日本語) | `docs/setup/` 配下 6 ファイル | Owner と新規開発者向け |

> 詳細な代替案検討 (4 環境構成 vs 2 環境構成、Vercel vs Cloudflare Pages、Neon vs Supabase 等) は `research.md` に格納。本セクションは決定された選定と役割のみを提示する。

## File Structure Plan

### Directory Structure

```
bulr-app-mvp/
├── .env.example                                # ★ NEW: Stage 1 全環境変数 (9 個) + コメント
├── README.md                                    # MOD: setup ポインタを 1-2 行追記
│
├── .github/
│   └── workflows/
│       └── ci.yml                               # ★ NEW: typecheck + lint + audit の最小 CI
│
├── apps/
│   └── web/
│       └── .env.local.example                   # ★ NEW: ローカル開発者向け雛形 (ルート .env.example と同期)
│
├── docs/
│   └── setup/                                   # ★ NEW: 手順書ディレクトリ
│       ├── README.md                            # ★ NEW: セットアップインデックス + チェックリスト
│       ├── vercel.md                            # ★ NEW: Vercel プロジェクト初期化手順
│       ├── neon.md                              # ★ NEW: Neon プロジェクト + dev / production ブランチ手順
│       ├── resend.md                            # ★ NEW: Resend Free アカウント + API キー手順
│       ├── anthropic.md                         # ★ NEW: Anthropic Console + API キー + 予算アラート
│       ├── github.md                            # ★ NEW: GitHub Actions + ブランチ保護ルール推奨
│       ├── local.md                             # ★ NEW: ローカル開発の .env.local 整備 + Drizzle push
│       └── env-vars.md                          # ★ NEW: 環境変数早見表 + NEXT_PUBLIC_ 規約 + ローテーション手順
│
└── packages/
    └── db/
        ├── drizzle.config.ts                    # 既存 (monorepo-foundation): .env.local 自動読込が動作することを確認
        └── src/
            └── client.ts                        # 既存 (monorepo-foundation): DATABASE_URL 起動時 throw が動作することを確認
```

### Modified Files

- `README.md` — `monorepo-foundation` で書かれた既存 README に「セットアップ手順は `docs/setup/README.md` を参照」のポインタを 1-2 行で追記。既存内容は変更しない。

### Files NOT Created

- `vercel.json` — Vercel ダッシュボード設定 + monorepo の Build Command 指定で Stage 1 要件は満たせるため、本スペックでは作成しない。Stage 2 で Function 設定や Edge 設定が必要になった時に作成判断する。
- `apps/web/.env.local` — シークレットを含むため絶対にコミットしない。`.env.local.example` から開発者が手動コピー。
- `docs/setup/cloudflare-r2.md`、`docs/setup/posthog.md` 等 — Stage 2 で導入時に追加する。

> File Structure Plan の各ファイルは「責務 1 つ」の原則を守る。本スペックは新規コードを書かないため、ファイルはすべて設定 (`.env.example` / `.github/workflows/ci.yml`) または Markdown ドキュメント。

## System Flows

### フロー 1: Owner の初期セットアップフロー

```mermaid
sequenceDiagram
    actor Owner
    participant Docs as docs/setup/README.md
    participant Vercel
    participant Neon
    participant Resend
    participant Anthropic
    participant GitHub
    participant Local as ローカル .env.local

    Owner->>Docs: 手順インデックスを開く
    Docs-->>Owner: 推奨実施順 (1) Vercel → (6) Local

    Note over Owner,Vercel: 手順 (1)
    Owner->>Vercel: アカウント作成 + GitHub 連携
    Owner->>Vercel: bulr-web プロジェクト作成 (Root Dir = apps/web)
    Vercel-->>Owner: Production URL (vercel.app 自動生成)

    Note over Owner,Neon: 手順 (2)
    Owner->>Neon: アカウント + bulr プロジェクト作成
    Owner->>Neon: dev branch 作成 (production からブランチ)
    Neon-->>Owner: production / dev DATABASE_URL × 2

    Note over Owner,Vercel: 環境変数登録 (Production scope = production DB、Preview scope = dev DB)
    Owner->>Vercel: DATABASE_URL を Production / Preview に登録

    Note over Owner,Resend: 手順 (3)
    Owner->>Resend: アカウント + API キー生成
    Resend-->>Owner: RESEND_API_KEY
    Owner->>Vercel: RESEND_API_KEY を全 scope に登録

    Note over Owner,Anthropic: 手順 (4)
    Owner->>Anthropic: Console + API キー生成 + 予算アラート
    Anthropic-->>Owner: ANTHROPIC_API_KEY
    Owner->>Vercel: ANTHROPIC_API_KEY を全 scope に登録

    Note over Owner,Vercel: BETTER_AUTH_SECRET / NEXT_PUBLIC_APP_URL / ADMIN_* も登録
    Owner->>Vercel: openssl rand で BETTER_AUTH_SECRET 生成 → 全 scope に登録
    Owner->>Vercel: ADMIN_ALLOWED_EMAILS / ADMIN_BASIC_AUTH_* を全 scope に登録

    Note over Owner,GitHub: 手順 (5)
    Owner->>GitHub: ブランチ保護ルール (main) で CI 必須化

    Note over Owner,Local: 手順 (6)
    Owner->>Local: cp apps/web/.env.local.example apps/web/.env.local
    Owner->>Local: 各値を記入 (Owner 自身のローカル開発用)
    Local-->>Owner: pnpm dev で http://localhost:3000 動作
```

### フロー 2: PR 作成時の自動デプロイ + CI フロー

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant GH as GitHub
    participant CI as GitHub Actions (ci.yml)
    participant Vercel
    participant NeonDev as Neon dev branch

    Dev->>GH: feature ブランチを push + PR 作成
    GH->>CI: pull_request トリガー
    GH->>Vercel: Webhook 通知

    par CI ジョブ
        CI->>CI: pnpm install --frozen-lockfile
        CI->>CI: pnpm typecheck
        CI->>CI: pnpm lint
        CI->>CI: pnpm audit --audit-level=moderate
        CI-->>GH: PR チェック結果 (成功 / 失敗)
    and Vercel Preview デプロイ
        Vercel->>Vercel: pnpm install + pnpm turbo build --filter=web
        Vercel->>NeonDev: DATABASE_URL = Preview scope (dev branch)
        Vercel-->>GH: Preview URL を PR コメント投稿
    end

    Dev->>GH: PR レビュー + Preview URL で動作確認
    Dev->>GH: main にマージ (CI 必須通過後)
    GH->>Vercel: production デプロイ起動 (DATABASE_URL = Production scope = production branch)
```

### フロー 3: 開発者のローカル開発接続フロー

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant Local as apps/web/.env.local
    participant DrizzleConfig as packages/db/drizzle.config.ts
    participant Client as packages/db/src/client.ts
    participant NeonDev as Neon dev branch

    Dev->>Local: cp apps/web/.env.local.example apps/web/.env.local
    Dev->>Local: Owner から共有された DATABASE_URL (dev) を記入
    Dev->>Local: BETTER_AUTH_SECRET / 他値も記入

    Dev->>DrizzleConfig: pnpm --filter @bulr/db push 実行
    DrizzleConfig->>Local: .env.local を自動読込 (monorepo-foundation 既存ロジック)
    DrizzleConfig->>NeonDev: dev branch にスキーマ反映 (履歴なし)
    NeonDev-->>Dev: スキーマ反映完了

    Dev->>Client: pnpm dev 経由で apps/web から import { db } from '@bulr/db'
    Client->>Local: process.env.DATABASE_URL を読む
    Client->>NeonDev: pg.Pool で接続成立
    NeonDev-->>Client: クエリ応答
    Client-->>Dev: ブラウザで http://localhost:3000 が dev DB データで動作
```

## Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 1.1 | `.env.example` に 9 環境変数を網羅 | EnvExampleRoot | env vars listing | フロー 1 |
| 1.2 | 各変数にコメント (用途・例・scope) | EnvExampleRoot | env vars commenting | — |
| 1.3 | `apps/web/.env.local.example` をルートと同期 | EnvExampleWeb | env vars mirror | フロー 1, 3 |
| 1.4 | 実シークレット値を `.env.example` に書かない | EnvExampleRoot, EnvExampleWeb | placeholder only | — |
| 1.5 | 後続 spec が新規変数追加時の追記規約 | EnvVarsDoc | documentation | — |
| 1.6 | `.gitignore` の `.env.local` 除外確認 | (existing GitignoreConfig) | gitignore check | フロー 3 |
| 1.7 | `NEXT_PUBLIC_` 規約の明示 | EnvExampleRoot, EnvVarsDoc | comment | — |
| 2.1 | `docs/setup/vercel.md` の手順書 | VercelDoc | manual procedure | フロー 1 |
| 2.2 | Build Command / Install Command / Output 指定 | VercelDoc | Vercel config | フロー 2 |
| 2.3 | 環境変数を Production / Preview / Development の 3 scope に登録 | VercelDoc | scope assignment | フロー 1 |
| 2.4 | main マージで本番自動デプロイ | VercelDoc | trigger doc | フロー 2 |
| 2.5 | PR で Preview 自動デプロイ + URL コメント | VercelDoc | trigger doc | フロー 2 |
| 2.6 | `vercel.json` の必要性判定 → 不要なら作らない | VercelDoc | decision doc | — |
| 2.7 | Vercel 標準ドメイン (`*.vercel.app`) で Stage 1 運用 | VercelDoc | constraint doc | — |
| 3.1 | `docs/setup/neon.md` の手順書 | NeonDoc | manual procedure | フロー 1 |
| 3.2 | branching strategy 記述 (production source / dev branch / Preview 共有) | NeonDoc | strategy doc | フロー 2, 3 |
| 3.3 | migration workflow (push for dev, migrate for production) | NeonDoc | workflow doc | フロー 3 |
| 3.4 | Vercel Preview = dev branch DATABASE_URL | VercelDoc, NeonDoc | constraint | フロー 2 |
| 3.5 | Vercel Production = production branch DATABASE_URL | VercelDoc, NeonDoc | constraint | フロー 2 |
| 3.6 | Preview から本番データへ書き込まない警告 | NeonDoc | warning | — |
| 3.7 | Neon Free プランで十分な明記 | NeonDoc | constraint doc | — |
| 4.1 | `docs/setup/resend.md` の手順書 | ResendDoc | manual procedure | フロー 1 |
| 4.2 | テストドメイン利用、カスタムドメインは Stage 2 | ResendDoc | constraint doc | — |
| 4.3 | `RESEND_API_KEY` を全 scope で同じキー共有 | ResendDoc | scope strategy | フロー 1 |
| 4.4 | Magic Link 送信ロジックは本 spec で実装しない | (Out of Boundary) | — | — |
| 4.5 | Free プラン制限 (100/日、3000/月) が Stage 1 に十分 | ResendDoc | constraint doc | — |
| 4.6 | `RESEND_API_KEY` ローテーション手順 | ResendDoc, EnvVarsDoc | troubleshooting | — |
| 5.1 | `docs/setup/anthropic.md` の手順書 + 予算アラート | AnthropicDoc | manual procedure | フロー 1 |
| 5.2 | `ANTHROPIC_API_KEY` を全 scope に登録 | AnthropicDoc | scope strategy | フロー 1 |
| 5.3 | Claude API 呼び出しは本 spec で実装しない | (Out of Boundary) | — | — |
| 5.4 | $50-150/月の予算目安 + Console アラート必須 | AnthropicDoc | budget guidance | — |
| 5.5 | `ANTHROPIC_API_KEY` は server-only、`NEXT_PUBLIC_` 禁止 | AnthropicDoc, EnvVarsDoc | security warning | — |
| 6.1 | `ADMIN_ALLOWED_EMAILS` / `ADMIN_BASIC_AUTH_*` を `.env.example` に + コメント | EnvExampleRoot | env vars + comment | — |
| 6.2 | `ADMIN_BASIC_AUTH_PASSWORD` は強パスワード生成 (`openssl rand -base64 24` 等) | EnvVarsDoc | secret generation | — |
| 6.3 | Basic 認証ロジックは本 spec で実装しない | (Out of Boundary) | — | — |
| 6.4 | `ADMIN_*` を全 scope に登録 | VercelDoc, EnvVarsDoc | scope strategy | フロー 1 |
| 7.1 | `.github/workflows/ci.yml` の `pull_request` / `push` トリガー | CiYml | GitHub Actions trigger | フロー 2 |
| 7.2 | typecheck + lint + audit の各 job | CiYml | jobs definition | フロー 2 |
| 7.3 | audit moderate 以上で fail | CiYml | exit code propagation | フロー 2 |
| 7.4 | Node.js 22 LTS + pnpm 10+ | CiYml | runtime spec | フロー 2 |
| 7.5 | `pnpm build` は CI で実行しない (Vercel と重複回避) | CiYml | scope decision | — |
| 7.6 | テスト実行は本 spec では含めない | CiYml | scope decision | — |
| 7.7 | ブランチ保護ルール推奨を `docs/setup/github.md` に | GithubDoc | branch protection guidance | — |
| 8.1 | ローカル開発で apps/web から `@bulr/db` 経由で Neon dev branch に接続 | (existing DbClient + Local setup) | env loading | フロー 3 |
| 8.2 | `drizzle.config.ts` が `.env.local` を自動読込 | (existing DrizzleConfig from monorepo-foundation) | env loading | フロー 3 |
| 8.3 | `pnpm --filter @bulr/db push` で dev branch に反映 | NeonDoc, LocalDoc | command doc | フロー 3 |
| 8.4 | `pnpm --filter @bulr/db migrate` で production branch に履歴付き反映 | NeonDoc | command doc (実行は後続 spec) | — |
| 8.5 | ローカル setup フローを `docs/setup/local.md` に文書化 | LocalDoc | step-by-step doc | フロー 3 |
| 8.6 | `DATABASE_URL` を production branch にローカル接続しない警告 | LocalDoc | warning | — |
| 9.1 | `docs/setup/README.md` インデックス + 推奨実施順 | SetupReadme | navigation | フロー 1 |
| 9.2 | Owner 用チェックリスト | SetupReadme | checklist | フロー 1 |
| 9.3 | 各 setup ドキュメントは単一目的 | (全 setup docs) | doc structure | — |
| 9.4 | リポジトリルート `README.md` に setup ポインタ追記 | ReadmePointer | minimal change | — |
| 9.5 | steering 内容を setup docs で重複させない | (全 setup docs) | doc principle | — |
| 9.6 | 後続 spec が外部サービス追加時に新 setup md と checklist 更新 | SetupReadme | extension rule | — |
| 10.1 | sensitive 環境変数は `NEXT_PUBLIC_` 禁止、server-only | EnvVarsDoc, AnthropicDoc | security rule | — |
| 10.2 | `NEXT_PUBLIC_APP_URL` のみクライアント公開可 | EnvVarsDoc, EnvExampleRoot | comment | — |
| 10.3 | Vercel Production / Preview の env scope 分離 | VercelDoc, EnvVarsDoc | scope strategy | フロー 1 |
| 10.4 | `.env.local` の gitignore による誤コミット防止 | (existing GitignoreConfig) | gitignore | フロー 3 |
| 10.5 | 各シークレットのローテーション手順 | EnvVarsDoc, ResendDoc, AnthropicDoc | rotation procedure | — |
| 10.6 | `pnpm audit` CI step は強制 (PR merge ブロック) | CiYml, GithubDoc | branch protection | フロー 2 |

## Components and Interfaces

### Component Summary

| Component | Domain/Layer | Intent | Req Coverage | Key Dependencies (P0/P1) | Contracts |
|-----------|--------------|--------|--------------|--------------------------|-----------|
| EnvExampleRoot | Repo configuration | Stage 1 全環境変数 (9 個) を一元文書化 | 1.1, 1.2, 1.4, 1.7, 6.1, 10.2 | (none) | Documentation |
| EnvExampleWeb | Repo configuration | ローカル開発者用テンプレート | 1.3, 1.4, 8.1 | EnvExampleRoot (P0) | Documentation |
| SetupReadme | Documentation | セットアップインデックス + Owner チェックリスト | 9.1, 9.2, 9.6 | 各 setup ドキュメント (P0) | Documentation |
| VercelDoc | Documentation | Vercel プロジェクト初期化手順 + 環境変数登録 | 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.4, 3.5, 6.4, 10.3 | Vercel Hobby (P0)、EnvExampleRoot (P0) | Documentation |
| NeonDoc | Documentation | Neon プロジェクト + dev / production ブランチ + migration 戦略 | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 8.3, 8.4 | Neon Free (P0) | Documentation |
| ResendDoc | Documentation | Resend Free アカウント + API キー + テストドメイン | 4.1, 4.2, 4.3, 4.5, 4.6 | Resend Free (P0)、EnvExampleRoot (P0) | Documentation |
| AnthropicDoc | Documentation | Anthropic Console + API キー + 予算アラート | 5.1, 5.2, 5.4, 5.5, 10.1 | Anthropic Console (P0) | Documentation |
| GithubDoc | Documentation | GitHub Actions + ブランチ保護ルール | 7.7, 10.6 | GitHub (P0)、CiYml (P0) | Documentation |
| LocalDoc | Documentation | ローカル開発の `.env.local` 整備 + Drizzle 接続 | 8.1, 8.5, 8.6 | EnvExampleWeb (P0)、(existing DbClient/DrizzleConfig) (P0) | Documentation |
| EnvVarsDoc | Documentation | 環境変数早見表 + `NEXT_PUBLIC_` 規約 + ローテーション | 1.5, 1.7, 6.2, 10.1, 10.2, 10.3, 10.5 | EnvExampleRoot (P0) | Documentation |
| CiYml | CI/CD | typecheck + lint + audit の最小 GitHub Actions ワークフロー | 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.6 | GitHub Actions (P0)、`monorepo-foundation` の pnpm scripts (P0) | Service |
| ReadmePointer | Documentation | リポジトリルート README に setup ポインタ追記 | 9.4 | SetupReadme (P0) | Documentation |

### Configuration Components

#### EnvExampleRoot

| Field | Detail |
|-------|--------|
| Intent | Stage 1 で必要なすべての環境変数を一元文書化し、Owner と新規開発者が漏れなく準備できる状態を作る |
| Requirements | 1.1, 1.2, 1.4, 1.7, 6.1, 10.2 |

**Responsibilities & Constraints**
- リポジトリルート直下に `.env.example` を配置
- 含む変数 (Stage 1 確定 9 個):
  - `DATABASE_URL` (Neon Postgres、scope: Production = production branch、Preview = dev branch、Development = dev branch)
  - `BETTER_AUTH_SECRET` (Auth 暗号化キー、生成例: `openssl rand -hex 32`、全 scope)
  - `BETTER_AUTH_URL` (認証コールバック URL、Production = `https://<vercel-prod>.vercel.app`、Preview = `https://<vercel-preview>.vercel.app`、Development = `http://localhost:3000`)
  - `RESEND_API_KEY` (Magic Link 配信、全 scope で同じ Free プランキー)
  - `NEXT_PUBLIC_APP_URL` (アプリベース URL、`NEXT_PUBLIC_` プレフィックスでクライアント公開可、各 scope の URL に対応)
  - `ANTHROPIC_API_KEY` (Claude Sonnet 4.6、server-only、全 scope に登録)
  - `ADMIN_ALLOWED_EMAILS` (CSV 形式、例: `taro@example.com,hanako@example.com`、全 scope)
  - `ADMIN_BASIC_AUTH_USER` (Basic 認証ユーザー名、全 scope)
  - `ADMIN_BASIC_AUTH_PASSWORD` (Basic 認証パスワード、生成例: `openssl rand -base64 24`、全 scope)
- 各変数の前に 1-3 行コメントで (a) 用途、(b) 例・生成コマンド、(c) Production / Preview / Development scope を記述
- 実シークレット値は絶対に書かない (placeholder only)

**Dependencies**
- Outbound: なし (純粋にドキュメント)
- External: 後続 spec の実装者が `process.env.<変数名>` を読む際の唯一の真実

**Contracts**: Documentation [x]

##### Documentation Interface (`.env.example` 構造例)

```bash
# ─────────────────────────────────────────────────────────
# bulr Stage 1 環境変数 (.env.example)
# ─────────────────────────────────────────────────────────
# このファイルはコミット可。実際の値は .env.local (gitignore 対象) または
# Vercel 環境変数に登録すること。
# ─────────────────────────────────────────────────────────

# === DB ===
# Neon Postgres 接続文字列。
# Production scope = production branch、Preview / Development scope = dev branch。
# 取得手順: docs/setup/neon.md
DATABASE_URL=postgres://user:password@ep-xxx.neon.tech/bulr?sslmode=require

# === 認証 ===
# Better Auth の暗号化キー。生成: openssl rand -hex 32
# 全 scope で同じ値で良い (本番と Preview で意図的に分けたい場合のみ別値)
BETTER_AUTH_SECRET=replace-me-with-openssl-rand-hex-32

# 認証コールバック URL。各 scope の APP URL に合わせる。
# Production: https://<your-prod>.vercel.app
# Preview:    https://<vercel-preview-url>.vercel.app
# Development: http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000

# === メール配信 ===
# Resend Free プランの API キー。Stage 1 は全 scope 同じキー共有。
# 取得手順: docs/setup/resend.md
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx

# === アプリ ===
# クライアント側に公開される URL。NEXT_PUBLIC_ プレフィックス必須。
# 各 scope の APP URL に合わせる。
NEXT_PUBLIC_APP_URL=http://localhost:3000

# === LLM ===
# Anthropic Claude API キー (Sonnet 4.6)。server-only、絶対に NEXT_PUBLIC_ を付けない。
# 月額予算アラートを Anthropic Console で設定 ($300 警告、$500 停止)。
# 取得手順: docs/setup/anthropic.md
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx

# === 管理画面 ===
# 管理者メール許可リスト (CSV)。/admin にアクセスできるユーザー。
ADMIN_ALLOWED_EMAILS=owner@example.com,reviewer@example.com

# Basic 認証のユーザー名・パスワード。
# パスワード生成: openssl rand -base64 24
ADMIN_BASIC_AUTH_USER=admin
ADMIN_BASIC_AUTH_PASSWORD=replace-me-with-openssl-rand-base64-24
```

**Implementation Notes**
- Integration: 後続 spec の実装者は `process.env.<変数名>` を読む際にこのリストを参照する。新変数追加時は本ファイルへの追記を必須とする (Requirement 1.5)
- Validation: `cp .env.example apps/web/.env.local` してすべての値を埋め、`pnpm dev` が起動することで動作確認 (本スペックでは Owner が手動で実施)
- Risks: 実シークレット値を誤って書くと履歴に残る → PR レビュー時に必ず placeholder のみであることを確認

#### EnvExampleWeb

| Field | Detail |
|-------|--------|
| Intent | ローカル開発者が `cp` で雛形を取得できる、ルート `.env.example` の同期コピー |
| Requirements | 1.3, 1.4, 8.1 |

**Responsibilities & Constraints**
- `apps/web/.env.local.example` に配置 (Next.js が `apps/web/.env.local` を自動読込するため、ここに置く意義がある)
- 内容はリポジトリルート `.env.example` と同一 (差分が出ないよう、1 ファイルに統一する選択肢もあるが、Next.js 標準の `.env.local` 探索パスに合わせる)
- placeholder only

**Dependencies**
- Outbound: EnvExampleRoot (P0) — 同期元

**Contracts**: Documentation [x]

**Implementation Notes**
- Integration: `monorepo-foundation` で導入された `apps/web/next.config.ts` および `packages/db/drizzle.config.ts` がそれぞれ `apps/web/.env.local` を読む経路を想定
- Risks: ルート `.env.example` との同期がずれると混乱する → タスクで「ルートと web の両方を同時更新」を明記、env-vars.md にも規約として記載
- 代替案: 唯一の `.env.example` をルートに置き、`apps/web/.env.local` で symlink する案もあるが、Windows 開発者考慮と Next.js の標準探索を踏まえコピー方式を採用

### Documentation Components

#### SetupReadme

| Field | Detail |
|-------|--------|
| Intent | `docs/setup/` のインデックスと Owner 用チェックリストで、初期セットアップを迷わず完了させる |
| Requirements | 9.1, 9.2, 9.6 |

**Responsibilities & Constraints**
- 推奨実施順を明示: (1) Vercel → (2) Neon → (3) Resend → (4) Anthropic → (5) GitHub → (6) Local
- Owner 用チェックリスト (Markdown チェックボックス) を含む:
  ```
  - [ ] Vercel アカウント作成 + bulr-web プロジェクト作成 (Root Dir = apps/web)
  - [ ] Neon プロジェクト作成 + production branch DATABASE_URL 取得
  - [ ] Neon dev branch 作成 + DATABASE_URL 取得
  - [ ] Vercel に DATABASE_URL を Production / Preview の各 scope に登録
  - [ ] Resend アカウント作成 + RESEND_API_KEY 取得 + Vercel に登録
  - [ ] Anthropic Console + API キー取得 + 月額予算アラート設定 + Vercel に登録
  - [ ] BETTER_AUTH_SECRET 生成 + Vercel に登録
  - [ ] ADMIN_* 値生成 + Vercel に登録
  - [ ] GitHub ブランチ保護ルール設定 (main + CI 必須)
  - [ ] ローカル apps/web/.env.local を整備 + pnpm dev 動作確認
  ```
- 各 setup ドキュメントへのリンクと 1 行サマリー
- 後続 spec が新外部サービス導入時の追加規約を末尾に記載

**Contracts**: Documentation [x]

#### VercelDoc

| Field | Detail |
|-------|--------|
| Intent | Vercel プロジェクト初期化手順、Build 設定、環境変数登録手順を網羅する |
| Requirements | 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.4, 3.5, 6.4, 10.3 |

**Responsibilities & Constraints**
- 章構成:
  1. 前提 (Vercel Hobby プラン無料、GitHub アカウント必要)
  2. アカウント作成 + GitHub 連携手順
  3. プロジェクト作成 (`bulr-web`、Root Directory = `apps/web`)
  4. Build 設定:
     - Framework Preset: Next.js
     - Build Command: `cd ../.. && pnpm turbo build --filter=web` (monorepo ルートから実行)
     - Install Command: `cd ../.. && pnpm install --frozen-lockfile`
     - Output Directory: `.next` (Next.js デフォルト、変更不要)
  5. Production Branch を `main` に設定
  6. 環境変数登録 (Production / Preview / Development の 3 scope に対する各変数の割り当て表):
     | 変数名 | Production | Preview | Development |
     |---|---|---|---|
     | DATABASE_URL | production branch URL | dev branch URL | dev branch URL (任意) |
     | BETTER_AUTH_SECRET | 同じ値 | 同じ値 | 同じ値 |
     | BETTER_AUTH_URL | https://prod-url | https://preview-url (Vercel が ${VERCEL_URL} を提供) | http://localhost:3000 (.env.local 推奨) |
     | RESEND_API_KEY | 同じ Free key | 同じ | 同じ |
     | NEXT_PUBLIC_APP_URL | https://prod-url | preview URL | http://localhost:3000 |
     | ANTHROPIC_API_KEY | 同じキー | 同じ | 同じ |
     | ADMIN_ALLOWED_EMAILS | Owner email + reviewers | 同じ | 同じ |
     | ADMIN_BASIC_AUTH_USER | 同じ | 同じ | 同じ |
     | ADMIN_BASIC_AUTH_PASSWORD | 同じ強パスワード | 同じ | 同じ |
  7. 動作確認 (PR を立てて Preview URL がコメントされること、main マージで本番デプロイが起動すること)
  8. `vercel.json` 不要の判断と理由
  9. カスタムドメイン (`bulr.net` 等) は Stage 1 末期に必要なら追加 (リンクのみ)

**Dependencies**
- Outbound: EnvExampleRoot (環境変数リストの参照元)、Vercel ダッシュボード (P0)

**Contracts**: Documentation [x]

**Implementation Notes**
- Integration: Vercel ダッシュボードの UI 操作中心。スクリーンショットは付けず、文章で項目名を列挙 (Vercel UI 変更時の差分が小さいため)
- Risks: Build Command の `cd ../..` パターンが Vercel 上で動作するか、Owner が初回セットアップ時に検証する必要 (代替: `vercel.json` で明示)。Stage 1 では「ダッシュボード設定で試行 → 動かなければ `vercel.json` 作成」の段階的アプローチを採る

#### NeonDoc

| Field | Detail |
|-------|--------|
| Intent | Neon Postgres プロジェクト作成、dev / production 2 ブランチ運用、migration 戦略を文書化 |
| Requirements | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 8.3, 8.4 |

**Responsibilities & Constraints**
- 章構成:
  1. 前提 (Neon Free プラン、1 プロジェクト + 複数ブランチ可)
  2. アカウント作成 + `bulr` プロジェクト作成
  3. production branch (デフォルト) DATABASE_URL 取得手順
  4. dev branch 作成 (production からブランチ) + DATABASE_URL 取得手順
  5. ブランチ運用ルール:
     - production = 本番データの単一の真実
     - dev = 開発・スキーマ変更検証用、いつでも production からリブランチ可
     - Vercel Preview は dev DATABASE_URL を共有 (Preview 同士で DB 競合の可能性は受容)
  6. Migration workflow:
     - ローカルで schema 変更 → `pnpm --filter @bulr/db generate` で migration ファイル生成
     - dev branch には `pnpm --filter @bulr/db push` で高速反映 (履歴なし、開発反復用)
     - production branch には `pnpm --filter @bulr/db migrate` で履歴付き反映 (PR レビュー後 main マージ前 or 直後に Owner が実施)
  7. 警告: ローカル `.env.local` の `DATABASE_URL` を production branch に向けて誤書き込みしないこと (Owner ルール)
  8. Free プラン制限 (storage 0.5 GB、compute 100 hours/月) が Stage 1 規模で十分

**Contracts**: Documentation [x]

**Implementation Notes**
- Integration: `packages/db/drizzle.config.ts` の `dbCredentials.url` が `DATABASE_URL` を読む経路 (`monorepo-foundation` 既存ロジック)
- Risks: dev branch を production からリブランチすると過去の dev データが消える → 「dev はいつでも壊れて良い前提」を明文化
- Stage 2 検討: production branch IP 制限 (Vercel IP のみ許可)、自動バックアップ確認

#### ResendDoc

| Field | Detail |
|-------|--------|
| Intent | Resend Free アカウント作成、API キー取得、Stage 1 のテストドメイン利用方針 |
| Requirements | 4.1, 4.2, 4.3, 4.5, 4.6 |

**Responsibilities & Constraints**
- 章構成:
  1. 前提 (Resend Free プラン、100 通/日、月 3,000 通)
  2. アカウント作成
  3. API キー生成 (`re_xxxxxxxx` 形式)
  4. Vercel 環境変数 + ローカル `.env.local` への登録 (全 scope 同じキー)
  5. Stage 1 では Resend テストドメイン (`onboarding@resend.dev` 等) を `from` に使う方針
  6. カスタムドメイン認証 (DNS SPF / DKIM) は Stage 2 (`bulr.net` 接続時)
  7. Free プラン制限が Stage 1 規模 (月数百通の Magic Link) に対して十分
  8. トラブルシューティング: API キー漏洩時のローテーション (Resend ダッシュボードで再発行 → Vercel 環境変数更新 → 再デプロイ)

**Contracts**: Documentation [x]

#### AnthropicDoc

| Field | Detail |
|-------|--------|
| Intent | Anthropic Console アカウント作成、API キー取得、月額予算アラート設定 |
| Requirements | 5.1, 5.2, 5.4, 5.5, 10.1 |

**Responsibilities & Constraints**
- 章構成:
  1. 前提 (Anthropic Console、Claude Sonnet 4.6 利用)
  2. アカウント作成
  3. API キー生成 (`sk-ant-xxxxxxxx` 形式)
  4. Vercel 環境変数 + ローカル `.env.local` への登録 (全 scope 同じキー)
  5. **必須**: 月額予算アラート設定 ($300 で警告、$500 で停止)
  6. Stage 1 コスト目安 ($50-150/月、70 セッション × Sonnet 4.6) を提示
  7. **警告**: `ANTHROPIC_API_KEY` は server-only。`NEXT_PUBLIC_` を絶対に付けない、クライアントコードから絶対に参照しない
  8. トラブルシューティング: API キー漏洩時のローテーション + 予算超過時の挙動

**Contracts**: Documentation [x]

#### GithubDoc

| Field | Detail |
|-------|--------|
| Intent | GitHub Actions 利用に必要なリポジトリ設定とブランチ保護ルール推奨 |
| Requirements | 7.7, 10.6 |

**Responsibilities & Constraints**
- 章構成:
  1. GitHub Actions は本リポジトリで自動有効 (`.github/workflows/ci.yml` 配置で起動)
  2. ブランチ保護ルール推奨設定 (Owner が GitHub UI で手動設定):
     - `main` ブランチを保護対象に追加
     - 「Require a pull request before merging」を有効化
     - 「Require status checks to pass before merging」を有効化、必須 status check として `ci.yml` の job を指定 (typecheck / lint / audit)
     - 「Require branches to be up to date before merging」を有効化 (推奨)
     - 「Do not allow bypassing the above settings」を有効化 (Owner も含めて適用、Stage 1 では緩めて Owner 緊急 push を許容するか検討)
  3. CI 失敗時は merge 不可、これにより `pnpm audit` の moderate 以上 fail も merge ブロックされる
  4. Vercel との関係: Vercel デプロイの成否は branch protection には含めない (Vercel 側で Preview 失敗時に PR コメントで通知される)

**Contracts**: Documentation [x]

#### LocalDoc

| Field | Detail |
|-------|--------|
| Intent | ローカル開発者が `.env.local` を整備し、Drizzle で Neon dev branch に接続する手順 |
| Requirements | 8.1, 8.5, 8.6 |

**Responsibilities & Constraints**
- 章構成:
  1. 前提 (`monorepo-foundation` 完了済み、Owner から Neon dev DATABASE_URL を共有済み)
  2. 手順:
     - `cp apps/web/.env.local.example apps/web/.env.local`
     - 各値を記入 (Owner から共有された DATABASE_URL / RESEND_API_KEY / ANTHROPIC_API_KEY、自分で生成する BETTER_AUTH_SECRET 等)
     - `pnpm install` (リポジトリルート)
     - `pnpm dev` で `http://localhost:3000` 起動
     - `pnpm --filter @bulr/db push` で dev branch にスキーマ反映 (後続 spec が schema を追加した後)
  3. 警告: `DATABASE_URL` を production branch に向けないこと
  4. トラブルシューティング: `DATABASE_URL is required` エラー → `.env.local` 配置場所を確認

**Contracts**: Documentation [x]

#### EnvVarsDoc

| Field | Detail |
|-------|--------|
| Intent | 環境変数の早見表、`NEXT_PUBLIC_` 規約、シークレットローテーション手順を集約 |
| Requirements | 1.5, 1.7, 6.2, 10.1, 10.2, 10.3, 10.5 |

**Responsibilities & Constraints**
- 章構成:
  1. Stage 1 環境変数早見表 (変数名 / 用途 / scope / `NEXT_PUBLIC_` 可否 / 取得元 setup ドキュメント)
  2. `NEXT_PUBLIC_` 規約: クライアントバンドルに含まれるため公開可の値のみ。サーバー専用は絶対に付けない
  3. 後続 spec が新変数を追加する際の規約: ルート `.env.example` と `apps/web/.env.local.example` の両方を更新する
  4. シークレット強パスワード生成コマンド集:
     - `BETTER_AUTH_SECRET`: `openssl rand -hex 32`
     - `ADMIN_BASIC_AUTH_PASSWORD`: `openssl rand -base64 24`
  5. ローテーション手順 (各シークレットごとに):
     - Resend API キー: Resend ダッシュボードで再発行 → Vercel 環境変数更新 → 再デプロイ
     - Anthropic API キー: 同上 (Anthropic Console)
     - Better Auth Secret: ローテーション時は全セッション無効化される副作用を理解した上で実施
     - Admin Basic Auth Password: 同様に Vercel 環境変数を更新 → 再デプロイ

**Contracts**: Documentation [x]

#### ReadmePointer

| Field | Detail |
|-------|--------|
| Intent | リポジトリルート `README.md` に setup ポインタを最小限追記 |
| Requirements | 9.4 |

**Responsibilities & Constraints**
- `monorepo-foundation` が書いた既存 `README.md` の内容を保ったまま、「初期セットアップは `docs/setup/README.md` を参照」を 1-2 行追加するのみ
- 既存セクションを書き換えない、新セクションは追加可

**Contracts**: Documentation [x]

### CI/CD Components

#### CiYml

| Field | Detail |
|-------|--------|
| Intent | PR 時と main push 時に typecheck + lint + audit を自動実行する最小 GitHub Actions ワークフロー |
| Requirements | 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.6 |

**Responsibilities & Constraints**
- ファイル: `.github/workflows/ci.yml`
- トリガー: `pull_request` to `main` および `push` to `main`
- ジョブ構成 (単一 job 内で順次実行 or 並列 job 化、後者を推奨):
  - `setup` job: Node.js 22 LTS + pnpm 10 セットアップ + `pnpm install --frozen-lockfile`
  - `typecheck` job: `pnpm typecheck`
  - `lint` job: `pnpm lint`
  - `audit` job: `pnpm audit --audit-level=moderate`
- 各 job は `setup` 完了後に並列実行可能 (キャッシュ活用)
- `pnpm build` は CI で実行しない (Vercel が PR で実施するため)
- テスト実行は本スペックでは含めない (テストフレームワーク導入 spec で追加)

**Dependencies**
- Outbound: `monorepo-foundation` の pnpm scripts (`typecheck`、`lint`) (P0)
- External: GitHub Actions、`pnpm/action-setup`、`actions/setup-node`、`actions/checkout` (P0)

**Contracts**: Service [x] (CI ワークフロー)

##### Service Interface (`.github/workflows/ci.yml` 構造例)

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm audit --audit-level=moderate
```

- Preconditions: リポジトリに `package.json` (`monorepo-foundation` 提供) と各 workspace の typecheck / lint script が存在
- Postconditions: 全 step 成功で exit 0、いずれか失敗で exit 非 0 → GitHub PR チェックが赤
- Invariants: シークレットを CI ログに出力しない (今は使わないが将来 secrets 追加時に注意)

**Implementation Notes**
- Integration: `monorepo-foundation` の `pnpm typecheck` / `pnpm lint` がエラーなく通る前提
- Validation: 本スペック完了後に test PR を作成して CI が走ることを確認
- Risks:
  - `pnpm audit` が moderate 脆弱性を新たに検出した場合、PR が止まる → 本スペック完了直後に脆弱性が出る可能性は低いが、出た場合は依存パッケージ更新で対応
  - 並列 job 化すると workflow が複雑化する → Stage 1 では単一 job で順次実行を採用 (`ci` job 内に複数 step)。並列化は必要になった時点で再検討

## Data Models

本スペックでは「環境変数の構造」と「Vercel 環境変数 scope」のみがデータと言える。アプリケーションテーブル定義 (`assessment_session` 等) は対象外 (`monorepo-foundation` の Out of Boundary、後続 spec が追加)。

### Logical Data Model（環境変数）

| Variable | Type | Source | Vercel Production | Vercel Preview | Vercel Development | Local `.env.local` | NEXT_PUBLIC_ |
|----------|------|--------|-------------------|----------------|--------------------|--------------------| ---|
| `DATABASE_URL` | string (URL) | Neon | production branch | dev branch | dev branch (任意) | dev branch | NO |
| `BETTER_AUTH_SECRET` | string (hex 32) | `openssl rand -hex 32` | 同値 | 同値 | 同値 | 同値 | NO |
| `BETTER_AUTH_URL` | string (URL) | scope ごとに調整 | https prod | preview URL | http://localhost:3000 | http://localhost:3000 | NO |
| `RESEND_API_KEY` | string (`re_*`) | Resend | 同 Free key | 同 | 同 | 同 | NO |
| `NEXT_PUBLIC_APP_URL` | string (URL) | scope ごとに調整 | https prod | preview URL | http://localhost:3000 | http://localhost:3000 | YES |
| `ANTHROPIC_API_KEY` | string (`sk-ant-*`) | Anthropic | 同キー | 同 | 同 | 同 | NO |
| `ADMIN_ALLOWED_EMAILS` | string (CSV) | Owner | 本番許可リスト | 同 (Stage 1 簡略化) | 同 | 同 | NO |
| `ADMIN_BASIC_AUTH_USER` | string | Owner | 共通値 | 同 | 同 | 同 | NO |
| `ADMIN_BASIC_AUTH_PASSWORD` | string | `openssl rand -base64 24` | 強パスワード | 同 | 同 | 同 | NO |

### Schema location

- リポジトリルート `.env.example` (placeholder + コメント)
- `apps/web/.env.local.example` (同期コピー)
- Vercel 環境変数 (実値、ダッシュボードで管理)
- ローカル `apps/web/.env.local` (gitignore、開発者個別)

### Out of scope (後続 spec で定義)

- DB アプリケーションテーブル (`user_profile`、`assessment_session` 等)
- DB の seed データ (57 状況パターン)

## Error Handling

### Error Strategy

本スペックは設定とドキュメント中心のため、ランタイムエラーは限定的:

- **`DATABASE_URL` 未設定エラー**: `monorepo-foundation` で実装済みの `packages/db/src/client.ts` が起動時に `throw new Error('DATABASE_URL is required')` を発行 (Fail Fast)。本スペックは `.env.local` / Vercel 環境変数で `DATABASE_URL` を必ず提供する責任を持つ。
- **CI 失敗 (typecheck / lint / audit)**: GitHub Actions が exit 非 0 で PR チェックを失敗させる。Owner / 開発者は Logs で原因確認 → 修正 → 再 push。
- **Vercel ビルド失敗**: Vercel ダッシュボードと PR コメントで通知。Owner が Vercel Logs で原因確認 → 修正。
- **Resend / Anthropic / Neon API 障害**: 本スペックでは API 呼び出しを行わないため発生しない (後続 spec の責務)。

### Error Categories and Responses

- **環境変数欠落**: 起動時に明示的エラー → 開発者は `docs/setup/local.md` のトラブルシューティングを参照
- **CI 設定不備**: 例えば `pnpm` バージョン不一致 → ci.yml の `pnpm/action-setup` の `version: 10` を確認
- **`pnpm audit` で脆弱性検出**: 該当パッケージを更新 (推奨) または audit `--audit-level=high` への一時緩和 (非推奨、最終手段)
- **シークレット誤コミット**: `.gitignore` で `.env.local` / `.env*.local` を除外。万一コミットされた場合は: (1) git history を `git filter-branch` 等で除去、(2) 該当シークレットを即座にローテーション (`docs/setup/env-vars.md` のローテーション手順に従う)

### Monitoring

本スペックではアプリケーションモニタリングは導入しない (Stage 2 で PostHog / Sentry / Helicone 検討)。Vercel 標準ダッシュボードと Anthropic Console での手動コスト確認のみ。

## Testing Strategy

本スペックは設定とドキュメントが中心のため、自動テストは導入しない。動作確認は Owner と新規開発者の Manual Smoke Tests で行う。

### Default sections

- **Unit Tests**: 本スペックでは導入しない
- **Integration Tests**: 本スペックでは導入しない
- **E2E/UI Tests**: 本スペックでは導入しない
- **Manual Smoke Tests**（本スペックの完了確認、`tasks.md` の Validation フェーズで実施）:
  1. リポジトリルート `.env.example` を `cat` で開き、Stage 1 環境変数 9 個がすべて記載され、各々にコメントがあることを確認
  2. `apps/web/.env.local.example` がルート `.env.example` と同期していることを diff で確認
  3. `docs/setup/README.md` を開き、推奨実施順とチェックリストが含まれることを確認
  4. `docs/setup/{vercel,neon,resend,anthropic,github,local,env-vars}.md` 7 ファイルがすべて存在し、各々が章立てされていることを確認
  5. `.github/workflows/ci.yml` を開き、`pull_request` トリガー、Node.js 22、pnpm 10、`typecheck` / `lint` / `audit` step が記載されていることを確認
  6. test PR を作成し、GitHub Actions の CI が走り、各 step が成功 (or 既知の audit 警告のみ) で exit することを確認
  7. (Owner 実施) Vercel プロジェクトを `docs/setup/vercel.md` 通りに作成し、PR で Preview デプロイ + main マージで本番デプロイが起動することを確認
  8. (Owner 実施) Neon dev / production の 2 ブランチ DATABASE_URL が Vercel に登録され、Vercel Preview から dev branch にクエリ可能なことを (`assessment-engine` spec 実装後に) 確認
  9. (Owner 実施) `cp apps/web/.env.local.example apps/web/.env.local` してすべての値を埋め、`pnpm dev` で http://localhost:3000 が動作することを確認
  10. (Owner 実施) `pnpm --filter @bulr/db push` が dev branch に対してエラーなく完了すること (空スキーマでも成功する想定)

> 上記の Manual Smoke Tests を `tasks.md` の Validation フェーズタスクとして配置する。

## Security Considerations

`security.md` の Stage 1 必須項目のうち、本スペックで担う部分:

- **シークレット環境変数分離**: Vercel Production / Preview を分離 scope で登録 (Requirement 10.3)、Production = production branch / Preview = dev branch DB
- **`NEXT_PUBLIC_` 規約**: `NEXT_PUBLIC_APP_URL` 以外はクライアント公開禁止 (Requirement 10.1, 10.2)
- **`.env.local` の gitignore**: `monorepo-foundation` で導入済み、本スペックで存在を確認 (Requirement 10.4)
- **`pnpm audit --audit-level=moderate` を CI で強制**: PR で moderate 以上検出時 fail → branch protection で merge ブロック (Requirement 10.6)
- **シークレット強パスワード生成**: `openssl rand` 系コマンドを `docs/setup/env-vars.md` で文書化 (Requirement 6.2)
- **シークレットローテーション手順**: 各シークレットの再発行 → Vercel 更新 → 再デプロイ手順を文書化 (Requirement 10.5)

本スペックでは認証ロジック / Zod 入力検証 / SQL injection 対策 / LLM 防御は範囲外 (後続 spec で対応)。

### 追加検討 (Stage 2)

- gitleaks / Dependabot / CodeQL の有効化
- Neon production branch IP 制限 (Vercel IP のみ)
- 監査ログ
- DB IP allowlist

## Performance & Scalability

本スペックは性能要求対象外 (設定とドキュメント中心)。間接的な性能影響:

- **Vercel Hobby プラン制限**: 100 GB-hours/月 の Function 実行時間。Stage 1 規模 (70 セッション × 30-40 分) では十分余裕。Stage 2 で Pro 検討。
- **Neon Free プラン制限**: storage 0.5 GB、compute 100 hours/月。Stage 1 規模で十分。
- **Resend Free プラン制限**: 100 通/日。Stage 1 規模 (Magic Link 月数百通) で十分。
- **CI 実行時間**: typecheck + lint + audit で 1-2 分程度。GitHub Actions 無料枠 2,000 分/月 の範囲内。

## Migration Strategy

`monorepo-foundation` 完了直後の状態に対する追加であり、既存ファイルの破壊的変更はなし。`README.md` のみ最小追記 (1-2 行)。Owner と既存開発者への影響:

- 既存開発者 (もしいれば): `git pull` 後に `cp apps/web/.env.local.example apps/web/.env.local` を実行 → 各値を記入 (Owner から共有)。`pnpm install` 不要 (新規パッケージ追加なし)。
- Owner: 本スペック完了後、`docs/setup/README.md` のチェックリストに沿って Vercel / Neon / Resend / Anthropic / GitHub の手動セットアップを実施。

## Supporting References

- 参照プロジェクト: `/Users/takaaki.tanno/Documents/workspace/github/dishxdish-app-mvp/.kiro/specs/multi-env-infrastructure/` (4 環境構成、bulr では 2 環境に簡略化)
- steering: `.kiro/steering/tech.md`、`.kiro/steering/security.md`、`.kiro/steering/structure.md`
- 上流 spec: `.kiro/specs/monorepo-foundation/design.md` (drizzle.config.ts、packages/db/src/client.ts、`.gitignore` の `.env.local` 除外を導入済み)
- brief: `.kiro/specs/multi-env-infrastructure/brief.md`
- 公式ドキュメント:
  - Vercel Monorepo: https://vercel.com/docs/monorepos
  - Neon Branching: https://neon.tech/docs/introduction/branching
  - Resend Send Email: https://resend.com/docs/send-with-nodejs
  - Anthropic Console: https://console.anthropic.com/
  - GitHub Actions for Node.js: https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs
