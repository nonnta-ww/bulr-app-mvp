# Requirements Document — multi-app-deployment

## Project Description (Input)

`bulr-app-mvp` モノレポを Wave 1 の最終段階として、3 アプリ（`apps/candidate` / `apps/business` / `apps/admin`）を Vercel 上の独立した 3 プロジェクトとして本番デプロイできる状態にする Stage 2 再設計 Wave 1 仕上げのスペック。

### スコープ（やること）

- Vercel に 3 プロジェクトを新規作成（`@bulr/candidate` / `@bulr/business` / `@bulr/admin`）
- 旧 `apps/web` 時代の単一 Vercel プロジェクトを廃止（環境変数の控えを取得後に削除）
- 各プロジェクトの Root Directory / Build Command / Install Command / Output Directory を Turborepo + pnpm workspace 構成に合わせて設定
- 本番ドメイン割当: `bulr.net`（apex）= candidate、`bz.bulr.net` = business、`admin.bulr.net` = admin
- レジストラ側 DNS（Cloudflare / GoDaddy 等）で A / CNAME レコードを Vercel に向ける + Vercel Custom Domain 登録
- 環境変数の least-privilege 配分：共有変数（DB / 認証 secret / LLM API キー / Whisper / Resend 等）は 3 プロジェクト共通、アプリが参照するシークレット（`CRON_SECRET` / `BLOB_READ_WRITE_TOKEN` / `ADMIN_ALLOWED_EMAILS` / `BUSINESS_BASE_URL` 等）は該当プロジェクトのみに設定
- Cron Job（audio-purge）が business プロジェクトでのみ動作する構成
- PR / ブランチ push による 3 アプリ独立 Preview デプロイ（Vercel デフォルト）
- Production / Preview それぞれで Better Auth callback URL（`BETTER_AUTH_URL`）が正しいデプロイ URL に向く構成
- Production デプロイ後の動作検証：3 ドメインでサインイン → Magic Link → 認証後画面到達、admin → business cross-app リンク、Vercel Cron 登録状態

### ゴール（Definition of Done）

- Vercel に 3 プロジェクト（candidate / business / admin）が存在し、それぞれ独立した Production / Preview デプロイを持つ
- 旧 `apps/web` 単一プロジェクトが Vercel ダッシュボードから削除されている
- 3 つの本番ドメイン（`bulr.net` / `bz.bulr.net` / `admin.bulr.net`）が Vercel から SSL 付きで応答する
- 各ドメインの `/sign-in` で Magic Link をリクエストすると、その**ドメイン由来**のリンクがメールで届く（business で要求した Magic Link が admin ドメインに飛ばない、等）
- admin 本番から business 本番への面接後レポートリンクが `https://bz.bulr.net/interviews/[id]/report` に到達する
- business プロジェクトの Vercel Cron ダッシュボードで `audio-purge` が登録され、candidate / admin プロジェクトには Cron が表示されない
- PR を立てたとき、`apps/candidate` / `apps/business` / `apps/admin` の 3 つの Preview URL が生成され、それぞれ独立に動作する

### 非ゴール（本 spec の範囲外）

- Magic Link メールテンプレートのアプリ別分離（Wave 2 `candidate-auth-onboarding` の追加スコープに記載済み）
- 候補者向け業務機能・企業向けスカウト機能・年収査定（Wave 2〜4 各 spec）
- Vercel 以外のホスティング検討 / マルチリージョン本番化 / マルチテナント分離
- 新規 DB スキーマ追加・テストフレームワーク導入（`monorepo-app-split` と同方針）
- 監視・分析統合（Sentry / PostHog / Helicone 等）— Stage 2 で導入予定
- 既存のセキュリティヘッダー（CSP / HSTS 等、`next.config.js`）への変更
- 本格的なマルチテナント分離・データオーナーシップの企業ごと分離

### 依存・前提

- **前提**: `monorepo-app-split` が 2026-05-25 に完了済み。3 アプリが `pnpm build` / `pnpm typecheck` / `pnpm lint` を通過し、ローカル dev で 3020 / 3021 / 3022 ポートでそれぞれ独立起動できる
- **前提**: `bulr.net` ドメインは購入済み、レジストラ側（Cloudflare / GoDaddy 等）で DNS を管理している
- **前提**: Better Auth の callback URL は env (`BETTER_AUTH_URL`) から読む構造（`monorepo-app-split` で確認済み）
- **前提**: admin → business の cross-app link は `BUSINESS_BASE_URL` env を読む構造（`monorepo-app-split` Amendment Task 4.3 で実装済み）
- **後続**: `candidate-auth-onboarding` は本 spec の完了を待たず並列開発可能だが、Magic Link メールに含まれる URL のドメイン確定は本 spec で行う

