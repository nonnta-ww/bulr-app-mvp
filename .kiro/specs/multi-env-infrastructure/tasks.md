# Implementation Plan — multi-env-infrastructure

> 本スペックは bulr Stage 1 のインフラ基盤（Vercel + Neon + Resend + OpenAI + Anthropic + Vercel Blob + Vercel Cron + 環境変数 + CI）を確立する。すべての作業は `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/` 配下で行う。
>
> 本スペックは **設定ファイル + 文書化された手動セットアップ手順** のみを所有する。route handler 実装、LLM 関数本体、認証ロジック、DB スキーマ実体は **後続 spec の責務**。
>
> 完了の最終条件: (a) `.env.example` / `apps/web/.env.local.example` / `apps/web/vercel.json` / `.github/workflows/ci.yml` / `docs/setup/*.md` が揃い、(b) PR を立てると CI（typecheck + lint + audit）が成功し、(c) Owner が docs/setup/ の手順通りに Vercel / Neon / Resend / OpenAI / Anthropic / Vercel Blob / CRON_SECRET をセットアップ完了し、(d) main ブランチ push で `https://bulr-web.vercel.app/` が HTTP 200 を返し、Vercel Cron Jobs ダッシュボードに `/api/cron/audio-purge` が登録されていること。

> **実装状況 (2026-05-14 時点)**: セクション 1〜4（設定ファイル・ドキュメント・CI・統合検証、計 24 サブタスク）は完了。spec.json は `phase: implemented`。ただしセクション 5（Owner 手動クラウドセットアップ: Neon / Vercel / Resend / OpenAI / Anthropic / Vercel Blob のアカウント作成と API キー発行）は **未実施**。現在の開発はローカル Docker Postgres で進行中。クラウドデプロイ前にセクション 5 を `docs/setup/` の手順通りに完了させること。

## Foundation: 環境変数規約と設定ファイル

> 1.x の各サブタスクは独立したファイルを作成・更新するため `(P)` で並列実行可能。

- [x] 1. 環境変数規約と設定ファイルの整備
- [x] 1.1 (P) ルート `.env.example` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/.env.example` を新規作成
  - 12 変数を以下の順序・グループでプレースホルダ + コメント付きで記載:
    - **共通**: `DATABASE_URL`（Neon Postgres、サーバー専用、Production = production branch URL / Preview = dev branch URL）、`BETTER_AUTH_SECRET`（Auth 暗号化キー、サーバー専用、Production / Preview 両方）、`BETTER_AUTH_URL`（認証コールバック URL、サーバー専用、Production / Preview 別）、`RESEND_API_KEY`（Magic Link 配信、サーバー専用、Production / Preview 両方）、`NEXT_PUBLIC_APP_URL`（アプリのベース URL、クライアント露出可、Production / Preview 別）
    - **LLM**: `ANTHROPIC_API_KEY`（Claude API、サーバー専用、Production / Preview 両方）、`OPENAI_API_KEY`（Whisper API、サーバー専用、Production / Preview 両方）
    - **ストレージ**: `BLOB_READ_WRITE_TOKEN`（Vercel Blob、サーバー専用、Vercel Blob ストア作成時に自動付与、手動設定不要）
    - **Cron**: `CRON_SECRET`（Vercel Cron 認証、サーバー専用、Production / Preview 両方）
    - **管理画面**: `ADMIN_ALLOWED_EMAILS`（管理者メール許可リスト CSV、サーバー専用、Production / Preview 両方）、`ADMIN_BASIC_AUTH_USER`（Basic 認証ユーザー名、サーバー専用、Production / Preview 両方）、`ADMIN_BASIC_AUTH_PASSWORD`（Basic 認証パスワード、サーバー専用、Production / Preview 両方）
  - 各変数の値はプレースホルダ（例: `postgresql://user:password@host/dbname?sslmode=require`、`your-32-byte-base64-secret-here`、`re_xxxxxxxxxxxxxxxx`、`sk-ant-xxxxxxxxxxxxxxxx`、`sk-xxxxxxxxxxxxxxxx`、`vercel_blob_rw_xxxxxxxx`、`admin@example.com,owner@example.com` 等）で記載し、実シークレットを含めない
  - ファイル冒頭にコメントで「このファイルは git にコミットされます。実値を絶対に書かないこと」「Vercel 環境変数登録の参考とし、ローカルでは `cp .env.example .env.local` でコピー後に値を埋めること」を明記
  - 観測可能な完了状態: `.env.example` が存在し、12 変数すべてがプレースホルダ + コメントで網羅されている
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.8, 9.3, 10.2, 10.7_
  - _Boundary: EnvExampleConfig_

