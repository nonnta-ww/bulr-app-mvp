# Requirements Document

## Introduction

`monorepo-foundation` で確立された Stage 1 モノレポ（Next.js 16 + 4 packages）の上に、bulr Stage 1 MVP プロトタイプ（AI 面接アシスタント型）を **Vercel に本番デプロイ可能な状態**まで持ち上げるためのインフラ基盤スペック。`monorepo-foundation` 完了時点では `pnpm dev` でローカル起動できるだけで、DB 接続文字列・Vercel プロジェクト・Resend / OpenAI / Vercel Blob / Vercel Cron は未設定のため、Stage 1 のゴール（ベトナム人 20-30 + 日本人 10-20 への配信）を満たせない。

本スペックの責務は **Vercel + Neon + Resend + OpenAI + Vercel Blob + Vercel Cron + 環境変数規約 + CI 最小設定** を確立すること。Stage 1 の規模に合わせて **2 環境構成（dev branch + production）** で運用し、staging は持たない。Vercel Preview は dev branch DATABASE_URL を共有する。v2 移行に伴い、v1 仕様にはなかった **OPENAI_API_KEY**（Whisper API）/ **BLOB_READ_WRITE_TOKEN**（Vercel Blob）/ **CRON_SECRET**（Vercel Cron 認証）の 3 つを `.env.example` および Vercel 環境変数に追加し、`vercel.json` で `/api/cron/audio-purge` の Cron スケジュール（03:00 JST 毎日）を定義する。

実 Cron ロジック（`/api/cron/audio-purge` の本体実装）、Better Auth 設定・Magic Link、DB スキーマ実体、LLM 関数本体、Whisper クライアント実装、管理画面 UI は **すべて後続 spec の責務** であり、本スペックでは扱わない。本スペックは「設定ファイル + 文書化された手動セットアップ手順 + Cron スケジュール定義（ロジックなし）」のみを所有する。

## Boundary Context

- **In scope**:
  - Vercel プロジェクト `bulr-web` の作成手順（Owner 手動実施）の文書化（Root Directory = `apps/web`、Framework Preset、Build / Install / Output Command 設定）
  - Neon Postgres プロジェクト + `dev` / `production` ブランチ作成手順の文書化、各ブランチの `DATABASE_URL` 取得と Vercel 環境変数登録手順
  - Resend アカウント作成 + API キー取得手順の文書化、`RESEND_API_KEY` 登録
  - OpenAI アカウント作成 + API キー取得手順の文書化、`OPENAI_API_KEY` 登録（Whisper API 利用）
  - Anthropic アカウント作成 + API キー取得手順の文書化、`ANTHROPIC_API_KEY` 登録（Claude API 利用）
  - Vercel Blob ストア `bulr-audio` の作成手順の文書化、`BLOB_READ_WRITE_TOKEN` の自動登録確認
  - Vercel Cron 認証用 `CRON_SECRET` の生成と Vercel 環境変数登録
  - ルート `.env.example` に Stage 1 環境変数リスト全 10 項目を文書化（DATABASE_URL / BETTER_AUTH_SECRET / BETTER_AUTH_URL / RESEND_API_KEY / NEXT_PUBLIC_APP_URL / ANTHROPIC_API_KEY / OPENAI_API_KEY / BLOB_READ_WRITE_TOKEN / CRON_SECRET / ADMIN_ALLOWED_EMAILS）
  - `apps/web/.env.local.example` 作成（ローカル開発者向けコピー元）
  - `packages/db/drizzle.config.ts` の `dbCredentials.url` を `process.env.DATABASE_URL` から読み取る形に整える（`monorepo-foundation` の空設定を有効化）
  - `packages/db/src/client.ts` で `DATABASE_URL` 未設定時に fail fast する挙動の確認（`monorepo-foundation` 既設）
  - `apps/web/vercel.json` 作成: Cron 定義として `/api/cron/audio-purge` を `0 18 * * *` UTC（= 03:00 JST 毎日）で実行
  - drizzle-kit の運用手順文書化（dev branch には `pnpm drizzle-kit push`、production branch には `pnpm drizzle-kit migrate`、生成 SQL ファイル名の決定は drizzle-kit に委譲）
  - `.github/workflows/ci.yml` 最小構成（Node セットアップ + pnpm install + typecheck + lint + `pnpm audit --audit-level=moderate`）
  - README.md（または docs/setup/README.md）にセットアップ手順の概要を追記
  - 環境変数を Vercel に登録する手順の文書化（Production 環境と Preview 環境の使い分け、Preview = dev branch DATABASE_URL を共有する規約）

