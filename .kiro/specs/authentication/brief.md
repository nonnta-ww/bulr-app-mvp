# Brief: authentication

## Problem

bulr Stage 1 では「受験者を識別する」「創業者だけが管理画面にアクセスできる」の 2 種類の認証境界が必要。受験者識別ができないと回答を `user_id` でスコープ保存できず、Stage 1 の検証ゴール（ベトナム人 50 + 日本人 20 のデータ収集）が成立しない。管理画面アクセス制御がないと、回答データ + 受験者メールが漏洩する。

## Current State

- 認証実装ゼロ
- `monorepo-foundation` で `apps/web` と `packages/{db, types, lib, ai}` のスケルトンあり
- `multi-env-infrastructure` で `RESEND_API_KEY` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `ADMIN_ALLOWED_EMAILS` / `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` 等の環境変数規約あり
- `security.md` に多層認証パターン・認証ヘルパー・Server Action ラッパーの規約あり
- 参照プロジェクト `dishxdish-app-mvp` が Better Auth 1.6.x + Magic Link で実装済み。ただし dishxdish は匿名セッション + dual-owner CHECK ありで複雑、bulr は Magic Link 必須で簡素化

## Desired Outcome

- 受験者は `/assessments/start` でメール入力 → Magic Link 受信 → クリックでサインイン → セッション開始可能
- セッションは HttpOnly + Secure + SameSite=Lax Cookie で管理、有効期限適切
- 管理者は `/admin/login` で Basic 認証通過 + 許可メールリスト二重チェックで `/admin/*` にアクセス可能
- `requireUser()` / `requireAdmin()` / `requireSessionOwnership()` の認証ヘルパーが `apps/web/lib/guards.ts` に実装されている
- `authedAction()` / `adminAction()` の Server Action ラッパーが `apps/web/lib/safe-action.ts` に実装されている
- `proxy.ts`（Next.js 16 で middleware.ts から rename）で UX リダイレクトを実装、ただしセキュリティは各レイヤーで独立チェック
- `user_profile` テーブルが `packages/db` に定義され、Better Auth `user` テーブルと 1:1 で受験プロファイル（経験年数等）を保持できる
- Magic Link メール本文は日本語と英語のシンプルなテンプレート（Stage 1 はベトナム人受験者向けに英語が読めれば OK）
- Magic Link は使い切り、有効期限 15 分、Resend で配信

## Approach

dishxdish の Better Auth 設定を参考にしつつ、bulr 固有の単純化（匿名セッションなし、dual-owner CHECK なし）を適用。`packages/auth` には切り出さず、`apps/web/lib/auth/` に Better Auth 設定を直書き。Stage 2 で apps/admin 分離時に `packages/auth` へリファクタする。

- **Better Auth 1.6.x** で Magic Link プラグイン
- **Resend** で配信、`React Email` でテンプレート（Stage 1 は最小限のテキストメール + HTML 一体型）
- **多層認証**: `proxy.ts` は UX リダイレクトのみ、`requireUser()` を Server Component / Server Action / API Route で独立呼び出し
- **管理画面**: Vercel の Basic 認証は使わず、`proxy.ts` 内で Authorization ヘッダーをチェック（`ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` と照合）→ Server Component で `requireAdmin()` が `ADMIN_ALLOWED_EMAILS` と Better Auth セッションを照合する二段構成
- **user_profile テーブル**: `user_id` を Better Auth `user.id` に外部キー、profile_input JSONB で経験年数等を保持
- **Server Action ラッパー**: `next-safe-action` 等のサードパーティライブラリは導入せず、自前で軽量実装（`security.md` の `authedAction` / `adminAction` 例に準拠）

## Scope

- **In**:
  - Better Auth 1.6.x 設定（`apps/web/lib/auth/server.ts`、`apps/web/lib/auth/client.ts`）
  - Magic Link プラグイン設定 + 有効期限 15 分 + 使い切り
  - Resend 統合（`apps/web/lib/email/resend.ts`）
  - Magic Link メールテンプレート（日本語 + 英語のシンプルテキスト + HTML、bulr のロゴと「サインインリンク」のみ）
  - Better Auth API ルート: `apps/web/app/api/auth/[...all]/route.ts`
  - サインイン UI: `apps/web/app/(assessment)/assessments/start/page.tsx`（メール入力フォーム + 送信完了表示）
  - 管理画面 Basic 認証ログイン: `apps/web/app/admin/login/page.tsx`
  - `proxy.ts`（旧 middleware.ts）: 管理画面 Basic 認証チェック + 受験者ガード（未認証の `/assessments/[id]` を `/assessments/start` にリダイレクト）
  - 認証ヘルパー: `apps/web/lib/guards.ts`（`requireUser`、`getCurrentUser`、`requireAdmin`、`requireSessionOwnership`）
  - Server Action ラッパー: `apps/web/lib/safe-action.ts`（`authedAction`、`adminAction`）
  - DB スキーマ: Better Auth テーブル（`user`、`session`、`account`、`verification`）+ `user_profile` テーブル（`user_id` FK、`profile_input` JSONB、`created_at` / `updated_at`）
  - drizzle-kit migration（dev branch にスキーマ反映）
  - 受験プロファイル入力フォーム（サインイン直後の onboarding として `/assessments/start` の次ページ、または `/assessments/[sessionId]` の最初のステップとして提示。境界は design 段階で確定）
  - レート制限（Magic Link 送信: メールあたり 3 回/5 分、IP ベース 20 回/時）
  - Zod 入力検証（メール形式、Basic 認証情報）