- [x] 1.2 (P) `apps/web/.env.local.example` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/.env.local.example` を新規作成
  - ルート `.env.example` と同じ 12 変数を含めるが、ローカル開発特化のデフォルトコメントを追加:
    - `BETTER_AUTH_URL=http://localhost:3000`（コメントで「ローカルではこれで OK、Vercel では各環境のドメインに合わせる」を明示）
    - `NEXT_PUBLIC_APP_URL=http://localhost:3000`（同上）
    - `DATABASE_URL` のコメントで「Neon dev branch の URL を入れる、production branch の URL は絶対にローカルに入れない」を明記
  - ファイル冒頭にコメントで「このファイルは雛形。`cp apps/web/.env.local.example apps/web/.env.local` でコピーして値を埋める。.env.local は .gitignore で除外される」を明記
  - 観測可能な完了状態: `apps/web/.env.local.example` が存在し、12 変数すべてとローカル開発向けコメントが含まれている
  - _Requirements: 1.5, 1.7, 3.9, 4.6_
  - _Boundary: WebEnvLocalExample_

- [x] 1.3 (P) `.gitignore` の `.env` 除外確認と必要時の追記
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/.gitignore` を確認
  - `.env`、`.env.local`、`.env.*.local` の 3 パターンが含まれていない場合のみ追記（`monorepo-foundation` で `.env*.local` は設定済みのため、`.env` 単体と `.env.local` の明示的追加が必要かを確認）
  - 観測可能な完了状態: `.gitignore` に `.env`、`.env.local`、`.env.*.local` の 3 パターンが必ず含まれている
  - _Requirements: 1.6, 10.1_
  - _Boundary: EnvExampleConfig_

- [x] 1.4 `apps/web/vercel.json` を作成（Vercel Cron 定義）
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/vercel.json` を新規作成
  - 内容は以下のみ:
    ```json
    {
      "crons": [
        {
          "path": "/api/cron/audio-purge",
          "schedule": "0 18 * * *"
        }
      ]
    }
    ```
  - `headers` / `rewrites` / `redirects` 等の余分な設定は持たない
  - 観測可能な完了状態: `apps/web/vercel.json` が JSON として有効で、`crons` 配列に 1 エントリ（path / schedule）が含まれている。`jq '.crons[0].schedule' apps/web/vercel.json` が `"0 18 * * *"` を返す
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Boundary: VercelJsonConfig_

- [x] 1.5 `packages/db/drizzle.config.ts` の DATABASE_URL 読み取り設定を有効化
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/packages/db/drizzle.config.ts` を確認・更新
  - `monorepo-foundation` で `dbCredentials.url: process.env.DATABASE_URL ?? ''` の形になっている場合、`process.env.DATABASE_URL!`（non-null assertion）または `process.env.DATABASE_URL` 未定義時に明示的に throw する形に変更
  - 推奨実装例:

    ```typescript
    import { defineConfig } from 'drizzle-kit';

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is not defined. Set it in .env.local or Vercel environment variables.',
      );
    }

    export default defineConfig({
      schema: './src/schema/*.ts',
      out: './drizzle',
      dialect: 'postgresql',
      dbCredentials: { url: databaseUrl },
    });
    ```

  - `monorepo-foundation` の `packages/db/src/client.ts` で既に `DATABASE_URL` 未定義時 throw が実装済みであることを確認、本タスクでは `client.ts` は触らない
  - 観測可能な完了状態: DATABASE_URL を環境変数に設定した状態で `pnpm --filter @bulr/db generate` が空 schema でも実行成功し、未設定で実行すると drizzle-kit が即座にエラーを返す
  - _Requirements: 3.4, 3.5, 3.9, 1.7_
  - _Boundary: DrizzleConfigUpdate_
  - _Depends: なし（monorepo-foundation 完了済み前提）_

## Core: ドキュメント整備

> 2.x の各サブタスクは独立したマークダウンファイルを作成するため `(P)` で並列実行可能。各ドキュメントは `tech.md` および `security.md` の関連箇所と整合させる。

- [x] 2. セットアップ手順ドキュメントの整備
- [x] 2.1 (P) `docs/setup/README.md` インデックスを作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/README.md` を新規作成
  - 内容:
    - 環境マッピング規約（local / Vercel Preview / Vercel Production の 3 段階、staging なし、Stage 1 では 2 環境構成）の明示
    - 推奨実行順序のチェックリスト（Owner 手動実施前提）:
      1. Neon プロジェクト作成 + dev / production ブランチ作成（`./neon.md`）
      2. Resend アカウント作成 + RESEND_API_KEY 取得（`./resend.md`）
      3. OpenAI アカウント作成 + OPENAI_API_KEY 取得（`./openai.md`）
      4. Anthropic アカウント作成 + ANTHROPIC_API_KEY 取得（`./anthropic.md`）
      5. Vercel プロジェクト `bulr-web` 作成（`./vercel.md`）
      6. Vercel Blob ストア `bulr-audio` 作成（`./vercel-blob.md`）
      7. CRON_SECRET 生成 + Vercel 登録（`./cron.md`）
      8. すべての環境変数を Vercel に登録（`./env-vars.md`）
      9. CI 動作確認（`./ci.md`）
      10. drizzle-kit 初回 push（`./drizzle-kit.md`、初回スキーマ確定は後続 spec）
    - 「すべての手順は Owner が手動実施する。本スペックでは自動化スクリプトを提供しない」を明示
    - 各サブドキュメントへの相対リンク
  - 観測可能な完了状態: `docs/setup/README.md` がリポジトリに存在し、10 ステップの推奨順序と各ドキュメントへのリンクが含まれている
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 9.1, 9.2_
  - _Boundary: DocsSetupReadme_

