# Implementation Plan — multi-app-deployment

> 本 spec は Stage 2 再設計 Wave 1 の仕上げ。`monorepo-app-split` でローカル動作するようになった 3 アプリを、Vercel の 3 独立プロジェクトとして本番デプロイ可能な状態にする。9 major task / 16 sub-task に分解。`(P)` マーカー = 並列実行可能。大半は Vercel ダッシュボード操作 + Cloudflare DNS 設定 + 検証 + ドキュメント書き換え。コード変更は 1 行のみ（Better Auth baseURL の Preview 動的解決）。

## Amendment (2026-05-27): ローカル `.env.local` を per-app 独立ファイル化 + Vercel BETTER_AUTH_SECRET 分離

### ローカル env 構造の変更（symlink 廃止）

monorepo-app-split で導入した `apps/*/.env.local` → root `/.env.local` への symlink 構造を廃止。代わりに 3 アプリそれぞれが**独立した実ファイル `.env.local`** を持つ。

背景：
- 旧構造では `BETTER_AUTH_URL` 等のアプリ別 URL 変数を `apps/*/package.json` の dev script 内で inline に上書きしていたが、シングルソース・オブ・トゥルース原則に反し、`next dev` を直接実行した際に env が誤った値になる footgun があった
- 3 ファイル独立化により、各アプリの Next.js が自分の `.env.local` をそのまま読む構成に統一（Vercel 構造とパラレル）

実装：
- `apps/{candidate,business,admin}/.env.local` の symlink を削除し、root `.env.local` を 3 ファイルにコピー（URL 系変数のみアプリ別に置換: 3020 / 3021 / 3022）
- `apps/*/package.json` の dev / start スクリプトから inline env 上書き（`BETTER_AUTH_URL=... NEXT_PUBLIC_APP_URL=...`）を削除し、`next dev --turbopack -p <port>` だけのシンプルな形に
- `apps/*/.env.example` のヘッダから「symlink」記述を削除、独立ファイル前提に書き換え
- root `/.env.example` のヘッダもアップデート（symlink 廃止を反映、drizzle-kit 等モノレポルート由来スクリプトのためのテンプレートとして役割継続）

影響：
- ローカル開発者は今後 `cp apps/<app>/.env.example apps/<app>/.env.local` で各アプリの env を用意する（旧手順 `cp .env.example .env.local` は drizzle-kit / 他のルート由来スクリプトのみ）
- 既存の `pnpm --filter @bulr/<app> dev` の挙動は変わらない（Next.js が自動で `.env.local` を読む）

### Vercel BETTER_AUTH_SECRET の分離

design.md の VercelEnvVars 表は「3 プロジェクト共通の BETTER_AUTH_SECRET」を想定していたが、防御深化の観点から **3 プロジェクトそれぞれで別の secret を generate** する方針に変更：

- ローカル: 3 アプリの `.env.local` は引き続き同じ値を共有（実害なし、ローテーション簡素化）
- Vercel: 各プロジェクト用に `openssl rand -base64 32` を 3 回走らせ、それぞれ登録
- 利点: Magic Link トークンの cross-app redeem 不可化、鮮度事の影響範囲を 1 アプリに局所化
- 機能的影響なし（3 ドメインは別 origin / 別 cookie scope のため、共通 secret でも SSO は成立しない）

## Amendment (2026-05-27): per-app `.env.example` を追加（Vercel 登録用リファレンス）

env 配分ルール（design.md「VercelEnvVars」表）の理解を助けるため、3 アプリそれぞれの直下に `.env.example` を新規作成：

- `apps/candidate/.env.example` — bulr-mvp-candidate プロジェクトに登録すべき env のみ
- `apps/business/.env.example` — bulr-mvp-business プロジェクトに登録すべき env のみ（BLOB / Cron 自動付与の説明含む）
- `apps/admin/.env.example` — bulr-mvp-admin プロジェクトに登録すべき env のみ（ADMIN_ALLOWED_EMAILS / BUSINESS_BASE_URL 含む）

ローカル開発の symlink 構造は無変更（`apps/*/.env.local` は root の `.env.local` への symlink）。per-app `.env.example` は Vercel UI での env 登録時の参考資料として機能する。

root `/.env.example` は引き続き全変数の master reference + ローカル開発用テンプレートとして維持。ヘッダコメントを更新し per-app への pointer を追加。

## Amendment (2026-05-27): DIRECT_URL を migration 専用 env として導入

