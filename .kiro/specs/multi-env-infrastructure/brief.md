# Brief: multi-env-infrastructure

## Problem

`monorepo-foundation` で `pnpm dev` がローカルで動く状態は作るが、Vercel デプロイ・Neon 接続・Resend 統合・環境変数管理の規約がない。Stage 1 のゴール（ベトナム人 50 + 日本人 20 への配信）を達成するには、本番デプロイと PR ごとの Preview 環境が必須。

## Current State

- `monorepo-foundation` 完了後: `apps/web` がローカル起動可能、`packages/db` に Drizzle 初期化あり、しかし DB 接続文字列なし、Vercel 未設定、Resend API キー未設定
- 参照プロジェクト `dishxdish-app-mvp` が `multi-env-infrastructure` spec で 4 環境構成（local / dev / preview / prod）を実装済み。bulr では Stage 1 の規模感に合わせて 2 環境構成（dev branch + production）に簡略化

## Desired Outcome

- Vercel プロジェクト `bulr-web` が作成され、Root Directory が `apps/web` に設定されている
- Neon Postgres に `dev` ブランチと `production` ブランチが作成され、それぞれの `DATABASE_URL` が Vercel 環境変数に登録されている（Preview = dev、Production = production）
- Resend API キーが取得され、Vercel に登録されている
- ルートに `.env.example` があり、必要な全環境変数が文書化されている
- PR を立てると Vercel Preview デプロイが自動実行される
- main ブランチへのマージで本番デプロイが自動実行される
- ローカル開発で `.env.local` から DATABASE_URL（dev branch）を読んで Drizzle 接続が成立する
- `pnpm drizzle-kit push` で dev branch にスキーマが反映できる
- `pnpm drizzle-kit migrate` で production branch にマイグレーション履歴を残して反映できる

## Approach

dishxdish の `multi-env-infrastructure` spec から「Vercel + Neon ブランチ分離 + 環境変数規約」の核を抽出し、Stage 1 用に 2 環境構成（local / dev / production の 3 段階、Preview は dev DB を共有）に簡略化。

- **環境マッピング**:
  - **local**: `.env.local` で dev branch DATABASE_URL を参照（開発者ローカル）
  - **Vercel Preview**: PR ごとの自動 Preview デプロイ、dev branch DATABASE_URL を共有
  - **Vercel Production**: main マージで本番デプロイ、production branch DATABASE_URL
- **Neon ブランチ運用**: dev branch でスキーマ変更を試し、本番反映時は drizzle-kit migrate で履歴を残す
- **Resend**: Free プラン（100 通/日）で Stage 1 は十分。本番ドメイン認証は Stage 2 で

## Scope

- **In**:
  - Vercel プロジェクト初期化手順の文書化（`docs/setup/vercel.md` 等、Owner が手動実施する手順を明記）
  - Neon Postgres プロジェクト + dev/production ブランチ作成手順の文書化
  - Resend アカウント作成 + API キー取得手順の文書化
  - `.env.example` 作成（DATABASE_URL / BETTER_AUTH_SECRET / BETTER_AUTH_URL / RESEND_API_KEY / NEXT_PUBLIC_APP_URL / ANTHROPIC_API_KEY / ADMIN_ALLOWED_EMAILS / ADMIN_BASIC_AUTH_USER / ADMIN_BASIC_AUTH_PASSWORD）
  - `apps/web/.env.local.example` 作成（ローカル開発者向け）
  - `packages/db/drizzle.config.ts` の DATABASE_URL 読み取り設定
  - `packages/db/src/client.ts` で環境別 DB クライアント初期化
  - Vercel ビルド設定（root directory = `apps/web`、Build Command、Install Command）
  - `vercel.json`（必要なら）または Vercel ダッシュボード設定の文書化
  - `.github/workflows/ci.yml`（最小限：型チェック + lint）
  - 環境変数を Vercel に登録する手順の文書化
  - drizzle-kit push（dev branch）と migrate（production branch）の運用手順
  - README.md にセットアップ手順を簡潔に追記

- **Out**:
  - Better Auth 設定・Magic Link 実装（authentication spec）
  - DB スキーマ実体（後続 spec）
  - 監視スタック（Stage 2: PostHog / Sentry / Helicone）
  - Cloudflare R2（Stage 1 で画像不要）
  - Custom domain の SSL 設定（Stage 1 は Vercel 標準ドメインで十分）
  - staging 環境（Stage 1 は dev branch で十分、staging は Stage 2）
  - Resend Pro プラン（Stage 1 は Free で十分）
  - Resend のカスタムドメイン認証（Stage 2、Stage 1 は Resend のテストドメインで OK）

## Boundary Candidates

- Vercel プロジェクト設定（手動セットアップ手順 + 設定ファイル）
- Neon ブランチ運用規約（dev / production の使い分け、migration 戦略）
- 環境変数規約（`.env.example`、Vercel 設定、ローカル `.env.local`）
- DB クライアント初期化（`packages/db/src/client.ts`）
- CI 最小設定（GitHub Actions: typecheck + lint）

## Out of Boundary

- Better Auth セッション・Cookie 設定（authentication spec）
- DB テーブル定義（assessment-pattern-seed、assessment-engine spec）
- LLM 実装（assessment-engine spec）
- 管理画面実装（admin-review-panel spec）
- 詳細な観測スタック構築（Stage 2）
- Resend のメールテンプレート実装（authentication spec で Magic Link メール本文を作成）

## Upstream / Downstream

- **Upstream**:
  - `monorepo-foundation`（packages/db と apps/web が存在する前提）
- **Downstream**:
  - `authentication`（Resend と Better Auth 環境変数を使う、DB 接続を使う）
  - `assessment-pattern-seed`（drizzle-kit push で dev branch に投入する運用）
  - `assessment-engine`（Anthropic API キーを使う、DB 接続を使う、Vercel Preview で動作確認）
  - `admin-review-panel`（Basic 認証用環境変数を使う）

## Existing Spec Touchpoints

- **Extends**: なし
- **Adjacent**:
  - `monorepo-foundation`: ビルド設定との整合（Vercel が turbo build を実行できる）
  - `authentication`: 環境変数規約を共有（authentication が必要な変数を `.env.example` に追記する形）

## Constraints

- **`tech.md` 準拠**:
  - Vercel Hobby プラン（Stage 1 のコスト目安に合わせる）
  - Neon Postgres サーバーレス、dev / production 2 ブランチ運用
  - Resend Free プラン（100 通/日まで、Stage 1 では十分）
  - 環境変数は `tech.md` の Stage 1 環境変数リストに準拠
- **`security.md` 準拠**:
  - シークレットは Vercel 環境変数で本番・Preview を分離管理
  - `NEXT_PUBLIC_` プレフィックスは公開して良い値のみ
  - `.env.local` を `.gitignore` に含める（`monorepo-foundation` で設定済み想定、ここで再確認）
  - `pnpm audit --audit-level=moderate` を CI に組み込み
- **Vercel Preview の扱い**: PR ごとの Preview は dev branch DATABASE_URL を共有する。本番データを触らせない
- **ドメイン**: Stage 1 は Vercel 標準ドメイン（`bulr-web.vercel.app` 等の自動生成名）で OK。`bulr.net` 等のカスタムドメインは Stage 1 末で必要なら追加
- **手動セットアップが残る**: Vercel / Neon / Resend のアカウント作成と初期設定は人間が手動実施する。spec ではその手順を文書化し、設定ファイル + .env.example で再現性を保つ