- [x] 2.2 (P) `docs/setup/env-vars.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/env-vars.md` を新規作成
  - 12 環境変数の総合リファレンステーブル（変数名 / 用途 / 参照元 spec / 公開可否 / Vercel 登録先 / 値の取得元 の列を含む）
  - DATABASE_URL の Production = production branch / Preview = dev branch の使い分けを強調セクションで明示（誤って production URL を Preview に登録すると本番 DB を破壊するリスクを警告）
  - すべての NEXT*PUBLIC* 以外の変数がサーバー専用である旨を明示（`security.md` L203-209 準拠）
  - 「環境変数を追加する場合は、ルート `.env.example` と `apps/web/.env.local.example` の両方を更新すること」のチェックリストを末尾に追加
  - 観測可能な完了状態: `docs/setup/env-vars.md` が存在し、12 変数すべてのリファレンステーブルと DATABASE_URL の使い分け警告が含まれている
  - _Requirements: 1.4, 1.8, 4.5, 4.7, 5.6, 5.7, 9.1, 9.3, 9.4, 9.6, 10.3, 10.5_
  - _Boundary: EnvVarsDoc_

- [x] 2.3 (P) `docs/setup/vercel.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/vercel.md` を新規作成
  - Vercel プロジェクト `bulr-web` 作成手順（Vercel Hobby プラン前提）:
    - GitHub 連携でリポジトリ `bulr-app-mvp` を import
    - Project Name: `bulr-web`
    - Root Directory: `apps/web`
    - Framework Preset: Next.js
    - Install Command: `pnpm install`（または Vercel デフォルトの monorepo 検出）
    - Build Command: Vercel デフォルト（`next build` 相当、Turborepo を使う場合は `cd ../.. && pnpm build --filter=@bulr/web` も可、Vercel が monorepo を自動検出する場合はそのまま）
    - Output Directory: Next.js デフォルト（`.next`）
  - 環境変数登録手順（Production / Preview の使い分け、`docs/setup/env-vars.md` を参照リンク）
  - GitHub 連携（main push で Production デプロイ、PR で Preview デプロイ）の自動化確認手順
  - 完了確認方法: main ブランチに任意のコミットを push し、Vercel Dashboard の Deployments で Production デプロイが成功、`https://bulr-web.vercel.app/`（または Vercel が自動生成するドメイン）が HTTP 200 を返すこと
  - 観測可能な完了状態: `docs/setup/vercel.md` が存在し、上記すべての手順と完了確認方法が記述されている
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 8.5_
  - _Boundary: VercelSetupDoc_

- [x] 2.4 (P) `docs/setup/neon.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/neon.md` を新規作成
  - Neon プロジェクト作成手順（Free プラン前提）:
    - Neon Console でプロジェクト `bulr` を作成、Region は東京（または大阪、Vercel リージョンと整合）
    - production branch がプライマリとして自動作成される
    - dev ブランチを production からの分岐として作成（Branches タブから "Create branch" → name: `dev`、parent: `production`）
  - 各ブランチの DATABASE_URL 取得手順:
    - Connection Details で Pooled Connection を選択（Vercel サーバーレス推奨）
    - production branch の URL を取得 → Vercel Production 環境変数 `DATABASE_URL` に登録
    - dev branch の URL を取得 → Vercel Preview 環境変数 `DATABASE_URL` に登録、ローカル `.env.local` の `DATABASE_URL` にも同じ値を設定
  - 「Production には production branch の URL のみ、Preview には dev branch の URL のみを登録する」ことを警告セクションで強調
  - drizzle-kit migrate 実行時に unpooled（direct connection）が必要な場合の注記を末尾に追加（必要時に Owner が判断、Stage 1 ではまず pooled で開始）
  - 完了確認方法: Vercel 環境変数で DATABASE_URL が Production / Preview それぞれに別の値で登録されていること
  - 観測可能な完了状態: `docs/setup/neon.md` が存在し、ブランチ作成・URL 取得・Vercel 登録の手順と警告セクションが含まれている
  - _Requirements: 3.1, 3.2, 3.3, 9.4, 9.6, 8.5_
  - _Boundary: NeonSetupDoc_