- **Out of scope**:
  - Better Auth 設定・Magic Link 実装・proxy.ts のセキュリティロジック → `authentication` spec
  - DB テーブル実体定義（candidate / interview_session / interview_turn 等）→ `assessment-pattern-seed` および `assessment-engine` spec
  - LLM 関数実装（analyzeTurn / proposeNextQuestions 等 5 関数）、システムプロンプト → `assessment-engine` spec
  - Whisper クライアント実装（`transcribeAudio` ラッパー）→ `assessment-engine` spec
  - Vercel Blob アップロード関数（`uploadToBlob`）→ `assessment-engine` spec
  - 音声削除 Cron の **ロジック実装**（`/api/cron/audio-purge/route.ts` の中身、`audio_expires_at <= now()` 検索 + Blob 削除 + `audio_key` null クリア）→ `assessment-engine` spec（本スペックでは vercel.json のスケジュール定義のみ）
  - 管理画面 UI、`requireAdmin` ヘルパー → `authentication` spec / `admin-review-panel` spec
  - 監視スタック（PostHog / Sentry / Helicone / BetterStack）→ Stage 2
  - Cloudflare R2 への移行 → Stage 2
  - カスタムドメイン（bulr.net 等）の SSL 設定・DNS 設定 → Stage 1 末で必要なら追加
  - staging 環境（Stage 1 は dev branch + production の 2 環境のみ、staging は Stage 2）
  - Resend のカスタムドメイン認証・本番送信ドメイン整備 → Stage 2（Stage 1 は Resend のテストドメインで OK）
  - Resend Pro プラン（Stage 1 は Free プランの 100 通/日上限内で運用）
  - セキュリティヘッダー（CSP / HSTS / Permissions-Policy）の `next.config.ts` 設定 → `assessment-engine` spec（マイク権限 CSP 含む）または `authentication` spec
  - レート制限実装（`rate_limit` テーブル + ロジック）→ `authentication` spec / `assessment-engine` spec

- **Adjacent expectations**:
  - 本スペックは `monorepo-foundation` で作成済みの `apps/web` / `packages/db` / `packages/ai` / `vercel.json` 配置場所の構造（`apps/web/vercel.json`）に従う
  - 後続 spec が必要とする全環境変数を `.env.example` に予約（実装は後続でも、変数名は本スペックで確定）
  - 後続 `authentication` spec は `RESEND_API_KEY` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` / `ADMIN_ALLOWED_EMAILS` を、`assessment-engine` spec は `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `BLOB_READ_WRITE_TOKEN` / `CRON_SECRET` / `DATABASE_URL` を、`admin-review-panel` spec は `ADMIN_ALLOWED_EMAILS` を利用する
  - `vercel.json` の Cron 定義（`/api/cron/audio-purge` を `0 18 * * *` UTC）は `assessment-engine` spec で実装される route handler との共有契約。本スペックでは route handler ファイルは作成しない
  - Neon の `dev` ブランチには `pnpm drizzle-kit push` でスキーマを反映、`production` ブランチには `pnpm drizzle-kit migrate` で履歴を残して反映、という運用ルールを文書化（実 push / migrate の実行は `assessment-pattern-seed` および `assessment-engine` spec で初回実施）

## Requirements

### Requirement 1: 環境変数規約と `.env.example` の整備

