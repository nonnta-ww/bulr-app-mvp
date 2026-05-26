# Implementation Plan — multi-app-deployment

> 本 spec は Stage 2 再設計 Wave 1 の仕上げ。`monorepo-app-split` でローカル動作するようになった 3 アプリを、Vercel の 3 独立プロジェクトとして本番デプロイ可能な状態にする。9 major task / 16 sub-task に分解。`(P)` マーカー = 並列実行可能。大半は Vercel ダッシュボード操作 + Cloudflare DNS 設定 + 検証 + ドキュメント書き換え。コード変更は 1 行のみ（Better Auth baseURL の Preview 動的解決）。

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

- [ ] 2.1 旧プロジェクトの環境変数と Blob ストアトークンを抽出
  - Vercel CLI でローカルマシンから旧プロジェクトに `vercel link` → `vercel env pull .env.old-project.backup`（Production / Preview / Development すべて含む）
  - Settings → Storage で Vercel Blob ストアの token と store ID を別途記録（ストアが既存の場合）
  - 控えファイルは git 管理外に保管（`.gitignore` で `.env*.local` 除外済み）
  - **観測可能**: `.env.old-project.backup` がローカルに作成され、本番値（API キー / secret / token）がすべて含まれる。Blob ストア情報（token / store ID）は別途記録済み
  - _Requirements: 9.1_

## Core phase（Vercel 3 プロジェクト準備 + env + Blob）

- [ ] 3. Vercel 3 プロジェクト新規作成

- [ ] 3.1 (P) bulr-candidate プロジェクトを Vercel に作成
  - Vercel ダッシュボード → Add New Project → bulr-app-mvp リポジトリ選択
  - Framework Preset: Next.js / Root Directory: `apps/candidate` / Production Branch: `main`
  - Build Command / Install Command / Output Directory はデフォルト（Vercel が pnpm-lock.yaml + Turborepo を自動検出）
  - 初回 deploy は env 未設定のため失敗する可能性あり（後続 task 4.x で env 登録後に redeploy）
  - **観測可能**: Vercel ダッシュボードに `bulr-candidate` プロジェクトが Root Directory = `apps/candidate` で表示される。Production Branch が `main` に設定されている
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
  - _Boundary: VercelProjects/bulr-candidate_

- [ ] 3.2 (P) bulr-business プロジェクトを Vercel に作成
  - 同上、Root Directory = `apps/business`
  - `apps/business/vercel.json` の `crons` 定義が自動検出され、Cron Jobs に `audio-purge` が登録される（env 未設定段階では Production 動作はしない）
  - **観測可能**: `bulr-business` プロジェクトが表示され、Cron Jobs ダッシュボードに `audio-purge` が `0 18 * * *` で表示される
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 6.1, 6.2_
  - _Boundary: VercelProjects/bulr-business_

- [ ] 3.3 (P) bulr-admin プロジェクトを Vercel に作成
  - 同上、Root Directory = `apps/admin`
  - `apps/admin/` に `vercel.json` が無いため Cron Jobs ダッシュボードは空のまま
  - **観測可能**: `bulr-admin` プロジェクトが表示され、Cron Jobs が空であることが確認できる
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 6.3_
  - _Boundary: VercelProjects/bulr-admin_

- [ ] 4. 環境変数の least-privilege 登録

- [ ] 4.1 (P) 共有環境変数を 3 プロジェクトに登録
  - design.md の VercelEnvVars 表「3 プロジェクト共通」に従い、`DATABASE_URL` / `BETTER_AUTH_SECRET` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `WHISPER_PROVIDER` / `RESEND_API_KEY` を 3 プロジェクトの Production / Preview 両方に登録
  - 値は task 2.1 で抽出した `.env.old-project.backup` から再利用（API キー / secret 類は変えない）
  - `DATABASE_URL`: Production = Neon production branch URL、Preview = Neon dev branch URL
  - `SMTP_HOST` / `SMTP_PORT` は **登録しない**（ローカル Mailpit 専用、本番は Resend を使う）
  - **観測可能**: 3 プロジェクトすべての Settings → Environment Variables で共有 6 変数が Production / Preview 両方に登録され、`SMTP_HOST` / `SMTP_PORT` は存在しない
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.7_
  - _Boundary: VercelEnvVars/shared_
  - _Depends: 2.1, 3.1, 3.2, 3.3_

