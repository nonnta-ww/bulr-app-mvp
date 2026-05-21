# Brief: authentication

## Problem

bulr Stage 1 では「**面接官**を識別する」「創業者だけが管理画面にアクセスできる」の 2 種類の認証境界が必要。面接官識別ができないと面接データを `interviewer_id` でスコープ保存できず、Stage 1 の検証ゴール（ベトナム人 20-30 + 日本人 10-20 のデータ収集）が成立しない。管理画面アクセス制御がないと、面接データ + 候補者個人情報が漏洩する。

v2 移行に伴い、v1 の「受験者（candidate）」が認証主体だった構造から、「**面接官（interviewer = user）**」が認証主体に変わる。候補者は bulr に直接ログインしない。

## Current State

- 認証実装ゼロ
- `monorepo-foundation` で `apps/web` と `packages/{db, types, lib, ai}` のスケルトンあり
- `multi-env-infrastructure` で `RESEND_API_KEY` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `ADMIN_ALLOWED_EMAILS` 等の環境変数規約あり
- `security.md` に多層認証パターン・認証ヘルパー・Server Action ラッパーの規約あり
- 参照プロジェクト `dishxdish-app-mvp` が Better Auth 1.6.x + Magic Link で実装済み。dishxdish は匿名セッション + dual-owner CHECK ありで複雑、bulr は Magic Link 必須 + 候補者は別テーブル（candidate）で管理する構造

## Desired Outcome

- 面接官は `/sign-in` でメール入力 → Magic Link 受信 → クリックでサインイン → セッション開始可能
- セッションは HttpOnly + Secure + SameSite=Lax Cookie で管理、有効期限適切
- 管理者は `/admin/login` で Magic Link サインイン + 許可メールリスト検査で `/admin/*` にアクセス可能
- `requireUser()` / `requireAdmin()` / `requireSessionOwnership()` の認証ヘルパーが `apps/web/lib/guards.ts` に実装されている
- `authedAction()` / `adminAction()` の Server Action ラッパーが `apps/web/lib/safe-action.ts` に実装されている
- `proxy.ts`（Next.js 16 で middleware.ts から rename）で UX リダイレクトを実装、ただしセキュリティは各レイヤーで独立チェック
- `user_profile` テーブルが `packages/db` に定義され、Better Auth `user` テーブルと 1:1 で **面接官プロファイル**（display_name / role_in_org / years_of_experience? 等）を保持できる
- `rate_limit` テーブルが `packages/db` に定義され、Magic Link + 後続 spec で利用される共通テーブルとなる
- Magic Link メール本文は日本語と英語のシンプルなテンプレート（Stage 1 は面接官向けメッセージ）
- Magic Link は使い切り、有効期限 15 分、Resend で配信

## Approach

dishxdish の Better Auth 設定を参考にしつつ、bulr 固有の単純化（匿名セッションなし、dual-owner CHECK なし、面接官のみ Magic Link）を適用。`packages/auth` には切り出さず、`apps/web/lib/auth/` に Better Auth 設定を直書き。Stage 2 で apps/admin 分離時に `packages/auth` へリファクタする。

- **Better Auth 1.6.x** で Magic Link プラグイン
- **Resend** で配信、シンプルな日本語+英語並記のプレーン HTML/テキストメール
- **多層認証**: `proxy.ts` は UX リダイレクトのみ、`requireUser()` を Server Component / Server Action / API Route で独立呼び出し
- **管理画面**: Server Component で `requireAdmin()` が Better Auth セッションを取得し `ADMIN_ALLOWED_EMAILS` と照合（proxy.ts は `/admin/*` を保護しない）
- **user_profile テーブル**: `user_id` を Better Auth `user.id` に外部キー、面接官固有データを保持（display_name / role_in_org / years_of_experience? 等）。Better Auth の `databaseHooks.user.create.after` で自動作成
- **rate_limit テーブル**: 共通テーブル、key prefix で `email:`、`ip:`、`session:` 等を区別。assessment-engine から再利用される
- **Server Action ラッパー**: `next-safe-action` 等のサードパーティライブラリは導入せず、自前で軽量実装（`security.md` の `authedAction` / `adminAction` 例に準拠）

## Scope

- **In**:
  - Better Auth 1.6.x 設定（`apps/web/lib/auth/server.ts`、`apps/web/lib/auth/client.ts`）
  - Magic Link プラグイン設定 + 有効期限 15 分 + 使い切り
  - Resend 統合（`apps/web/lib/email/resend.ts`）
  - Magic Link メールテンプレート（日本語 + 英語のシンプルテキスト + HTML、bulr のロゴと「サインインリンク」のみ、宛先は面接官）
  - Better Auth API ルート: `apps/web/app/api/auth/[...all]/route.ts`
  - サインイン UI: `apps/web/app/(interviewer)/sign-in/page.tsx`（メール入力フォーム + 送信完了表示）
  - 管理画面ログイン案内: `apps/web/app/admin/login/page.tsx`
  - `proxy.ts`（旧 middleware.ts）: 面接官ガード（未認証の `/interviews/*` を `/sign-in` にリダイレクト）。`/admin/*` は対象外
  - 認証ヘルパー: `apps/web/lib/guards.ts`（`requireUser`、`getCurrentUser`、`requireAdmin`、`requireSessionOwnership`）
  - Server Action ラッパー: `apps/web/lib/safe-action.ts`（`authedAction`、`adminAction`）
  - DB スキーマ: Better Auth テーブル（`user`、`session`、`account`、`verification`）+ `user_profile` テーブル（`user_id` FK、`display_name`、`role_in_org` 等、`created_at` / `updated_at`）+ `rate_limit` テーブル（key prefix で email/ip/session 区別）
  - drizzle-kit migration（dev branch にスキーマ反映、ファイル名は `*_authentication.sql` の glob で参照）
  - レート制限実装（Magic Link 送信: メールあたり 3 回/5 分、IP ベース 20 回/時、`rate_limit` テーブルに記録、ON CONFLICT DO UPDATE）
  - Better Auth `databaseHooks.user.create.after` で `user_profile` 自動作成
  - 面接官プロファイル編集 UI（最低限：display_name のみ、Stage 1 では `/interviews/new` ページ内で初回のみ入力 → user_profile に保存。専用設定ページは Stage 2）
  - Zod 入力検証（メール形式、面接官プロファイル入力）
  - smoke test ページ `apps/web/app/admin/_health/page.tsx`（admin-review-panel が `/admin/sessions` を実装した時点で削除予定、本 spec で一時設置）