- [x] 2.5 (P) `docs/setup/resend.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/resend.md` を新規作成
  - Resend Free アカウント作成 + API キー取得手順:
    - Resend サインアップ（Free プラン、100 通/日）
    - API Keys ページから新規キー作成、`RESEND_API_KEY` として控える
    - Stage 1 では Resend のテストドメイン（`onboarding@resend.dev` 等）を送信元に使用、カスタムドメイン認証は Stage 2 で対応する旨を明示
  - Vercel 環境変数 `RESEND_API_KEY` を Production / Preview 両方に登録
  - ローカル `.env.local` にも同じ値を設定（Magic Link のローカル動作確認時に使用）
  - 完了確認方法: Resend ダッシュボードに API キーが表示され、Vercel 環境変数に登録されていること
  - 観測可能な完了状態: `docs/setup/resend.md` が存在し、Free プラン + API キー取得 + Vercel 登録手順が記述されている
  - _Requirements: 4.1, 4.2, 4.5, 4.7, 8.5_
  - _Boundary: ResendSetupDoc_

- [x] 2.6 (P) `docs/setup/openai.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/openai.md` を新規作成
  - OpenAI アカウント作成 + API キー取得手順:
    - OpenAI Platform でアカウント作成、Billing 情報を登録（Whisper API は従量課金）
    - API Keys ページから新規キー作成、`OPENAI_API_KEY` として控える
    - Whisper API（`whisper-1` モデル）の利用前提を明示
  - Usage Limit の設定（Settings → Limits）: 月 $50-100 推奨（Stage 1 規模で 70 セッション × 30 分音声で $20-50 想定）
  - Vercel 環境変数 `OPENAI_API_KEY` を Production / Preview 両方に登録
  - ローカル `.env.local` にも同じ値を設定
  - 完了確認方法: OpenAI ダッシュボードで API キーが表示され、Usage Limit が設定され、Vercel 環境変数に登録されていること
  - 観測可能な完了状態: `docs/setup/openai.md` が存在し、Whisper API 利用 + API キー取得 + Usage Limit + Vercel 登録手順が記述されている
  - _Requirements: 4.1, 4.3, 4.5, 4.7, 8.5_
  - _Boundary: OpenAISetupDoc_

- [x] 2.7 (P) `docs/setup/anthropic.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/anthropic.md` を新規作成
  - Anthropic アカウント作成 + API キー取得手順:
    - Anthropic Console でアカウント作成、Billing 情報を登録（Claude API は従量課金）
    - API Keys ページから新規キー作成、`ANTHROPIC_API_KEY` として控える
    - Claude Sonnet 4.6 モデルの利用前提を明示
  - Usage Limit の設定: 月 $150-300 推奨（Stage 1 規模で 70 セッション想定）、`security.md` L151 のアラート設定（月 $300 で警告、$500 で停止）に整合
  - Vercel 環境変数 `ANTHROPIC_API_KEY` を Production / Preview 両方に登録
  - ローカル `.env.local` にも同じ値を設定
  - 完了確認方法: Anthropic ダッシュボードで API キーが表示され、Usage Limit が設定され、Vercel 環境変数に登録されていること
  - 観測可能な完了状態: `docs/setup/anthropic.md` が存在し、Claude Sonnet 4.6 + API キー + Usage Limit + Vercel 登録手順が記述されている
  - _Requirements: 4.1, 4.4, 4.5, 4.7, 8.5_
  - _Boundary: AnthropicSetupDoc_

- [x] 2.8 (P) `docs/setup/vercel-blob.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/vercel-blob.md` を新規作成
  - Vercel Blob ストア作成手順:
    - Vercel プロジェクト `bulr-web` の Storage タブから "Create Database" → Blob を選択
    - Store Name: `bulr-audio`（単一ストア）
    - Vercel が `BLOB_READ_WRITE_TOKEN` を自動的にプロジェクト環境変数（Production / Preview 両方）に追加することを明示
  - Stage 1 では無料枠（1GB/月）内の利用前提、保存期間 30 日（後続 `assessment-engine` spec の Cron で自動削除）の運用方針を明示
  - 完了確認方法: Vercel ダッシュボードで Blob ストア `bulr-audio` が作成され、Project Settings → Environment Variables で `BLOB_READ_WRITE_TOKEN` が Production / Preview 両方に表示されていること
  - 観測可能な完了状態: `docs/setup/vercel-blob.md` が存在し、ストア作成手順とトークン自動付与の確認方法が記述されている
  - _Requirements: 5.1, 5.2, 5.3, 5.6, 8.5_
  - _Boundary: VercelBlobSetupDoc_