### 参照

- 詳細設計メモ: `docs/superpowers/specs/2026-05-23-bulr-candidate-business-split-design.md`（特にセクション 4: アプリ／ドメイン構成）
- Wave 1 ロードマップ: `.kiro/steering/roadmap.md`
- 先行する `monorepo-app-split` 完了状態とその Amendment 群（port 3020/3021/3022、`BUSINESS_BASE_URL`、logout UI）
- Vercel ドキュメント: Monorepo Project / Custom Domains / Cron Jobs / Environment Variables / Ignored Build Step

## Boundary Context

- **In scope（本 spec で扱う）**:
  - Vercel 3 プロジェクトの新規作成と旧プロジェクトの廃止
  - 各プロジェクトの Build 設定（Root Directory / Build Command / Install Command / Framework Preset / Output Directory）
  - 本番ドメイン割当（candidate = `bulr.net` apex、business = `bz.bulr.net`、admin = `admin.bulr.net`）
  - レジストラ側 DNS レコード（A / CNAME / 必要に応じ TXT）と Vercel Custom Domain 登録
  - 環境変数の least-privilege 配分（共有変数 / プロジェクト別変数の分類と Vercel での Production / Preview 登録）
  - Cron Job の business プロジェクト限定動作（`apps/business/vercel.json` の `crons` を business プロジェクトでのみ参照）
  - 3 アプリの独立 Preview デプロイ（PR / ブランチ push でアプリごとの Preview URL）
  - Better Auth callback URL の Production / Preview 整合（`BETTER_AUTH_URL` がそのデプロイ URL に向く）
  - Production デプロイの動作検証（3 ドメインでのサインインフロー / Magic Link / cross-app リンク / cron 登録）

- **Out of scope（本 spec で扱わない）**:
  - Magic Link メールテンプレートのアプリ別分離（Wave 2 `candidate-auth-onboarding` の追加スコープ）
  - `apps/candidate` の業務機能（履歴書・スキルアンケート・模擬面接・エントリー）— Wave 2〜4
  - `apps/admin` の運営拡張機能（企業管理・候補者管理・マスタ CMS・コスト監視）— `admin-operations`
  - DB スキーマ変更、新パッケージ追加、テストフレームワーク導入
  - 監視・分析統合（Sentry / PostHog / Helicone）と既存セキュリティヘッダーの変更
  - Vercel 以外のホスティング検討、マルチリージョン本番化、マルチテナント分離

- **Adjacent expectations（隣接スペックへの期待・前提）**:
  - `monorepo-app-split` の 24 タスクが完了済み（3 アプリのビルド通過、ローカル dev 起動、`BUSINESS_BASE_URL` 等の env 受け口、Better Auth の `BETTER_AUTH_URL` 駆動構造、logout UI）
  - `bulr.net` がレジストラで購入済みで、レジストラ管理画面から DNS レコードを編集できる権限がある
  - `candidate-auth-onboarding` は本 spec が確定したドメイン（`bulr.net`）を Magic Link メールテンプレ刷新時のベース URL として利用する
  - `company-and-opening` 以降の Wave 3 / Wave 4 spec は本 spec のデプロイ構成（3 プロジェクト・3 ドメイン）を前提に作業する

## Requirements

### Requirement 1: Vercel 3 プロジェクト構成への移行

**User Story:** 運用担当者として、Vercel 上に 3 つの独立プロジェクト（candidate / business / admin）が存在することで、ドメイン・環境変数・Cron 設定をアプリごとに独立管理したい。

#### Acceptance Criteria