`packages/db/drizzle.config.ts` が `DIRECT_URL ?? DATABASE_URL` の優先順位で接続 URL を読むよう変更。背景：

- Neon の pooled connection（PgBouncer transaction pooling）は migration コマンドが踏みうる prepared statement 越え・advisory lock・トランザクション跨ぎセッション状態などで不安定になる
- canonical pattern（Prisma が広め、Drizzle でも踏襲）: ランタイムは pooled、migration は direct を使う
- ランタイム接続（`packages/db/src/client.ts`）は無変更 → 引き続き DATABASE_URL（pooled）を使用
- `.env.example` に DIRECT_URL セクションを追加（Vercel には登録不要、ローカル `.env.local` 専用）
- 既存の `pnpm drizzle-kit push/generate/migrate` コマンドは変更なし（自動で DIRECT_URL を優先）
- 影響: ローカル開発者は `.env.local` に DIRECT_URL を追加すべきだが、未設定でも `DATABASE_URL` にフォールバックして従来通り動く

## Amendment (2026-05-27): Whisper 関連 env を本 spec では未登録（deferred）

`OPENAI_API_KEY` および `WHISPER_PROVIDER` は本 spec の env 登録対象から外す。背景：

- 旧 Vercel プロジェクトでも未登録（task 2.1 で確認済み、ユーザーがまだ OpenAI API キーを取得していない）
- 本 spec のゴールは「3 アプリの本番デプロイ可能化」であり、Whisper 機能自体の本番動作は task 7.x の smoke test 範囲外でも許容
- 影響: business `/api/interview/turns/next` の Whisper 文字起こし呼び出しは本番でも 500 エラーを返す。サインイン / セッション一覧 / レポート表示 / cross-app リンクは正常動作
- 後続対応: OpenAI API キー取得後、business プロジェクトに `OPENAI_API_KEY` と `WHISPER_PROVIDER=openai` を追加登録すれば Whisper も復活（spec 化は不要、運用作業）

## Amendment (2026-05-27): プロジェクト命名は `bulr-mvp-{candidate,business,admin}`

design.md / tasks.md では `bulr-candidate` / `bulr-business` / `bulr-admin` を想定していたが、Vercel 上での実プロジェクト名は **`bulr-mvp-candidate` / `bulr-mvp-business` / `bulr-mvp-admin`** を採用（リポジトリ名 `bulr-app-mvp` との接続が明確になる + 旧 `bulr-app-mvp-web` との命名連続性）。Preview URL は `bulr-mvp-business-git-<branch>-<scope>.vercel.app` 形式になる。Wave 2 以降の spec が cross-app URL helper を導入する場合は、この命名規約を base に組み立てる。Custom Domain（`bulr.net` / `bz.bulr.net` / `admin.bulr.net`）への影響なし。

## Amendment (2026-05-26): 旧 Vercel プロジェクトはローカル確認のみで未デプロイ → クリーンスレート方式に切替

実装着手時の確認で、旧 Vercel プロジェクト `bulr-app-mvp-web` は **一度もデプロイされておらず、Custom Domain も Blob ストアも接続されていない、placeholder 状態**であることが判明。本 spec の以下の手順を簡素化する：

- **task 2.1**: env pull は実施済みだが抽出されたユーザー定義 env は 5 件のみ（`ANTHROPIC_API_KEY` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` / `RESEND_API_KEY`）。新プロジェクトの env 登録は `.env.local` を一次資料として進めて良い。`.env.old-project*.backup` は historical record として保管後に削除予定
- **task 5.1**: 既存 Blob ストア再 link は不要 → business プロジェクトで新規 Blob ストア作成のみ
- **task 6.3**: 旧 Custom Domain 解除は不要 → 旧プロジェクトには Custom Domain が attached されていなかった
- **task 9.1**: 24-72h rollback 猶予は不要 → 守るべき本番トラフィックがないため、旧プロジェクト削除は **新規 3 プロジェクト作成前**（task 3.x 前）に実施しても良い
- **実行順序**: 旧プロジェクト削除 → 3 新規プロジェクト作成 → env 登録 → DNS / Custom Domain 設定 → 検証、というクリーンスレート方式を採用する

## Foundation phase（コード基盤 + 旧プロジェクト控え）

- [ ] 1. Better Auth baseURL の Preview 動的解決対応

- [x] 1.1 packages/auth に `resolveBaseUrl()` を実装し baseURL に注入
  - `packages/auth/src/server.ts` 冒頭の `BETTER_AUTH_URL` 必須チェックを撤廃
  - `resolveBaseUrl()` ヘルパー関数を追加: 優先順位 `process.env.BETTER_AUTH_URL` → `\`https://${process.env.VERCEL_URL}\`` → 両方未定義なら throw
  - `betterAuth({ baseURL: resolveBaseUrl() })` に差し替え
  - ローカル dev は `.env.local` の `BETTER_AUTH_URL=http://localhost:3020` 等で従来通り動作
  - Vercel Preview デプロイでは env 未設定で `VERCEL_URL` フォールバックが効く
  - **観測可能**: `pnpm --filter @bulr/auth typecheck` と root `pnpm build` が PASS、ローカル dev が 3 アプリで起動できる
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - _Boundary: BetterAuthBaseUrl_