- [x] 2.9 (P) `docs/setup/cron.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/cron.md` を新規作成
  - `CRON_SECRET` 生成手順:
    - 推奨コマンド: `openssl rand -base64 32`（最低 32 バイトのランダム値）
    - 生成された値を控え、Vercel 環境変数 `CRON_SECRET` を Production / Preview 両方に登録
    - ローカル `.env.local` にも同じ値を設定（ローカルで Cron route handler を呼び出し検証する場合に使用）
  - `vercel.json` の Cron 定義（`/api/cron/audio-purge` を `0 18 * * *` UTC = 03:00 JST 毎日）の説明
  - 「Vercel Cron が呼び出す際、自動的に `Authorization: Bearer <CRON_SECRET>` ヘッダを付与する。route handler 側で `request.headers.get('authorization')` を `Bearer ${process.env.CRON_SECRET}` と比較して検証する責務は `assessment-engine` spec が持つ」を明示
  - 「本スペック完了時点では `/api/cron/audio-purge` の route handler が未実装のため、Cron 呼び出しは 404 になる。`assessment-engine` spec 完了までの一時状態として許容」を注記
  - 完了確認方法: Vercel 環境変数 `CRON_SECRET` が Production / Preview 両方に登録され、Vercel Dashboard の Cron Jobs に `/api/cron/audio-purge` がスケジュール登録されていること（route 404 でも登録自体は成功）
  - 観測可能な完了状態: `docs/setup/cron.md` が存在し、CRON_SECRET 生成・登録・vercel.json 説明・route 未実装注記が含まれている
  - _Requirements: 5.4, 5.5, 5.7, 6.6, 10.6, 8.5_
  - _Boundary: CronSetupDoc_

- [x] 2.10 (P) `docs/setup/drizzle-kit.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/drizzle-kit.md` を新規作成
  - drizzle-kit 運用手順:
    - **dev branch への反映**: ローカル `.env.local` に dev branch DATABASE_URL を設定 → `pnpm --filter @bulr/db push` → スキーマが dev branch に直接反映される（マイグレーション履歴は残らない、開発中の試行錯誤用）
    - **production branch への反映**: dev branch でスキーマ確定 → ローカル `.env.local` に dev branch DATABASE*URL を設定 → `pnpm --filter @bulr/db generate` → `packages/db/drizzle/<番号>*<suffix>.sql` 形式の SQL ファイルが生成される（drizzle-kit が決定するファイル名、本ドキュメントではファイル名をハードコードしない方針を明示）→ 生成 SQL を git にコミットして PR レビュー → マージ後、`.env.local`の DATABASE_URL を一時的に production branch URL に切り替えて`pnpm --filter @bulr/db migrate` を実行（または CI / Vercel Build hook で実行する選択肢を Stage 2 で検討）
    - 「本番 DB（production branch）に対して `push` を直接実行することは禁止。必ず `generate` → レビュー → `migrate` の順で進める」を警告セクションで強調
    - 「初回スキーマ確定は `assessment-pattern-seed` および `assessment-engine` spec で実施。本スペックでは drizzle.config.ts の DATABASE_URL 読み取りが動作することのみを検証」を明示
  - 完了確認方法: ローカルで DATABASE_URL を設定して `pnpm --filter @bulr/db generate` が空 schema でも実行成功（migration ファイルは生成されないが、エラーなし）、未設定で実行すると drizzle-kit が即座にエラーを返すこと
  - 観測可能な完了状態: `docs/setup/drizzle-kit.md` が存在し、push / generate / migrate の運用手順と警告セクションが含まれている
  - _Requirements: 3.6, 3.7, 3.8, 9.5, 8.5_
  - _Boundary: DrizzleKitOpsDoc_

- [x] 2.11 (P) `docs/setup/ci.md` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/docs/setup/ci.md` を新規作成
  - `.github/workflows/ci.yml` の構成説明:
    - トリガ: `pull_request`（opened / synchronize）+ `push` の `branches: [main]`
    - ジョブステップ: actions/checkout → pnpm セットアップ → Node 22 セットアップ → pnpm install --frozen-lockfile → pnpm typecheck → pnpm lint → pnpm audit --audit-level=moderate
  - PR レビュー時の確認事項:
    - 「all checks passed」になっていること
    - `pnpm audit` で moderate 以上の新規脆弱性が検出されていないこと
  - 「本 CI はシークレットを必要としない（外部接続なし）」を明示
  - 完了確認方法: 任意の PR を立てて GitHub Actions が起動、4 ステップが順次実行され全成功で「all checks passed」表示
  - 観測可能な完了状態: `docs/setup/ci.md` が存在し、CI 構成説明と PR レビュー時の確認事項が含まれている
  - _Requirements: 7.1, 7.7, 8.5_
  - _Boundary: DocsSetupReadme（補助ドキュメント）_

- [x] 2.12 ルート `README.md` のセットアップセクション更新
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/README.md` を更新
  - 既存内容を尊重し、以下のいずれかの形でセットアップへの入り口を追加:
    - 既存に Setup セクションがある場合: そこに「詳細は `docs/setup/README.md` を参照」のリンク追加
    - 既存に Setup セクションがない場合: 新規 `## Setup` セクションを追加し、`docs/setup/README.md` インデックスへのリンクと簡潔な手順サマリ（`pnpm install` → `cp apps/web/.env.local.example apps/web/.env.local` → 値を埋める → `pnpm dev`）を 5-10 行で記述
  - 観測可能な完了状態: `README.md` から `docs/setup/README.md` への明示的リンクが存在し、新規開発者がセットアップ手順インデックスに到達できる
  - _Requirements: 8.1_
  - _Boundary: RootReadme_
  - _Depends: 2.1_