1.1. システムは Vercel 上に 3 つのプロジェクト（`bulr-candidate` / `bulr-business` / `bulr-admin` 等、アプリと 1:1 対応する命名）を持つ。
1.2. システムは旧 `apps/web` 時代の単一 Vercel プロジェクトを廃止する（環境変数の控えを取得した後に Vercel ダッシュボードから削除）。
1.3. システムは各 Vercel プロジェクトに対し同一の Git リポジトリ（`bulr-app-mvp`）を接続する。
1.4. システムは各プロジェクトの Root Directory を `apps/candidate` / `apps/business` / `apps/admin` に設定する。
1.5. システムは各プロジェクトの Install Command をモノレポルートでの `pnpm install`（または等価）に設定し、pnpm workspace 全体が解決される。
1.6. システムは各プロジェクトの Build Command を `pnpm --filter @bulr/<app>... build`（Turborepo の依存パッケージ含むビルド）に設定する。
1.7. システムは各プロジェクトの Output Directory を Next.js のデフォルト（`.next`）に従わせる。
1.8. システムは各プロジェクトの Framework Preset を Next.js として設定する。
1.9. When `main` ブランチに push、the Vercel は対応する 3 プロジェクトの Production デプロイを自動実行する。

### Requirement 2: 本番ドメイン割当と SSL

**User Story:** エンドユーザー（候補者 / 面接官 / 運営）として、それぞれ `bulr.net` / `bz.bulr.net` / `admin.bulr.net` のドメインで対応するアプリにアクセスし、HTTPS で通信したい。

#### Acceptance Criteria

2.1. システムは candidate プロジェクトの Custom Domain として `bulr.net`（apex）を登録する。
2.2. システムは business プロジェクトの Custom Domain として `bz.bulr.net` を登録する。
2.3. システムは admin プロジェクトの Custom Domain として `admin.bulr.net` を登録する。
2.4. システムは 3 つのドメインに対し Vercel が自動発行する SSL 証明書を提供する。
2.5. When ブラウザが `https://bulr.net` にアクセス、the candidate Vercel プロジェクトの Production デプロイがレスポンスする。
2.6. When ブラウザが `https://bz.bulr.net` にアクセス、the business Vercel プロジェクトの Production デプロイがレスポンスする。
2.7. When ブラウザが `https://admin.bulr.net` にアクセス、the admin Vercel プロジェクトの Production デプロイがレスポンスする。
2.8. If ブラウザが `http://` でアクセス、the システムは `https://` に redirect する（Vercel デフォルト動作）。
2.9. システムは 3 ドメインそれぞれの Custom Domain で `www.` プレフィックス無しを正規ホスト名とする（必要なら `www.` をリダイレクト）。

### Requirement 3: DNS 設定（レジストラ側）

**User Story:** 運用担当者として、レジストラの DNS 管理画面から Vercel への接続を確立し、ドメインの実体である DNS レコードを正しく設定したい。

#### Acceptance Criteria

3.1. システムはレジストラ側 DNS で `bulr.net`（apex）に対し Vercel が指定する A レコード（または ALIAS / ANAME レコード）を設定する。
3.2. システムはレジストラ側 DNS で `bz.bulr.net` に対し Vercel 推奨の CNAME レコード（`cname.vercel-dns.com` 等）を設定する。
3.3. システムはレジストラ側 DNS で `admin.bulr.net` に対し Vercel 推奨の CNAME レコードを設定する。
3.4. Where Vercel が SSL 検証用 TXT レコードの追加を要求する、システムは指示された TXT レコードをレジストラ側 DNS に追加する。
3.5. When DNS 伝播完了後（`dig` / `nslookup` で確認可能）、the Vercel ダッシュボードは 3 ドメインを「Valid Configuration」として表示する。
3.6. システムは TTL を運用変更が反映されやすい値（推奨 300〜3600 秒）に設定する。

### Requirement 4: 共有環境変数の 3 プロジェクトへの登録

**User Story:** 開発者として、DB 接続・LLM API キー・認証 secret 等の 3 アプリ共通の値を、各 Vercel プロジェクトの環境変数として登録し、Production / Preview 両方で正しく参照されるようにしたい。

#### Acceptance Criteria