- [ ] 4.2 (P) candidate プロジェクト固有 env
  - `BETTER_AUTH_URL=https://bulr.net`（Production のみ）
  - `NEXT_PUBLIC_APP_URL=https://bulr.net`（Production のみ）
  - Preview には登録しない（task 1.1 で実装した `VERCEL_URL` フォールバックが効く）
  - **観測可能**: candidate プロジェクトの Production env に 2 つの URL 系変数が登録され、Preview env には未登録
  - _Requirements: 5.1_
  - _Boundary: VercelEnvVars/candidate_
  - _Depends: 3.1_

- [ ] 4.3 (P) business プロジェクト固有 env
  - `BETTER_AUTH_URL=https://bz.bulr.net` / `NEXT_PUBLIC_APP_URL=https://bz.bulr.net`（Production のみ）
  - `BLOB_STORAGE_PROVIDER=vercel-blob`（Production / Preview 両方）
  - `CRON_SECRET` は Vercel Cron が自動付与するため手動入力不要（後続 5.1 で再確認）
  - **観測可能**: business の Production env に URL 系 + Blob プロバイダ設定が登録され、Cron Secret は Vercel システムが自動付与している
  - _Requirements: 5.1, 5.2, 5.3_
  - _Boundary: VercelEnvVars/business_
  - _Depends: 3.2_

- [ ] 4.4 (P) admin プロジェクト固有 env
  - `BETTER_AUTH_URL=https://admin.bulr.net` / `NEXT_PUBLIC_APP_URL=https://admin.bulr.net`（Production のみ）
  - `ADMIN_ALLOWED_EMAILS`（task 2.1 で控えた値を再利用、Production / Preview 両方）
  - `BUSINESS_BASE_URL=https://bz.bulr.net`（Production / Preview 両方、Preview も Production 固定方針 — research.md 7.2 参照）
  - **観測可能**: admin プロジェクトの env に admin 固有 4 変数が登録され、`BUSINESS_BASE_URL` は Preview でも Production 値が入っている
  - _Requirements: 5.1, 5.4, 5.5_
  - _Boundary: VercelEnvVars/admin_
  - _Depends: 3.3_

- [ ] 5. business プロジェクトに Vercel Blob ストアを接続

- [ ] 5.1 既存 Blob ストアを business に re-link または新規ストア作成
  - 旧プロジェクトに紐づいた Blob ストアが存在する場合（task 2.1 で控えた token / store ID から判定）: business プロジェクト Settings → Storage で「Connect Existing Store」を選択し、token を手動セット
  - 存在しない場合: business プロジェクトで新規 Blob ストア（store 名は `bulr-audio` 等）を作成、Vercel が `BLOB_READ_WRITE_TOKEN` を business の Production / Preview env に自動 inject
  - **観測可能**: business プロジェクトの Settings → Storage に Blob ストアが「Connected」表示され、`BLOB_READ_WRITE_TOKEN` が business の Production / Preview env に存在する
  - _Requirements: 4.5, 5.3, 9.4_
  - _Depends: 2.1, 3.2_

## Integration phase（DNS と Custom Domain、旧 Custom Domain 移管）

- [ ] 6. Cloudflare DNS と Vercel Custom Domain 設定

- [ ] 6.1 Cloudflare DNS レコードを設定
  - Cloudflare ダッシュボードで bulr.net ゾーン → DNS Records
  - apex（`@`）: A レコード → Vercel ダッシュボードで案内される IP（プロジェクト固有値、Vercel UI に表示）、Proxy status = **DNS only**（gray cloud）、TTL Auto
  - `bz`: CNAME → Vercel ダッシュボードで案内される target（例: `cname.vercel-dns.com` または `<hash>.vercel-dns-NNN.com`）、Proxy status = DNS only
  - `admin`: CNAME 同上、Proxy status = DNS only
  - Cloudflare → SSL/TLS → Overview を **Full (strict)** に設定
  - **観測可能**: `dig bulr.net A` / `dig bz.bulr.net CNAME` / `dig admin.bulr.net CNAME` で Vercel の指定 target が解決される（DNS 伝播後、数分〜数十分）
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_
  - _Depends: 3.1, 3.2, 3.3_