- [ ] 2. 旧 Vercel プロジェクトの設定値控え抽出

- [x] 2.1 旧プロジェクトの環境変数と Blob ストアトークンを抽出
  - Vercel CLI でローカルマシンから旧プロジェクトに `vercel link` → `vercel env pull .env.old-project.backup`（Production / Preview / Development すべて含む）
  - Settings → Storage で Vercel Blob ストアの token と store ID を別途記録（ストアが既存の場合）
  - 控えファイルは git 管理外に保管（`.gitignore` に `.env*.backup` パターンを追加）
  - **観測可能**: `.env.old-project.backup` がローカルに作成され、本番値（API キー / secret / token）がすべて含まれる。Blob ストア情報（token / store ID）は別途記録済み
  - _Requirements: 9.1_
  - **実装メモ (2026-05-26)**: 旧プロジェクト `bulr-app-mvp-web` は未デプロイ placeholder で、user-defined env は 5 件のみ（`ANTHROPIC_API_KEY` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` / `RESEND_API_KEY`）。Vercel Blob ストアと Neon Integration は未接続、Production deploy 履歴なし。`.env.old-project.backup` と `.env.old-project-preview.backup` を historical record として保管後、task 9.1 で削除予定。本 spec 冒頭の Amendment (2026-05-26) も参照。

## Core phase（Vercel 3 プロジェクト準備 + env + Blob）

- [x] 3. Vercel 3 プロジェクト新規作成

- [x] 3.1 (P) bulr-candidate プロジェクトを Vercel に作成
  - Vercel ダッシュボード → Add New Project → bulr-app-mvp リポジトリ選択
  - Framework Preset: Next.js / Root Directory: `apps/candidate` / Production Branch: `main`
  - Build Command / Install Command / Output Directory はデフォルト（Vercel が pnpm-lock.yaml + Turborepo を自動検出）
  - 初回 deploy は env 未設定のため失敗する可能性あり（後続 task 4.x で env 登録後に redeploy）
  - **観測可能**: Vercel ダッシュボードに `bulr-candidate` プロジェクトが Root Directory = `apps/candidate` で表示される。Production Branch が `main` に設定されている
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
  - _Boundary: VercelProjects/bulr-candidate_

- [x] 3.2 (P) bulr-business プロジェクトを Vercel に作成
  - 同上、Root Directory = `apps/business`
  - `apps/business/vercel.json` の `crons` 定義が自動検出され、Cron Jobs に `audio-purge` が登録される（env 未設定段階では Production 動作はしない）
  - **観測可能**: `bulr-business` プロジェクトが表示され、Cron Jobs ダッシュボードに `audio-purge` が `0 18 * * *` で表示される
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 6.1, 6.2_
  - _Boundary: VercelProjects/bulr-business_

- [x] 3.3 (P) bulr-admin プロジェクトを Vercel に作成
  - 同上、Root Directory = `apps/admin`
  - `apps/admin/` に `vercel.json` が無いため Cron Jobs ダッシュボードは空のまま
  - **観測可能**: `bulr-admin` プロジェクトが表示され、Cron Jobs が空であることが確認できる
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 6.3_
  - _Boundary: VercelProjects/bulr-admin_

- [x] 4. 環境変数の least-privilege 登録

- [x] 4.1 (P) 共有環境変数を 3 プロジェクトに登録
  - design.md の VercelEnvVars 表「3 プロジェクト共通」に従い、`DATABASE_URL` / `BETTER_AUTH_SECRET` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `WHISPER_PROVIDER` / `RESEND_API_KEY` を 3 プロジェクトの Production / Preview 両方に登録
  - 値は task 2.1 で抽出した `.env.old-project.backup` から再利用（API キー / secret 類は変えない）
  - `DATABASE_URL`: Production = Neon production branch URL、Preview = Neon dev branch URL
  - `SMTP_HOST` / `SMTP_PORT` は **登録しない**（ローカル Mailpit 専用、本番は Resend を使う）
  - **観測可能**: 3 プロジェクトすべての Settings → Environment Variables で共有 6 変数が Production / Preview 両方に登録され、`SMTP_HOST` / `SMTP_PORT` は存在しない
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.7_
  - _Boundary: VercelEnvVars/shared_
  - _Depends: 2.1, 3.1, 3.2, 3.3_

- [x] 4.2 (P) candidate プロジェクト固有 env
  - `BETTER_AUTH_URL=https://bulr.net`（Production のみ）
  - `NEXT_PUBLIC_APP_URL=https://bulr.net`（Production のみ）
  - Preview には登録しない（task 1.1 で実装した `VERCEL_URL` フォールバックが効く）
  - **観測可能**: candidate プロジェクトの Production env に 2 つの URL 系変数が登録され、Preview env には未登録
  - _Requirements: 5.1_
  - _Boundary: VercelEnvVars/candidate_
  - _Depends: 3.1_