## CI: GitHub Actions ワークフロー

- [x] 3. CI ワークフローの構築
- [x] 3.1 `.github/workflows/ci.yml` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/.github/workflows/ci.yml` を新規作成
  - 内容:

    ```yaml
    name: CI

    on:
      pull_request:
        types: [opened, synchronize]
      push:
        branches: [main]

    jobs:
      ci:
        runs-on: ubuntu-latest
        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - name: Setup pnpm
            uses: pnpm/action-setup@v4
            with:
              version: 10

          - name: Setup Node.js
            uses: actions/setup-node@v4
            with:
              node-version: 22
              cache: 'pnpm'

          - name: Install dependencies
            run: pnpm install --frozen-lockfile

          - name: Type check
            run: pnpm typecheck

          - name: Lint
            run: pnpm lint

          - name: Audit dependencies
            run: pnpm audit --audit-level=moderate
    ```

  - シークレット（DATABASE_URL 等）を一切参照しない（typecheck / lint / audit のみは外部接続不要）
  - 観測可能な完了状態: `.github/workflows/ci.yml` がリポジトリに存在し、PR を立てると GitHub Actions タブで CI ワークフローが起動・実行される
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 10.4_
  - _Boundary: CIWorkflow_

## Integration: 統合検証（自動）

> 4.x の検証タスクは設定ファイル + ドキュメントが揃った後の動作確認。Owner 手動実施を伴う 5.x と分離。

- [x] 4. 設定ファイルとドキュメントの統合検証
- [x] 4.1 `.env.example` 完整性の確認
  - ルート `.env.example` を読み、12 変数すべて（DATABASE_URL / BETTER_AUTH_SECRET / BETTER_AUTH_URL / RESEND_API_KEY / NEXT_PUBLIC_APP_URL / ANTHROPIC_API_KEY / OPENAI_API_KEY / BLOB_READ_WRITE_TOKEN / CRON_SECRET / ADMIN_ALLOWED_EMAILS / ADMIN_BASIC_AUTH_USER / ADMIN_BASIC_AUTH_PASSWORD）が含まれていることを目視確認
  - 各変数にコメントが付与され、Vercel 登録先（Production / Preview / 両方）が明示されていることを確認
  - 実シークレット値が含まれていないことを目視確認
  - 観測可能な完了状態: 12 変数 × コメント × プレースホルダの 3 条件をすべて満たす
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.8, 10.2, 10.7_
  - _Depends: 1.1_

- [x] 4.2 `apps/web/.env.local.example` のコピー動作確認
  - `cp apps/web/.env.local.example apps/web/.env.local` を実行（一時ファイルとして）
  - `.env.local` が `.gitignore` で除外されていることを `git status` で確認（追跡対象に出現しないこと）
  - 値を仮埋め（DATABASE_URL に Neon dev branch の URL、その他はダミー）し、`pnpm dev` で apps/web (port 3000) が起動することを確認
  - 確認後、一時的に作成した `.env.local` を削除（または開発者の手元に残す）
  - 観測可能な完了状態: `pnpm dev` で `curl http://localhost:3000/` が HTTP 200 を返し、`.env.local` が git 追跡対象に含まれない
  - _Requirements: 1.5, 1.7, 1.6, 3.9_
  - _Depends: 1.2, 1.3_

- [x] 4.3 `apps/web/vercel.json` の構造検証
  - `apps/web/vercel.json` を読み、JSON として有効であることを確認（`node -e "JSON.parse(require('fs').readFileSync('apps/web/vercel.json', 'utf8'))"` 等で検証可能）
  - `crons` 配列に 1 エントリが含まれ、`path: "/api/cron/audio-purge"` および `schedule: "0 18 * * *"` であることを確認
  - `headers` / `rewrites` / `redirects` 等の余分なキーが含まれないことを確認
  - 観測可能な完了状態: JSON が有効で、`crons[0].path` と `crons[0].schedule` の値が要求どおりであることをスクリプトで検証可能
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Depends: 1.4_

- [x] 4.4 `packages/db/drizzle.config.ts` の DATABASE_URL 読み取り検証
  - 一時的に `DATABASE_URL=postgresql://test:test@localhost:5432/test pnpm --filter @bulr/db generate` を実行し、空 schema でもエラーなく完了することを確認（migration ファイルは生成されないが、drizzle.config.ts は読み取られる）
  - DATABASE_URL を未設定で `pnpm --filter @bulr/db generate` を実行し、明示的なエラーメッセージ（`DATABASE_URL is not defined` 相当）が表示されることを確認
  - 観測可能な完了状態: DATABASE_URL 設定時は drizzle-kit が完了、未設定時は明示的なエラーで fail する
  - _Requirements: 3.4, 3.5_
  - _Depends: 1.5_