**Objective:** As a 後続 spec の実装者および新規参画する開発者, I want Stage 1 で必要な全環境変数がルートの `.env.example` に網羅され、各変数の用途・参照元・公開可否がコメント付きで文書化されていること, so that 後続 spec の実装時に「この変数はどこで定義すべきか」「Vercel に登録済みか」を毎回調べる必要がなく、ローカル環境のセットアップも `.env.example` を `.env.local` にコピーするだけで完結する。

#### Acceptance Criteria

1. The リポジトリ shall ルート直下に `.env.example` を含む。
2. The `.env.example` shall 以下 10 個の変数を、各々用途を説明するコメントと共に列挙する: `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`RESEND_API_KEY`、`NEXT_PUBLIC_APP_URL`、`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`BLOB_READ_WRITE_TOKEN`、`CRON_SECRET`、`ADMIN_ALLOWED_EMAILS`。
3. The `.env.example` shall すべての変数値を実値ではなくプレースホルダ（例: `postgresql://user:pass@host/db`、`your-secret-here`）で記載する。
4. The `.env.example` shall `NEXT_PUBLIC_` プレフィックスがついた変数はクライアント側に露出する旨を明示し、それ以外はサーバー専用である旨を明示する。
5. The リポジトリ shall `apps/web/.env.local.example` を含み、ローカル開発者がコピーして利用できる形で同等の変数（最低限 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`NEXT_PUBLIC_APP_URL`、`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`RESEND_API_KEY`、`BLOB_READ_WRITE_TOKEN`、`CRON_SECRET`、`ADMIN_ALLOWED_EMAILS`）を含む。
6. The `.gitignore` shall `.env`、`.env.local`、`.env*.local` を除外対象に含めている（`monorepo-foundation` で設定済みの確認）。
7. When 開発者が `.env.example` を `.env.local` にコピーして値を埋めた場合、the apps/web shall `pnpm dev` 起動時にすべての必須環境変数を読み取れる。
8. The `.env.example` shall ファイル冒頭または各変数の直前のコメントで、該当変数を Vercel のどの環境（Production / Preview / 両方）に登録すべきかを明示する。

### Requirement 2: Vercel プロジェクトのセットアップ手順文書化

**Objective:** As a プロジェクトオーナー, I want Vercel プロジェクト `bulr-web` の作成・設定手順が再現可能な形で文書化されていること, so that 万一プロジェクトを再作成する場合や別のメンバーがアクセスを引き継ぐ場合にも、手順書通りに進めれば同じ構成を再現できる。

#### Acceptance Criteria

1. The リポジトリ shall `docs/setup/vercel.md`（または同等のセットアップ手順ファイル）を含み、Vercel プロジェクトの作成手順を順序立てて記述する。
2. The Vercel セットアップ手順 shall プロジェクト名（`bulr-web`）、Root Directory（`apps/web`）、Framework Preset（Next.js）、Install Command（`pnpm install`）、Build Command（Vercel が monorepo を検出しデフォルトで `pnpm build` または `next build`）、Output Directory（Next.js デフォルト）の指定を明示する。
3. The Vercel セットアップ手順 shall 環境変数の登録手順を含み、Production 環境と Preview 環境の使い分け（Preview = dev branch DATABASE_URL を共有、Production = production branch DATABASE_URL）を明示する。
4. The Vercel セットアップ手順 shall GitHub リポジトリ連携手順を含み、main ブランチへの push で Production デプロイ、PR で Preview デプロイが自動実行される設定を確認する手順を含む。
5. The Vercel セットアップ手順 shall Vercel Hobby プラン前提で記述され、有料機能（Pro プランの Custom Domains SSL、Team Members 等）には依存しない。
6. The Vercel セットアップ手順 shall プロジェクトオーナーが手動実施する手順であることを明示し、本スペック範囲では Vercel API 経由の自動セットアップは行わない。
7. When プロジェクトオーナーが手順書通りにセットアップした場合、the Vercel プロジェクト shall main ブランチへの push で本番ビルドが成功し、PR で Preview デプロイが生成される。

### Requirement 3: Neon Postgres のブランチ運用と DB 接続設定

**Objective:** As a 後続 spec の実装者, I want Neon Postgres に `dev` と `production` の 2 ブランチが作成され、各ブランチの `DATABASE_URL` が Vercel に正しく登録されていること、および drizzle-kit 運用の手順が文書化されていること, so that DB スキーマの実装時に dev branch で `push` を試し、本番反映時には `migrate` で履歴を残す運用が即実行可能になる。

#### Acceptance Criteria

1. The リポジトリ shall `docs/setup/neon.md`（または同等）を含み、Neon プロジェクト作成 + `dev` / `production` ブランチ作成の手順を順序立てて記述する。
2. The Neon セットアップ手順 shall `production` ブランチがプライマリで、`dev` ブランチが production からの分岐として作成されることを明示する。
3. The Neon セットアップ手順 shall 各ブランチの `DATABASE_URL`（pooled connection 推奨）を取得する方法と、Vercel 環境変数 `DATABASE_URL` に Production / Preview それぞれに登録する手順を明示する（Preview = dev branch、Production = production branch）。
4. The `packages/db/drizzle.config.ts` shall `dbCredentials.url: process.env.DATABASE_URL!` を参照し、`DATABASE_URL` 未定義時に drizzle-kit がエラーを出す形（または fallback で空文字を渡してエラーログを出す形）になっている。
5. The `packages/db/src/client.ts` shall `DATABASE_URL` 未定義時に明示的に throw する（`monorepo-foundation` で実装済みの確認）。
6. The drizzle-kit 運用手順 shall ローカル開発者が `.env.local` 経由で dev branch DATABASE_URL を指定し、`pnpm --filter @bulr/db push` でスキーマを dev branch に反映する手順を含む。
7. The drizzle-kit 運用手順 shall 本番反映時に `pnpm --filter @bulr/db generate` でマイグレーションファイルを生成し（drizzle-kit が決定するファイル名で `packages/db/drizzle/*_<suffix>.sql` 形式）、生成された SQL を git にコミットしてレビュー、その後 production branch DATABASE_URL を指定して `pnpm --filter @bulr/db migrate` を実行する手順を含む。
8. The drizzle-kit 運用手順 shall 生成されるマイグレーションファイル名は drizzle-kit が決定する番号付きの命名（例: `0000_<suffix>.sql`）であり、本スペックではファイル名をハードコードしない方針を明示する。
9. When 開発者が `.env.local` に dev branch DATABASE_URL を設定した場合、the `pnpm dev` 起動時の DB クライアント初期化 shall 接続を成立させる（実 SQL の実行は不要、接続文字列の読み取りができれば OK）。

### Requirement 4: Resend / OpenAI / Anthropic アカウントのセットアップ手順文書化

**Objective:** As a プロジェクトオーナー, I want Resend（Magic Link 配信）/ OpenAI（Whisper API）/ Anthropic（Claude API）の各サービスのアカウント作成と API キー取得手順が文書化されていること, so that Stage 1 開始時に同じ手順で 3 サービスを揃えることができ、API キーの紛失や再発行時にも復旧手順が明確になる。

#### Acceptance Criteria

1. The リポジトリ shall `docs/setup/resend.md`、`docs/setup/openai.md`、`docs/setup/anthropic.md`（または統合された `docs/setup/external-services.md`）を含み、3 サービスのアカウント作成 + API キー取得 + Vercel 登録手順を記述する。
2. The Resend セットアップ手順 shall Free プラン（100 通/日まで）の利用前提と、Stage 1 では Resend のテストドメイン（`onboarding@resend.dev` 等）で送信し、カスタムドメイン認証は Stage 2 で対応する旨を明示する。
3. The OpenAI セットアップ手順 shall Whisper API（`whisper-1` モデル）の利用前提、API キー発行画面の手順、Usage Limit の設定（月 $50-100 程度を推奨）を明示する。
4. The Anthropic セットアップ手順 shall Claude Sonnet 4.6 モデルの利用前提、API キー発行画面の手順、Usage Limit の設定（月 $150-300 程度を推奨）を明示する。
5. The 各セットアップ手順 shall API キーを Vercel 環境変数（`RESEND_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`）として Production / Preview 両方に登録する手順を含む。
6. The 各セットアップ手順 shall API キーをローカル `.env.local` にも同じ値を設定する手順を含み、ローカルでの動作確認時の利用方法を明示する。
7. When プロジェクトオーナーが手順書通りに 3 サービスを設定した場合、the Vercel 環境変数 shall `RESEND_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` の 3 つが Production と Preview 両方に登録された状態になる。

### Requirement 5: Vercel Blob ストアのセットアップと Cron 認証

**Objective:** As a プロジェクトオーナー, I want Vercel Blob ストア `bulr-audio` を Vercel ダッシュボードから作成し、`BLOB_READ_WRITE_TOKEN` が自動的に Vercel 環境変数に登録されること、および Vercel Cron 認証用の `CRON_SECRET` が生成・登録されていること, so that 後続 `assessment-engine` spec で音声アップロード（Vercel Blob）と音声削除 Cron（`/api/cron/audio-purge`）の実装に着手できる。

#### Acceptance Criteria

1. The リポジトリ shall `docs/setup/vercel-blob.md`（または `docs/setup/vercel.md` 内の節）を含み、Vercel ダッシュボードから Blob ストア `bulr-audio` を単一ストアとして作成する手順を記述する。
2. The Vercel Blob セットアップ手順 shall Blob ストア作成時に Vercel が `BLOB_READ_WRITE_TOKEN` を自動的に Vercel 環境変数（Production / Preview 両方）に追加することを明示する。
3. The Vercel Blob セットアップ手順 shall Stage 1 では無料枠（1GB/月）内の利用を前提とし、保存期間 30 日（後続 spec の Cron で自動削除）の運用方針を明示する。
4. The リポジトリ shall `docs/setup/cron.md`（または `docs/setup/vercel.md` 内の節）を含み、`CRON_SECRET` の生成（`openssl rand -base64 32` 等）と Vercel 環境変数（Production / Preview 両方）への登録手順を記述する。
5. The Cron セットアップ手順 shall `CRON_SECRET` が Vercel Cron からの自動呼び出し時に `Authorization: Bearer <CRON_SECRET>` ヘッダで送信されることを明示し、route handler 側で検証する責務は `assessment-engine` spec が持つことを明示する。
6. When プロジェクトオーナーが手順書通りに Vercel Blob を作成した場合、the Vercel 環境変数 shall `BLOB_READ_WRITE_TOKEN` が Production と Preview 両方に登録された状態になる。
7. When プロジェクトオーナーが手順書通りに `CRON_SECRET` を登録した場合、the Vercel 環境変数 shall `CRON_SECRET` が Production と Preview 両方に登録された状態になる。

### Requirement 6: `vercel.json` での Vercel Cron 定義

**Objective:** As a 後続 `assessment-engine` spec の実装者, I want `vercel.json` に Vercel Cron スケジュールが定義済みの状態で、`/api/cron/audio-purge` が毎日 03:00 JST に呼び出されること, so that route handler の実装に集中でき、Cron スケジュールの調整は本スペックで完結している。

#### Acceptance Criteria

1. The リポジトリ shall `apps/web/vercel.json` を含む（`structure.md` の配置方針に従い、Vercel プロジェクトの Root Directory `apps/web` 配下に配置）。
2. The `vercel.json` shall `crons` 配列を含み、その中に以下の 1 エントリを定義する: `path: "/api/cron/audio-purge"`、`schedule: "0 18 * * *"`（UTC 18:00 = JST 03:00 毎日）。
3. The `vercel.json` shall Vercel Hobby プランの Cron 制限（1 日 2 回まで）を超えない範囲のスケジュール（本スペックでは 1 日 1 回のみ）に収まる。
4. The `vercel.json` shall Cron 定義以外の余分な設定（`headers`、`rewrites`、`redirects` 等）を含まない（本スペックでは Cron スケジュールのみが責務）。
5. When apps/web が Vercel にデプロイされた場合、the Vercel ダッシュボード shall `vercel.json` から Cron 定義を読み取り、`/api/cron/audio-purge` のスケジュール登録を完了する。
6. The `vercel.json` shall 本スペックでは route handler の実装ファイル（`apps/web/app/api/cron/audio-purge/route.ts`）を作成しない（`assessment-engine` spec の責務）ことを README または コメント等で明示する。
7. When Vercel Cron が `/api/cron/audio-purge` を呼び出した時点で route handler が未実装の場合、the Vercel shall HTTP 404 を返すが、これは `assessment-engine` spec 完了までの一時状態として許容される。

### Requirement 7: `.github/workflows/ci.yml` 最小 CI 設定

**Objective:** As a 開発者および PR レビュアー, I want PR ごとに型チェック・lint・依存性脆弱性スキャンが自動実行されること, so that PR 単位で型エラー・スタイル違反・既知の脆弱な依存性を検出でき、本番ブランチに混入させない。

#### Acceptance Criteria

1. The リポジトリ shall `.github/workflows/ci.yml` を含む。
2. The CI workflow shall PR の `opened` / `synchronize` および `main` ブランチへの `push` の両方で起動する。
3. The CI workflow shall Node.js 22 LTS 以上のバージョンと pnpm 10 以上をセットアップする（`actions/setup-node` + `pnpm/action-setup` 等）。
4. The CI workflow shall `pnpm install --frozen-lockfile` で依存関係をインストールする。
5. The CI workflow shall `pnpm typecheck` を実行し、エラーがあれば PR を fail させる。
6. The CI workflow shall `pnpm lint` を実行し、エラーがあれば PR を fail させる。
7. The CI workflow shall `pnpm audit --audit-level=moderate` を実行し、moderate 以上の脆弱性が検出されたら PR を fail させる（`security.md` 準拠）。
8. The CI workflow shall シークレット（`DATABASE_URL` 等）を必要としない（本スペックの CI は型チェック・lint・audit のみのため、外部接続は不要）。
9. When 開発者が PR を作成した場合、the GitHub Actions shall 上記 4 ステップ（install / typecheck / lint / audit）を順次実行し、すべて成功した場合のみ「all checks passed」状態にする。

### Requirement 8: ドキュメント整備とセットアップ手順の集約

**Objective:** As a 新規参画する開発者およびプロジェクトオーナー, I want セットアップ手順がドキュメントとして集約され、リポジトリのトップレベルからリンクで辿れること, so that Vercel / Neon / Resend / OpenAI / Anthropic / Vercel Blob / Cron / 環境変数 / CI のすべてのセットアップを 1 つのインデックスから順序立てて実行できる。

#### Acceptance Criteria

1. The リポジトリ shall `README.md`（プロジェクトルート）にセットアップセクションまたは `docs/setup/` へのリンクを含む。
2. The `docs/setup/` ディレクトリ shall 各サービスのセットアップ手順ファイルを含み、`docs/setup/README.md`（または同等のインデックスファイル）から各手順への目次リンクを提供する。
3. The セットアップ手順インデックス shall 推奨実行順序（Neon → Resend → OpenAI → Anthropic → Vercel プロジェクト作成 → Vercel Blob → CRON_SECRET 登録 → 環境変数の Vercel 登録 → drizzle-kit push 初回実行）を明示する。
4. The セットアップ手順 shall すべて Owner が手動実施する想定で記述され、自動化スクリプトには依存しない。
5. The セットアップ手順 shall 各ステップの「完了確認方法」（例: Vercel ダッシュボードで env 変数が登録されている、`curl https://bulr-web.vercel.app/` が HTTP 200 を返す等）を含む。
6. When 新規開発者が README からセットアップ手順を辿った場合、the 開発者 shall 手順書通りに進めることで Stage 1 のローカル開発環境および Vercel 本番環境を構築できる。

### Requirement 9: 2 環境構成（dev branch + production）の運用規約

**Objective:** As a プロジェクトオーナーおよび後続 spec の実装者, I want Stage 1 では「local（開発者ローカル）+ Vercel Preview（PR ごと）+ Vercel Production（main ブランチ）」の 3 段階デプロイを、DB は「dev branch + production branch」の 2 ブランチで運用することが明示されていること, so that 「staging」を期待する設定を作らず、「Preview = dev DB を共有」という規約が PR レビュー時にも徹底される。

#### Acceptance Criteria

1. The 環境マッピング規約 shall ドキュメントで以下を明示する: **local** = 開発者の `.env.local` で dev branch DATABASE_URL を参照、**Vercel Preview** = PR ごとの自動 Preview デプロイで dev branch DATABASE_URL を共有、**Vercel Production** = main マージで本番デプロイ、production branch DATABASE_URL を使用。
2. The 環境マッピング規約 shall Stage 1 では staging 環境を作らないこと、staging が必要になった場合は Stage 2 で別途検討する旨を明示する。
3. The Vercel 環境変数登録手順 shall 各変数（DATABASE_URL を含む）について、Production と Preview のどちらに登録するか、または両方に登録するかを明示する。
4. The DATABASE_URL の登録規約 shall Production には production branch、Preview には dev branch の URL を登録するよう明示する（誤って production URL を Preview に登録すると、PR 動作確認で本番 DB を破壊するリスクがあるため）。
5. The 環境マッピング規約 shall 本番 DB（production branch）への破壊的変更は `pnpm drizzle-kit migrate` 経由のみとし、`pnpm drizzle-kit push` を本番に直接実行しないことを明示する。
6. When 開発者が PR を立てて Preview デプロイで動作確認した場合、the Preview デプロイ shall dev branch DATABASE_URL を使用し、本番 DB に影響を与えない。

### Requirement 10: シークレット管理とセキュリティ baseline

**Objective:** As a セキュリティレビュアー, I want シークレット（API キー / DATABASE_URL / CRON_SECRET 等）が git にコミットされず、Vercel 環境変数経由でのみ参照され、ビルド成果物にも混入しないこと, so that リポジトリ公開時や PR レビュー時にシークレット漏洩のリスクを構造的に排除できる。

#### Acceptance Criteria

1. The リポジトリ shall `.gitignore` で `.env`、`.env.local`、`.env.*.local` を除外している（`monorepo-foundation` で設定済みの確認）。
2. The `.env.example` および `apps/web/.env.local.example` shall 実シークレット値を含まず、すべてプレースホルダで構成される。
3. The シークレット管理規約 shall `NEXT_PUBLIC_` プレフィックスの付いた変数のみクライアントに露出することを明示し、それ以外（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`BLOB_READ_WRITE_TOKEN`、`CRON_SECRET`、`DATABASE_URL`、`BETTER_AUTH_SECRET`、`RESEND_API_KEY`、`ADMIN_ALLOWED_EMAILS`）はサーバー専用である旨を明示する（`security.md` L203-209 準拠）。
4. The CI workflow shall `pnpm audit --audit-level=moderate` を実行し、moderate 以上の脆弱性で fail する（`security.md` L213 準拠）。
5. The Vercel 環境変数登録規約 shall シークレット変数を Vercel ダッシュボードからのみ登録し、リポジトリ内のいかなるファイル（`.env.example` 含む）にも実値を書かないことを明示する。
6. The `CRON_SECRET` 生成手順 shall 推測困難なランダム値（最低 32 バイト、`openssl rand -base64 32` 等）を生成して登録することを明示する。
7. When PR レビュアーが diff を確認した場合、the diff shall 実シークレット値を含まない（プレースホルダのみ、または環境変数読み取りコードのみ）。