- [x] 4.3 (P) business プロジェクト固有 env
  - `BETTER_AUTH_URL=https://bz.bulr.net` / `NEXT_PUBLIC_APP_URL=https://bz.bulr.net`（Production のみ）
  - `BLOB_STORAGE_PROVIDER=vercel-blob`（Production / Preview 両方）
  - `CRON_SECRET` は Vercel Cron が自動付与するため手動入力不要（後続 5.1 で再確認）
  - **観測可能**: business の Production env に URL 系 + Blob プロバイダ設定が登録され、Cron Secret は Vercel システムが自動付与している
  - _Requirements: 5.1, 5.2, 5.3_
  - _Boundary: VercelEnvVars/business_
  - _Depends: 3.2_

- [x] 4.4 (P) admin プロジェクト固有 env
  - `BETTER_AUTH_URL=https://admin.bulr.net` / `NEXT_PUBLIC_APP_URL=https://admin.bulr.net`（Production のみ）
  - `ADMIN_ALLOWED_EMAILS`（task 2.1 で控えた値を再利用、Production / Preview 両方）
  - `BUSINESS_BASE_URL=https://bz.bulr.net`（Production / Preview 両方、Preview も Production 固定方針 — research.md 7.2 参照）
  - **観測可能**: admin プロジェクトの env に admin 固有 4 変数が登録され、`BUSINESS_BASE_URL` は Preview でも Production 値が入っている
  - _Requirements: 5.1, 5.4, 5.5_
  - _Boundary: VercelEnvVars/admin_
  - _Depends: 3.3_

- [x] 5. business プロジェクトに Vercel Blob ストアを接続

- [x] 5.1 既存 Blob ストアを business に re-link または新規ストア作成
  - 旧プロジェクトに紐づいた Blob ストアが存在する場合（task 2.1 で控えた token / store ID から判定）: business プロジェクト Settings → Storage で「Connect Existing Store」を選択し、token を手動セット
  - 存在しない場合: business プロジェクトで新規 Blob ストア（store 名は `bulr-audio` 等）を作成、Vercel が `BLOB_READ_WRITE_TOKEN` を business の Production / Preview env に自動 inject
  - **観測可能**: business プロジェクトの Settings → Storage に Blob ストアが「Connected」表示され、`BLOB_READ_WRITE_TOKEN` が business の Production / Preview env に存在する
  - _Requirements: 4.5, 5.3, 9.4_
  - _Depends: 2.1, 3.2_

## Integration phase（DNS と Custom Domain、旧 Custom Domain 移管）

- [x] 6. Cloudflare DNS と Vercel Custom Domain 設定

- [x] 6.1 Cloudflare DNS レコードを設定
  - Cloudflare ダッシュボードで bulr.net ゾーン → DNS Records
  - apex（`@`）: A レコード → Vercel ダッシュボードで案内される IP（プロジェクト固有値、Vercel UI に表示）、Proxy status = **DNS only**（gray cloud）、TTL Auto
  - `bz`: CNAME → Vercel ダッシュボードで案内される target（例: `cname.vercel-dns.com` または `<hash>.vercel-dns-NNN.com`）、Proxy status = DNS only
  - `admin`: CNAME 同上、Proxy status = DNS only
  - Cloudflare → SSL/TLS → Overview を **Full (strict)** に設定
  - **観測可能**: `dig bulr.net A` / `dig bz.bulr.net CNAME` / `dig admin.bulr.net CNAME` で Vercel の指定 target が解決される（DNS 伝播後、数分〜数十分）
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_
  - _Depends: 3.1, 3.2, 3.3_