- [x] 4.5 CI ワークフローの動作確認
  - 任意の PR（このスペック完了用の PR でも可）を立てて GitHub Actions が起動することを確認
  - 4 ステップ（pnpm install --frozen-lockfile → pnpm typecheck → pnpm lint → pnpm audit --audit-level=moderate）がすべて成功し、「all checks passed」状態になることを確認
  - 万一 audit で false positive が発生した場合は、依存性更新で対応（または個別 ignore を docs/setup/ci.md に記録）
  - 観測可能な完了状態: PR の Checks タブで CI workflow がすべて緑（成功）になる
  - _Requirements: 7.2, 7.4, 7.5, 7.6, 7.7, 7.9, 10.4_
  - _Depends: 3.1_

- [x] 4.6 `docs/setup/` インデックスとリンク整合性の確認
  - `docs/setup/README.md` の各リンク（`./vercel.md` / `./neon.md` / `./resend.md` / `./openai.md` / `./anthropic.md` / `./vercel-blob.md` / `./cron.md` / `./drizzle-kit.md` / `./ci.md` / `./env-vars.md`）が実在ファイルを指していることを確認
  - 推奨実行順序が 10 ステップ揃っていることを確認
  - リポジトリトップ `README.md` から `docs/setup/README.md` へのリンクが機能することを確認
  - 観測可能な完了状態: すべてのリンクが broken でなく、READMEからセットアップインデックスへ到達でき、インデックスから各ドキュメントへ到達できる
  - _Requirements: 8.1, 8.2, 8.3, 8.6_
  - _Depends: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

## Manual Setup: Owner 手動実施項目（本スペック完了の最終確認）

> 5.x は Owner（プロジェクトオーナー）が `docs/setup/` の手順通りに実施する手動セットアップ項目。本スペックの最終完了条件として、これらが完了していることを Owner がチェックリストで確認する。実施には外部サービス（Vercel / Neon / Resend / OpenAI / Anthropic）のアカウント作成と API キー発行を伴うため、本スペックではコードや自動化を提供しない。
>
> **5.1〜5.6 は production 投入時に deferred (2026-05-21)**: Stage 1 の検証段階ではローカル Docker Postgres と Vercel Preview のみで進行可能なため、production cloud setup（Neon production branch / Vercel production / 本番環境変数）は production rollout 直前に Owner が一括実施する。assessment-pattern-seed 9.5 (production seed) と本セクション 5.1-5.6 は同じタイミングで実施。

- [ ] 5. Owner 手動セットアップ実施
- [ ] 5.1 Neon プロジェクト作成 + dev / production ブランチ作成（Owner 手動）
  - `docs/setup/neon.md` の手順通りに Neon プロジェクト `bulr` を作成
  - production branch（自動作成）と dev branch（手動分岐作成）を確認
  - 各ブランチの DATABASE_URL（pooled connection）を取得し、安全な場所に控える
  - 観測可能な完了状態: Neon Console でプロジェクト `bulr` に 2 ブランチ（production / dev）が表示される
  - _Requirements: 3.1, 3.2_
  - _Boundary: NeonSetupDoc 手順実施_
  - _Depends: 2.4_

- [ ] 5.2 Resend / OpenAI / Anthropic アカウント作成 + API キー取得（Owner 手動）
  - `docs/setup/resend.md` / `docs/setup/openai.md` / `docs/setup/anthropic.md` の各手順通りに 3 サービスのアカウントを作成
  - 各 API キー（`RESEND_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`）を取得し、安全な場所に控える
  - OpenAI / Anthropic で Usage Limit を設定（OpenAI: 月 $50-100、Anthropic: 月 $150-300）
  - 観測可能な完了状態: 3 サービスのダッシュボードで API キーが発行され、Usage Limit が設定されている
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - _Boundary: ResendSetupDoc / OpenAISetupDoc / AnthropicSetupDoc 手順実施_
  - _Depends: 2.5, 2.6, 2.7_

- [ ] 5.3 Vercel プロジェクト `bulr-web` 作成（Owner 手動）
  - `docs/setup/vercel.md` の手順通りに Vercel プロジェクト `bulr-web` を作成
  - GitHub リポジトリ `bulr-app-mvp` を import
  - Root Directory: `apps/web`、Framework Preset: Next.js を設定
  - 観測可能な完了状態: Vercel Dashboard でプロジェクト `bulr-web` が作成され、main ブランチからの初回デプロイが実行される（環境変数未設定のため失敗しても OK、5.5 完了後に再デプロイ）
  - _Requirements: 2.1, 2.2_
  - _Boundary: VercelSetupDoc 手順実施_
  - _Depends: 2.3_