- **Out**:
  - 受験セッション作成ロジック（assessment-engine spec）
  - 問診の対話 API（assessment-engine spec）
  - 管理画面の機能 UI（admin-review-panel spec、本 spec は Basic 認証ログインと proxy.ts ガードのみ）
  - Google OAuth、SSO（Stage 2）
  - パスワード認証（Stage 1 では使わない）
  - 匿名セッション（bulr Stage 1 は Magic Link 必須）
  - データエクスポート、アカウント削除フロー（Stage 2）
  - 監査ログ（Stage 2）

## Boundary Candidates

- Better Auth サーバー設定（`apps/web/lib/auth/`）
- Resend / メールテンプレート（`apps/web/lib/email/`）
- 認証ヘルパー（`apps/web/lib/guards.ts`）
- Server Action ラッパー（`apps/web/lib/safe-action.ts`）
- proxy.ts（UX リダイレクト + Basic 認証チェック）
- DB スキーマ（Better Auth テーブル + user_profile）
- サインイン UI（`(assessment)/assessments/start/`）
- 管理画面ログイン UI（`admin/login/`）

## Out of Boundary

- 受験セッション開始・進行・完了処理（assessment-engine spec）
- LLM チャット API・Tool 実装（assessment-engine spec）
- 管理画面の機能ページ（`admin/sessions/` など、admin-review-panel spec）
- ヒートマップ可視化（admin-review-panel spec）
- マルチテナント（workspace 概念は Stage 2）
- Stage 2 の認証拡張（Google OAuth、SSO、Apple Sign-in）

## Upstream / Downstream

- **Upstream**:
  - `monorepo-foundation`（apps/web と packages/db スケルトン）
  - `multi-env-infrastructure`（Resend API キー、Neon DB 接続、`BETTER_AUTH_*` / `ADMIN_*` 環境変数規約）
- **Downstream**:
  - `assessment-engine`（`requireUser` で受験者ガード、`authedAction` で回答記録、`user_profile` を読んで受験コンテキストに使う）
  - `admin-review-panel`（`requireAdmin` で管理画面ガード、Basic 認証チェック）

## Existing Spec Touchpoints

- **Extends**: なし
- **Adjacent**:
  - `monorepo-foundation`: apps/web の `app/` 構造を使う
  - `multi-env-infrastructure`: 環境変数規約を共有、`.env.example` に Better Auth + Resend + ADMIN 関連を追加
  - `assessment-engine`: `user_profile` スキーマを共有（本 spec が定義し、assessment-engine が読み取る）

## Constraints

- **`tech.md` 準拠**:
  - Better Auth 1.6.x + Magic Link
  - Resend で配信
  - HttpOnly + Secure + SameSite=Lax cookies
  - Magic Link 有効期限 15 分、使い切り
- **`security.md` 準拠**:
  - 多層認証: proxy.ts は UX、Server Component / Server Action / API Route で独立チェック
  - CVE-2025-29927 教訓: middleware だけに認可を依存しない
  - Better Auth 管理テーブルに独自カラムを追加しない（user_profile を別テーブルで 1:1 参照）
  - 管理画面は Basic 認証 + ADMIN_ALLOWED_EMAILS 二重チェック
  - レート制限: Magic Link メールあたり 3 回/5 分、IP ベース 20 回/時
  - Zod で全入力を検証（メール形式、Basic 認証情報）
- **`structure.md` 準拠**:
  - Stage 1 では `packages/auth` に切り出さない、`apps/web/lib/auth/` に直書き
  - Stage 2 で apps/admin 分離時に packages/auth へリファクタ
- **i18n**: Stage 1 は日本語のみ。Magic Link メールは日本語 + 英語の二か国語並記でベトナム人受験者にも対応（next-intl 等は使わず単純なテンプレート）
- **DB**: Better Auth のテーブル名（`user`、`session`、`account`、`verification`）はそのまま、独自カラムを追加しない。`user_profile` を別テーブルで `user_id` FK 1:1 参照
- **ローカル開発**: dev branch DATABASE_URL を使い、ローカルで Magic Link 動作確認可能（Resend が本物のメールを配信、開発者は自分のメールで受信）