- **Out**:
  - 面接セッション作成ロジック（assessment-engine spec）
  - 面接ターン処理 API（assessment-engine spec）
  - 候補者情報入力 UI（assessment-engine spec、ただし面接官プロファイル入力は本 spec の `/interviews/new` 雛形に含む）
  - 管理画面の機能 UI（admin-review-panel spec、本 spec は管理画面ログイン案内と proxy.ts による面接官 UX リダイレクトのみ）
  - Google OAuth、SSO（Stage 2）
  - パスワード認証（Stage 1 では使わない）
  - 候補者向け認証（候補者は bulr にログインしない、Stage 3 で追加検討）
  - データエクスポート、アカウント削除フロー（Stage 3、企業側機能として実装）
  - 監査ログ（Stage 2）

## Boundary Candidates

- Better Auth サーバー設定（`apps/web/lib/auth/`）
- Resend / メールテンプレート（`apps/web/lib/email/`）
- 認証ヘルパー（`apps/web/lib/guards.ts`）
- Server Action ラッパー（`apps/web/lib/safe-action.ts`）
- proxy.ts（UX リダイレクトのみ）
- DB スキーマ（Better Auth テーブル + user_profile + rate_limit）
- サインイン UI（`(interviewer)/sign-in/`）
- 管理画面ログイン UI（`admin/login/`）
- smoke test ページ（`admin/_health/`）

## Out of Boundary

- 面接セッション作成・進行・完了処理（assessment-engine spec）
- LLM 関数・Whisper 統合（assessment-engine spec）
- 管理画面の機能ページ（`admin/sessions/` など、admin-review-panel spec）
- ヒートマップ可視化（admin-review-panel spec、ただし面接官向けレポートは assessment-engine spec）
- マルチテナント（workspace 概念は Stage 2）
- Stage 2 の認証拡張（Google OAuth、SSO、Apple Sign-in）

## Upstream / Downstream

- **Upstream**:
  - `monorepo-foundation`（apps/web と packages/db スケルトン）
  - `multi-env-infrastructure`（Resend API キー、Neon DB 接続、`BETTER_AUTH_*` / `ADMIN_*` 環境変数規約）
- **Downstream**:
  - `assessment-engine`（`requireUser` で面接官ガード、`authedAction` でセッション作成、`requireSessionOwnership` でセッション所有権チェック、`user_profile` を読んで面接官コンテキストに使う、`rate_limit` テーブルを再利用してチャット API レート制限）
  - `admin-review-panel`（`requireAdmin` で管理画面ガード、smoke test ページの削除・置き換え）

## Existing Spec Touchpoints

- **Extends**: なし
- **Adjacent**:
  - `monorepo-foundation`: apps/web の `app/` 構造を使う
  - `multi-env-infrastructure`: 環境変数規約を共有、`.env.example` に Better Auth + Resend + ADMIN 関連を追加
  - `assessment-engine`: `user_profile` スキーマ + `rate_limit` テーブルを共有（本 spec が定義し、assessment-engine が読み取り・利用）

## Constraints

- **`tech.md` 準拠**:
  - Better Auth 1.6.x + Magic Link
  - Resend で配信
  - HttpOnly + Secure + SameSite=Lax cookies
  - Magic Link 有効期限 15 分、使い切り
- **`security.md` 準拠**:
  - 多層認証: proxy.ts は UX、Server Component / Server Action / API Route で独立チェック
  - CVE-2025-29927 教訓: middleware だけに認可を依存しない（proxy.ts JSDoc に明記）
  - Better Auth 管理テーブルに独自カラムを追加しない（user_profile を別テーブルで 1:1 参照）
  - 管理画面は ADMIN_ALLOWED_EMAILS 許可メール検査
  - レート制限: Magic Link メールあたり 3 回/5 分、IP ベース 20 回/時、`rate_limit` テーブルに記録
  - Zod で全入力を検証（メール形式、面接官プロファイル入力）
- **`structure.md` 準拠**:
  - Stage 1 では `packages/auth` に切り出さない、`apps/web/lib/auth/` に直書き
  - Stage 2 で apps/admin 分離時に packages/auth へリファクタ
- **i18n**: Stage 1 は日本語のみ。Magic Link メールは日本語 + 英語の二か国語並記
- **DB**: Better Auth のテーブル名（`user`、`session`、`account`、`verification`）はそのまま、独自カラムを追加しない。`user_profile` を別テーブルで `user_id` FK 1:1 参照、Better Auth の `databaseHooks.user.create.after` で自動作成
- **ローカル開発**: dev branch DATABASE_URL を使い、ローカルで Magic Link 動作確認可能（Resend が本物のメールを配信、開発者は自分のメールで受信）
- **マイグレーションファイル名**: `packages/db/drizzle/*_authentication.sql` の glob で参照（番号は drizzle-kit が決定）