4.1. システムは以下の共有変数を 3 プロジェクトすべての Production / Preview に登録する: `DATABASE_URL`、`BETTER_AUTH_SECRET`、`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`WHISPER_PROVIDER`、`WHISPER_LOCAL_ENDPOINT`、`WHISPER_MODEL`、`RESEND_API_KEY`。
4.2. システムは `DATABASE_URL` を環境別に異なる値で設定する：Production = Neon production branch URL、Preview = Neon dev branch URL。
4.3. システムは `BETTER_AUTH_SECRET` を 3 プロジェクトで同一の値（最低 32 バイトの base64 ランダム値）として設定する。
4.4. システムは秘匿性が必要な変数（API キー・secret 類）を Vercel の暗号化された環境変数として登録する（プレーンテキスト変数として登録しない）。
4.5. If Vercel Blob ストアを 3 プロジェクトのいずれかが利用、the `BLOB_READ_WRITE_TOKEN` は Vercel Blob ストア接続時に該当プロジェクトに自動付与される。

### Requirement 5: プロジェクト別環境変数の least-privilege 配分

**User Story:** セキュリティ担当者として、各アプリが参照しないシークレットを他プロジェクトに同梱せず、攻撃面を最小化したい。

#### Acceptance Criteria

5.1. システムは `BETTER_AUTH_URL` と `NEXT_PUBLIC_APP_URL` を各プロジェクトで該当ドメイン値として独立設定する：candidate = `https://bulr.net`、business = `https://bz.bulr.net`、admin = `https://admin.bulr.net`。
5.2. システムは `CRON_SECRET` を business プロジェクトのみに登録する（candidate / admin には登録しない）。
5.3. システムは `BLOB_READ_WRITE_TOKEN` を business プロジェクトのみに登録する（音声 Blob を扱うのは business のみ）。
5.4. システムは `ADMIN_ALLOWED_EMAILS` を admin プロジェクトのみに登録する（candidate / business では `requireAdmin()` を使わない）。
5.5. システムは `BUSINESS_BASE_URL` を admin プロジェクトのみに登録する：Production = `https://bz.bulr.net`、Preview = admin Preview から開いて到達可能な business エンドポイント（具体的な解決方式は design で確定）。
5.6. システムは各プロジェクトの環境変数一覧に、そのアプリが参照しない変数を含めない。
5.7. システムは `SMTP_HOST` / `SMTP_PORT` を Vercel 環境変数に登録しない（ローカル Mailpit 専用、本番では Resend を使う）。

### Requirement 6: Cron Job の business プロジェクト限定動作

**User Story:** 運用担当者として、音声削除 Cron が business プロジェクトでのみ動作することで、誤って candidate / admin の environment で Cron が走らないようにしたい。

#### Acceptance Criteria

6.1. システムは `apps/business/vercel.json` の `crons` 配列に `/api/cron/audio-purge` を `schedule: "0 18 * * *"` で定義する（現状維持）。
6.2. システムは business Vercel プロジェクトの Cron ダッシュボードに `audio-purge` を登録する。
6.3. システムは candidate / admin Vercel プロジェクトの Cron ダッシュボードに Cron を登録しない（各プロジェクトの Root Directory にある `vercel.json` には `crons` が含まれない / そもそも `vercel.json` が存在しない）。
6.4. When Vercel Cron がスケジュール時刻に発火、the business プロジェクトのみ `POST https://bz.bulr.net/api/cron/audio-purge` が `Bearer ${CRON_SECRET}` ヘッダ付きで呼び出される。
6.5. If 認証ヘッダが `CRON_SECRET` と一致しない、the audio-purge ルートは HTTP 401 を返す（既存実装、本 spec で変更しない）。

### Requirement 7: 独立 Preview デプロイ

**User Story:** 開発者として、PR を立てたとき 3 アプリすべてが独立に Preview デプロイされ、それぞれの Preview URL でアプリの挙動を確認したい。

#### Acceptance Criteria

7.1. システムは PR / 非 `main` ブランチへの push に対し、3 つの Vercel プロジェクトすべてで Preview デプロイを実行する（Vercel デフォルト動作）。
7.2. システムは 3 つの Preview デプロイそれぞれに対し Vercel が独立した Preview URL を発行する。
7.3. システムは Preview デプロイで `BETTER_AUTH_URL` を該当 Preview URL（Vercel の System Env `VERCEL_URL` ベース）に動的に設定する（Requirement 8 で詳述）。
7.4. システムは Preview デプロイで `DATABASE_URL` として Neon dev branch を参照する（Production の prod branch を破壊しないため）。
7.5. システムは PR 上の Vercel コメント / GitHub Checks で 3 つの Preview URL を表示する（Vercel GitHub 連携のデフォルト動作）。
7.6. When PR ブランチに新たな push、the Vercel は 3 プロジェクトすべての Preview を再ビルドし、URL を更新する。

### Requirement 8: Better Auth callback URL の整合性

**User Story:** ユーザー（候補者・面接官・運営）として、サインインフォームから Magic Link を要求したとき、メール内のリンクが**自分がサインインを試みたデプロイと同じ URL**に向かい、別ドメインや別 Preview に飛ばされないことを期待する。