- [ ] 6.2 Vercel に 3 つの Custom Domain を登録
  - bulr-candidate プロジェクト Settings → Domains で `bulr.net` を追加（Primary、必要なら `www.bulr.net` → `bulr.net` の redirect も設定）
  - bulr-business プロジェクトで `bz.bulr.net` を追加
  - bulr-admin プロジェクトで `admin.bulr.net` を追加
  - 旧 Vercel プロジェクトに既に `bulr.net` 等が紐づいている場合は Vercel UI の「Move Domain」機能で新プロジェクトへ atomic 移管（remove → add の手順ではダウンタイムが発生するため避ける）
  - Vercel が SSL 証明書（Let's Encrypt）を自動発行するまで待機（DNS 伝播後 数分〜数十分）
  - 必要に応じて Vercel が要求する TXT レコードを Cloudflare に追加（SSL 検証用）
  - **観測可能**: Vercel ダッシュボードで 3 ドメインすべて「Valid Configuration」表示され、`https://bulr.net/sign-in`、`https://bz.bulr.net/sign-in`、`https://admin.bulr.net/sign-in` が HTTP 200 で応答する
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.4_
  - _Depends: 4.1, 4.2, 4.3, 4.4, 5.1, 6.1_

- [ ] 6.3 旧 Vercel プロジェクトから Custom Domain を解除
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

- [ ] 7.3 (P) Cron 登録の business 限定と認証動作確認
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

- [ ] 7.5 3 プロジェクトの最新デプロイ Ready ステータス確認
  - Vercel ダッシュボードで 3 プロジェクトの「Production」タブを開く
  - 各プロジェクトの最新デプロイが「Ready」表示で、Failed / Error / Building 等の表示がない
  - **観測可能**: Vercel ダッシュボードで 3 プロジェクトとも最新 Production = Ready
  - _Requirements: 10.9_
  - _Depends: 7.1_

- [ ] 8. docs/setup/vercel.md の全面書き換え

- [ ] 8.1 3 アプリ対応の Vercel セットアップ runbook を作成
  - 既存 `docs/setup/vercel.md`（Stage 1 の `apps/web` 単一プロジェクト前提）を全面 rewrite
  - 構成セクション: 概要 / 前提条件 / Step 1: Vercel 3 プロジェクト新規作成 / Step 2: 環境変数登録 / Step 3: Custom Domain + Cloudflare DNS 設定 / Step 4: 旧プロジェクト廃止 / Step 5: Production 動作検証 / Troubleshooting
  - design.md の VercelEnvVars 表と DeploymentVerification の 10 項目チェックリストを docs に転記（design.md と docs/setup/vercel.md の二重メンテにならないよう、docs 側を一次資料とする）
  - Troubleshooting: DNS 伝播遅延 / SSL 証明書発行失敗 / Cloudflare proxy on の誤設定 / env 漏れ / cookie ドメイン不一致 など
  - **観測可能**: `docs/setup/vercel.md` が新内容に置き換わり、別の運用担当者が手順書通りに進めれば同じ構成を再現できる
  - _Requirements: 1.2, 9.1, 9.2, 9.3, 9.5_

- [ ] 9. 旧 Vercel プロジェクトの削除

- [ ] 9.1 24-72h rollback 猶予期間後に旧 Vercel プロジェクトを削除
  - task 7.x がすべて PASS してから 24-72 時間の rollback 猶予期間を置く
  - 削除直前の最終確認: 新 3 プロジェクトが Production live、旧 Blob ストアが business に re-link 済み（task 5.1）、旧 Custom Domain 解除済み（task 6.3）、`.env.old-project.backup` がローカル保管されている
  - 旧プロジェクト → Settings → General → Delete Project
  - 削除と同時に旧 Cron ジョブが消える（business 新プロジェクトに `audio-purge` が引き継がれていることを 7.3 で確認済み）
  - **観測可能**: Vercel ダッシュボードに新 3 プロジェクトのみ存在し、旧プロジェクトが一覧から消えている。3 ドメインは引き続き 200 応答する
  - _Requirements: 9.3, 9.5_
  - _Depends: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1_