- [ ] 5.4 Vercel Blob ストア `bulr-audio` 作成 + CRON_SECRET 生成（Owner 手動）
  - `docs/setup/vercel-blob.md` の手順通りに Vercel プロジェクト `bulr-web` の Storage タブから Blob ストア `bulr-audio` を作成
  - Vercel が `BLOB_READ_WRITE_TOKEN` を Production / Preview 両方の環境変数に自動付与することを確認
  - `docs/setup/cron.md` の手順通りに `openssl rand -base64 32` で `CRON_SECRET` を生成
  - 観測可能な完了状態: Vercel Project Settings → Environment Variables で `BLOB_READ_WRITE_TOKEN` が Production / Preview に存在し、`CRON_SECRET` 生成値が控えてある
  - _Requirements: 5.1, 5.2, 5.4, 10.6_
  - _Boundary: VercelBlobSetupDoc / CronSetupDoc 手順実施_
  - _Depends: 5.3, 2.8, 2.9_

- [ ] 5.5 Vercel 環境変数登録（Owner 手動）
  - `docs/setup/env-vars.md` の総合リファレンスに従い、Vercel Project Settings → Environment Variables で以下を登録:
    - **Production**: `DATABASE_URL`（production branch URL）、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`（本番ドメイン）、`RESEND_API_KEY`、`NEXT_PUBLIC_APP_URL`（本番ドメイン）、`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`CRON_SECRET`、`ADMIN_ALLOWED_EMAILS`、`ADMIN_BASIC_AUTH_USER`、`ADMIN_BASIC_AUTH_PASSWORD`
    - **Preview**: `DATABASE_URL`（dev branch URL）、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`（Preview ドメイン or プレースホルダ）、`RESEND_API_KEY`、`NEXT_PUBLIC_APP_URL`（Preview ドメイン or プレースホルダ）、`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`CRON_SECRET`、`ADMIN_ALLOWED_EMAILS`、`ADMIN_BASIC_AUTH_USER`、`ADMIN_BASIC_AUTH_PASSWORD`
    - `BLOB_READ_WRITE_TOKEN` は 5.4 で Vercel が自動付与済み（Production / Preview 両方）
  - 「Production には production branch DATABASE_URL のみ、Preview には dev branch DATABASE_URL のみ」の規約に従って登録（取り違え禁止）
  - 観測可能な完了状態: Vercel Project Settings → Environment Variables で 12 変数すべてが Production / Preview 両方（または該当環境）に登録されている
  - _Requirements: 2.3, 4.5, 4.7, 5.6, 5.7, 9.3, 9.4, 9.6_
  - _Boundary: EnvVarsDoc 手順実施_
  - _Depends: 5.1, 5.2, 5.3, 5.4_

- [ ] 5.6 Vercel デプロイ確認 + Cron 登録確認（Owner 手動）
  - main ブランチに任意のコミット（このスペックの完了 commit でも可）を push
  - Vercel Dashboard の Deployments で Production デプロイが成功することを確認
  - `https://bulr-web.vercel.app/`（または Vercel が自動生成するドメイン）が HTTP 200 を返すことを確認
  - PR を立てて Preview デプロイが自動生成され、Preview URL が HTTP 200 を返すことを確認
  - Vercel Dashboard の Cron Jobs ページで `/api/cron/audio-purge` がスケジュール `0 18 * * *` で登録されていることを確認（route handler 未実装のため呼び出し時 404 だが、登録自体は成功）
  - 観測可能な完了状態: Production / Preview の両 URL が HTTP 200 を返し、Cron Jobs に 1 エントリが登録されている
  - _Requirements: 2.7, 6.5, 6.7_
  - _Boundary: VercelSetupDoc / VercelJsonConfig 手順実施_
  - _Depends: 5.5_

- [x] 5.7 ローカル開発環境セットアップ（開発者個人実施、参考タスク）
  - `cp apps/web/.env.local.example apps/web/.env.local`
  - `.env.local` の各変数に値を埋める（DATABASE_URL は Neon dev branch、API キーは 5.2 で取得した値、CRON_SECRET は 5.4 で生成した値、BLOB_READ_WRITE_TOKEN は Vercel Storage タブから取得）
  - `pnpm dev` で apps/web (port 3000) が起動することを確認
  - 観測可能な完了状態: ローカルで `curl http://localhost:3000/` が HTTP 200 を返す
  - _Requirements: 1.7, 3.9, 4.6_
  - _Boundary: WebEnvLocalExample 利用_
  - _Depends: 5.1, 5.2, 5.4_

> **本スペック完了の最終条件**: 1.x〜4.x のすべてが完了し（設定ファイル・ドキュメント・CI が揃う）、5.x のうち 5.1〜5.6 が Owner 手動で完了した時点で本スペック完了。5.7 は開発者個人のセットアップで、必要なメンバーが各自実施する。後続 4 spec（authentication / assessment-pattern-seed / assessment-engine / admin-review-panel）はこの状態を upstream として実装を開始できる。