#### Acceptance Criteria

8.1. システムは Production デプロイで `BETTER_AUTH_URL` を該当アプリの本番ドメイン値（candidate = `https://bulr.net`、business = `https://bz.bulr.net`、admin = `https://admin.bulr.net`）として設定する。
8.2. システムは Preview デプロイで `BETTER_AUTH_URL` を該当 Preview の URL（Vercel System Env `VERCEL_URL` を利用、`https://` プレフィックス付き）に動的に解決する。
8.3. When ユーザーがあるデプロイの `/sign-in` でメールアドレスを送信、the 受信した Magic Link メール内の URL は**そのデプロイの URL**を指す。
8.4. システムは `NEXT_PUBLIC_APP_URL` を `BETTER_AUTH_URL` と同じ値（同デプロイの URL）として設定する。
8.5. If ユーザーがあるドメインでサインイン要求 → 別ドメインの Magic Link リンクをクリック、the Better Auth は cookie ドメイン不一致でエラーまたはサインインリンク無効として扱う（既存 Better Auth の動作、本 spec で変更しない）。
8.6. When 運営が admin Preview デプロイから面接後レポートリンクをクリック、the 遷移先は到達可能な business デプロイ（Production または対応 Preview）であり、HTTP 200 で応答する（破綻リンクとならない）。具体的な BUSINESS_BASE_URL 解決方式は design で確定する。

### Requirement 9: 旧 Vercel プロジェクトの廃止

**User Story:** 運用担当者として、apps/web 時代の単一プロジェクトを Vercel から削除し、混乱と誤デプロイのリスクを取り除きたい。

#### Acceptance Criteria

9.1. システムは旧 Vercel プロジェクトの環境変数値（特に `BLOB_READ_WRITE_TOKEN`、`CRON_SECRET`、`DATABASE_URL` Production 値、`BETTER_AUTH_SECRET`、Resend API key）を新プロジェクトに移植可能な形でエクスポートする。
9.2. システムは旧 Vercel プロジェクトに紐づいた Custom Domain（仮ドメインや旧 `bulr.net` 設定があれば）を解除する。
9.3. システムは新 3 プロジェクトの Production デプロイが成功したことを確認した後で、旧 Vercel プロジェクトを削除する。
9.4. システムは Vercel Blob ストアが旧プロジェクトに作成されていた場合、それを business プロジェクトに re-link する（または business プロジェクトで新規 Blob ストアを作成し、データ移行・retire を検討する）。
9.5. システムは旧プロジェクトの Cron ジョブ履歴を必要に応じてエクスポート（監査目的）したうえで削除する。

### Requirement 10: Production デプロイ動作検証

**User Story:** 運用担当者として、3 ドメインそれぞれが意図したアプリを返し、認証フロー・cross-app リンク・Cron 登録などの主要機能が本番でも動くことを確認したい。

#### Acceptance Criteria

10.1. When `curl -I https://bulr.net/sign-in`、the candidate プロジェクトの応答が HTTP 200 で返される。
10.2. When `curl -I https://bz.bulr.net/sign-in`、the business プロジェクトの応答が HTTP 200 で返される。
10.3. When `curl -I https://admin.bulr.net/sign-in`、the admin プロジェクトの応答が HTTP 200 で返される。
10.4. When 候補者が `https://bulr.net/sign-in` でメール送信、the Magic Link メールの URL は `https://bulr.net/...` を含む。
10.5. When 面接官が `https://bz.bulr.net/sign-in` でメール送信、the Magic Link メールの URL は `https://bz.bulr.net/...` を含む。
10.6. When 運営が `https://admin.bulr.net/sign-in` でメール送信、the Magic Link メールの URL は `https://admin.bulr.net/...` を含む。
10.7. When 運営が `https://admin.bulr.net/sessions/[id]` の面接後レポートリンクをクリック、the 遷移先は `https://bz.bulr.net/interviews/[id]/report` である。
10.8. システムは business Vercel プロジェクトの Cron ダッシュボードで `audio-purge` を「Active」表示する。
10.9. システムは Vercel ダッシュボードで 3 プロジェクトすべての最新デプロイステータスが「Ready」になっている。
10.10. When PR を作成、the GitHub Checks 上に 3 つの Preview URL が表示され、それぞれにアクセスして該当アプリが応答する。