- [x] 6.2 Vercel に 3 つの Custom Domain を登録
  - bulr-candidate プロジェクト Settings → Domains で `bulr.net` を追加（Primary、必要なら `www.bulr.net` → `bulr.net` の redirect も設定）
  - bulr-business プロジェクトで `bz.bulr.net` を追加
  - bulr-admin プロジェクトで `admin.bulr.net` を追加
  - 旧 Vercel プロジェクトに既に `bulr.net` 等が紐づいている場合は Vercel UI の「Move Domain」機能で新プロジェクトへ atomic 移管（remove → add の手順ではダウンタイムが発生するため避ける）
  - Vercel が SSL 証明書（Let's Encrypt）を自動発行するまで待機（DNS 伝播後 数分〜数十分）
  - 必要に応じて Vercel が要求する TXT レコードを Cloudflare に追加（SSL 検証用）
  - **観測可能**: Vercel ダッシュボードで 3 ドメインすべて「Valid Configuration」表示され、`https://bulr.net/sign-in`、`https://bz.bulr.net/sign-in`、`https://admin.bulr.net/sign-in` が HTTP 200 で応答する
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.4_
  - _Depends: 4.1, 4.2, 4.3, 4.4, 5.1, 6.1_

- [x] 6.3 旧 Vercel プロジェクトから Custom Domain を解除
  - 6.2 の Move Domain で `bulr.net` が新プロジェクトに移管されていれば、旧プロジェクトには Custom Domain が残らない（Move は atomic）
  - Move ではなく Remove → Add で行った場合、旧プロジェクトの Domains セクションを Vercel UI で空にする
  - 旧プロジェクトに紐づく Production Branch を `main` から外す（誤ってデプロイされない設定にする）
  - **観測可能**: 旧プロジェクトの Settings → Domains が空、Production Branch が無効化、新 3 プロジェクトでのみドメインが応答する
  - _Requirements: 9.2_
  - _Depends: 6.2_

## Validation phase（Production 動作検証 + 旧プロジェクト削除 + ドキュメント整備）

- [ ] 7. Production デプロイ動作検証（DeploymentVerification の 10 項目）

- [ ] 7.1 (P) 3 ドメインの HTTP 200 と Magic Link ドメイン整合性
  - `curl -I https://bulr.net/sign-in` → HTTP 200
  - `curl -I https://bz.bulr.net/sign-in` → HTTP 200
  - `curl -I https://admin.bulr.net/sign-in` → HTTP 200
  - ブラウザで各 `/sign-in` から自分のメールアドレスに Magic Link 送信 → メール本文の URL がそのドメイン（`https://bulr.net/...` / `https://bz.bulr.net/...` / `https://admin.bulr.net/...`）を含む
  - 各 Magic Link をクリックして該当アプリにサインインできる
  - **観測可能**: 3 ドメインで 200 応答、3 通の Magic Link メールがそれぞれのドメインに飛ぶリンクを含み、クリックでサインイン完了
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - _Boundary: DeploymentVerification/domains-and-auth_
  - _Depends: 6.2_

- [ ] 7.2 (P) admin → business cross-app リンク動作確認
  - admin に許可メール（`ADMIN_ALLOWED_EMAILS` 内）でサインイン → `https://admin.bulr.net/sessions` から既存セッションを選択
  - `/sessions/[id]` 詳細画面の「面接官向けレポートを別タブで開く」リンクをクリック
  - 遷移先が `https://bz.bulr.net/interviews/[id]/report` で、business 側で正常にレポートが表示される
  - **観測可能**: admin から開いた新タブが business ドメイン上で 200 応答、ヒートマップ + サマリーが描画される
  - _Requirements: 10.7_
  - _Boundary: DeploymentVerification/cross-app_
  - _Depends: 6.2, 4.4_

- [x] 7.3 (P) Cron 登録の business 限定と認証動作確認
  - business プロジェクトの Cron Jobs ダッシュボードに `audio-purge` が「Active」表示
  - candidate / admin プロジェクトの Cron Jobs ダッシュボードが空（task 3.3 で確認済みの状態が維持）
  - 任意で「Trigger Now」を実行 → `/api/cron/audio-purge` が `Authorization: Bearer ${CRON_SECRET}` ヘッダ付きで呼ばれ HTTP 200 が返る
  - 認証ヘッダなし or 不一致で呼んだ場合は HTTP 401（既存 route handler の挙動を確認）
  - **観測可能**: business のみ Cron Active、他 2 プロジェクトの Cron は空、test trigger が 200、認証なしで 401
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 10.8_
  - _Boundary: DeploymentVerification/cron_
  - _Depends: 4.3, 3.2_

- [ ] 7.4 (P) Preview deploy 動作確認
  - 任意の PR を作成（例: README に空行追加、または既存 fix branch でも可）
  - GitHub Checks に 3 つの Preview URL（candidate / business / admin）が表示される
  - 各 Preview URL の `/sign-in` が HTTP 200 で応答
  - 任意の Preview URL からメール送信 → Magic Link メール本文の URL がその Preview URL（`https://bulr-candidate-git-<branch>-<scope>.vercel.app/...` 等）を含む
  - Preview URL の Magic Link をクリックして同 Preview にサインインできる（VERCEL_URL フォールバックが効いている）
  - admin Preview から `/sessions/[id]` の面接後レポートリンクをクリック → `https://bz.bulr.net/interviews/[id]/report`（Production business）に到達して 200 応答（BUSINESS_BASE_URL Production 固定方針の確認）
  - **観測可能**: PR コメント / GitHub Checks に 3 Preview URL 表示、各 Preview で `/sign-in` 200、Magic Link が Preview URL に飛んでサインイン完了、admin Preview から business Production へ cross-app リンクが通る
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.2, 8.5, 8.6, 10.10_
  - _Boundary: DeploymentVerification/preview_
  - _Depends: 1.1, 5.1_

- [x] 7.5 3 プロジェクトの最新デプロイ Ready ステータス確認
  - Vercel ダッシュボードで 3 プロジェクトの「Production」タブを開く
  - 各プロジェクトの最新デプロイが「Ready」表示で、Failed / Error / Building 等の表示がない
  - **観測可能**: Vercel ダッシュボードで 3 プロジェクトとも最新 Production = Ready
  - _Requirements: 10.9_
  - _Depends: 7.1_

- [x] 8. docs/setup/vercel.md の全面書き換え

- [x] 8.1 3 アプリ対応の Vercel セットアップ runbook を作成
  - 既存 `docs/setup/vercel.md`（Stage 1 の `apps/web` 単一プロジェクト前提）を全面 rewrite
  - 構成セクション: 概要 / 前提条件 / Step 1: Vercel 3 プロジェクト新規作成 / Step 2: 環境変数登録 / Step 3: Custom Domain + Cloudflare DNS 設定 / Step 4: 旧プロジェクト廃止 / Step 5: Production 動作検証 / Troubleshooting
  - design.md の VercelEnvVars 表と DeploymentVerification の 10 項目チェックリストを docs に転記（design.md と docs/setup/vercel.md の二重メンテにならないよう、docs 側を一次資料とする）
  - Troubleshooting: DNS 伝播遅延 / SSL 証明書発行失敗 / Cloudflare proxy on の誤設定 / env 漏れ / cookie ドメイン不一致 など
  - **観測可能**: `docs/setup/vercel.md` が新内容に置き換わり、別の運用担当者が手順書通りに進めれば同じ構成を再現できる
  - _Requirements: 1.2, 9.1, 9.2, 9.3, 9.5_

- [x] 9. 旧 Vercel プロジェクトの削除

- [x] 9.1 24-72h rollback 猶予期間後に旧 Vercel プロジェクトを削除
  - task 7.x がすべて PASS してから 24-72 時間の rollback 猶予期間を置く
  - 削除直前の最終確認: 新 3 プロジェクトが Production live、旧 Blob ストアが business に re-link 済み（task 5.1）、旧 Custom Domain 解除済み（task 6.3）、`.env.old-project.backup` がローカル保管されている
  - 旧プロジェクト → Settings → General → Delete Project
  - 削除と同時に旧 Cron ジョブが消える（business 新プロジェクトに `audio-purge` が引き継がれていることを 7.3 で確認済み）
  - **観測可能**: Vercel ダッシュボードに新 3 プロジェクトのみ存在し、旧プロジェクトが一覧から消えている。3 ドメインは引き続き 200 応答する
  - _Requirements: 9.3, 9.5_
  - _Depends: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1_
