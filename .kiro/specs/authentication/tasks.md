# Implementation Plan: authentication

> 本タスクリストは bulr Stage 1 MVP の認証境界 2 種（受験者 = Magic Link、創業者/管理者 = Basic 認証 + 許可メール二重チェック）を、Better Auth 1.6.x + Resend + Drizzle ORM + Next.js 16 で構築する。`monorepo-foundation` で整備された apps/web スケルトンと packages/db、`multi-env-infrastructure` で確立された環境変数規約 (`BETTER_AUTH_*` / `RESEND_API_KEY` / `ADMIN_*`) を前提とする。
> ファイルパスはすべてリポジトリルート `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/` を起点とした相対パスで記載する。
> 後続 spec (`assessment-engine` / `admin-review-panel`) は本スペックが提供する `apps/web/lib/guards.ts` と `apps/web/lib/safe-action.ts` の API のみを依存先とする。

## Foundation: 依存追加と DB スキーマ整備

- [ ] 1. apps/web に Better Auth + Resend の依存を追加
- [ ] 1.1 `apps/web/package.json` に `better-auth` と `resend` を追加
  - `dependencies` に `"better-auth": "^1.6.0"` と `"resend": "^4.0.0"` を追記
  - リポジトリルートで `pnpm install` を実行し、`pnpm-lock.yaml` を更新する
  - 観測完了条件: `apps/web/node_modules/better-auth/package.json` と `apps/web/node_modules/resend/package.json` が存在し、`pnpm --filter web typecheck` がエラーなく完了する
  - _Requirements: 12.1_
  - _Boundary: WebApp (apps/web/package.json)_

- [ ] 2. packages/db に Better Auth 4 テーブル + user_profile + rate_limit の Drizzle スキーマを追加
- [ ] 2.1 (P) `packages/db/src/schema/auth.ts` に Better Auth 4 テーブルを定義
  - `user` (`id` text PK、`email` text UK、`emailVerified` bool、`name` text nullable、`image` text nullable、`createdAt`、`updatedAt`)
  - `session` (`id` text PK、`userId` text FK→user.id ON DELETE CASCADE、`token` text UK、`expiresAt` timestamp、`ipAddress` text nullable、`userAgent` text nullable、`createdAt`、`updatedAt`)
  - `account` (`id` text PK、`userId` text FK→user.id ON DELETE CASCADE、`accountId` text、`providerId` text、`accessToken` text nullable、`refreshToken` text nullable、`accessTokenExpiresAt` timestamp nullable、`refreshTokenExpiresAt` timestamp nullable、`scope` text nullable、`idToken` text nullable、`password` text nullable、`createdAt`、`updatedAt`)
  - `verification` (`id` text PK、`identifier` text、`value` text、`expiresAt` timestamp、`createdAt`、`updatedAt`)
  - すべて `pgTable` で snake_case 命名 (Drizzle の `casing: 'snake_case'` で自動変換)
  - 独自カラムは追加しない
  - 観測完了条件: ファイル import で `pnpm --filter @bulr/db typecheck` がエラーなく完了
  - _Requirements: 7.1_
  - _Boundary: AuthSchema (packages/db/src/schema/auth.ts)_

- [ ] 2.2 (P) `packages/db/src/schema/user-profile.ts` に user_profile テーブルを定義
  - `userId` text PK + FK → `user.id` `ON DELETE CASCADE`
  - `profileInput` jsonb NOT NULL DEFAULT `{}`、TypeScript 型は `Record<string, unknown>`
  - `createdAt` / `updatedAt` timestamp with timezone NOT NULL DEFAULT now()
  - `UserProfile` / `NewUserProfile` 型を `$inferSelect` / `$inferInsert` で export
  - 観測完了条件: ファイル import で typecheck 通過、`pgTable` 名が `'user_profile'` であることが Drizzle 出力で確認できる
  - _Requirements: 7.2, 7.3, 7.5, 7.7_
  - _Boundary: UserProfileSchema (packages/db/src/schema/user-profile.ts)_
  - _Depends: 2.1_

- [ ] 2.3 (P) `packages/db/src/schema/rate-limit.ts` に rate_limit テーブルを定義
  - `key` text PK (例: `email:user@example.com` or `ip:192.0.2.1`)
  - `count` integer NOT NULL DEFAULT 0
  - `windowStart` timestamp with timezone NOT NULL DEFAULT now()
  - `expiresAt` timestamp with timezone NOT NULL
  - `RateLimitRow` 型を `$inferSelect` で export
  - 観測完了条件: ファイル import で typecheck 通過
  - _Requirements: 9.4_
  - _Boundary: RateLimitSchema (packages/db/src/schema/rate-limit.ts)_

- [ ] 2.4 `packages/db/src/schema/index.ts` を更新して 3 ファイルを re-export
  - 既存の `export {};` を `export * from './auth';` `export * from './user-profile';` `export * from './rate-limit';` に置換
  - 観測完了条件: `import { user, session, userProfile, rateLimit } from '@bulr/db'` が typecheck 通過する
  - _Requirements: 7.6_
  - _Boundary: DbPkg (packages/db/src/schema/index.ts)_
  - _Depends: 2.1, 2.2, 2.3_

- [ ] 2.5 Drizzle migration を生成
  - `pnpm --filter @bulr/db generate` を実行し、`packages/db/drizzle/*_authentication.sql`（drizzle-kit が次に利用可能な連番で出力。`assessment-pattern-seed` と並列 Wave 2 のため、実行順序により `0001_authentication.sql` または `0002_authentication.sql` になる）を生成
  - 生成された SQL を確認: `user` / `session` / `account` / `verification` / `user_profile` / `rate_limit` の 6 テーブルが CREATE TABLE 文に含まれていること、外部キー制約 (`user_profile.user_id` → `user.id` ON DELETE CASCADE) が含まれていること
  - 必要に応じてリポジトリにコミット
  - 観測完了条件: `packages/db/drizzle/*_authentication.sql` に一致するファイルが 1 つ存在し、`grep -c 'CREATE TABLE' packages/db/drizzle/*_authentication.sql` の結果が 6
  - _Requirements: 7.6, 12.7_
  - _Boundary: DBMigration (packages/db/drizzle/*_authentication.sql)_
  - _Depends: 2.4_

## Core: メールテンプレートと Resend クライアント

- [ ] 3. メール配信レイヤーを実装
- [ ] 3.1 (P) `apps/web/lib/email/magic-link-template.ts` に日本語+英語並記テンプレートを実装
  - `buildMagicLinkEmail(input: { url: string }): { subject: string; text: string; html: string }` を export
  - subject: `'[bulr] サインインリンク / Sign-in link'`
  - text: 日本語ブロック (CTA URL + 「このリンクは 15 分で失効します」 + 「心当たりがない場合は無視してください」) → 英語ブロック (同等内容) → bulr フッター
  - html: 同内容を `<p>` と `<a href="${url}">` で構成、装飾なし
  - 純関数 (副作用なし、env 参照なし)、`'server-only'` 不要
  - 観測完了条件: `buildMagicLinkEmail({ url: 'https://example.com' })` が呼び出し可能で、戻り値の `subject` / `text` / `html` がすべて非空文字列、text と html の両方に与えられた URL が含まれる
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - _Boundary: EmailTemplate (apps/web/lib/email/magic-link-template.ts)_

- [ ] 3.2 (P) `apps/web/lib/email/resend.ts` に Resend クライアントシングルトンを実装
  - 冒頭で `'server-only'` を import
  - 起動時に `process.env.RESEND_API_KEY` を検証、未設定なら `throw new Error('RESEND_API_KEY is required')`
  - `new Resend(env.RESEND_API_KEY)` のシングルトン化
  - `resendClient.send({ to, subject, text, html })` 関数を export:
    - `from: 'bulr <onboarding@resend.dev>'` (Stage 1 Resend テストドメイン)
    - `process.env.RESEND_REPLY_TO_EMAIL` が設定されていれば `reply_to` に渡す、未設定なら省略
    - 送信完了後に `console.info({ event: 'magic_link_send', to_hash: <sha256(to).slice(0,8)>, success, timestamp })` でログ出力
    - Resend がエラーを返したら `throw new Error(...)`
  - 観測完了条件: `apps/web/lib/email/resend.ts` の import が成立し、`RESEND_API_KEY` 未設定で test runner / dev server 起動時に throw される
  - _Requirements: 1.2, 8.5, 8.6, 8.7, 12.1, 12.2_
  - _Boundary: ResendClient (apps/web/lib/email/resend.ts)_
  - _Depends: 1.1_

## Core: 認証ヘルパーと Server Action ラッパー

- [ ] 4. 認証ヘルパーと Server Action ラッパーを実装
- [ ] 4.1 `apps/web/lib/guards.ts` に AuthError と認証ヘルパー群を実装
  - 冒頭で `'server-only'` を import
  - `AuthErrorCode` union 型 (`'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND_OR_FORBIDDEN' | 'RATE_LIMITED'`) を export
  - `AuthError` クラス (extends `Error`、`code` プロパティ、`name = 'AuthError'`) を export
  - `CurrentUser` 型 (`{ userId: string; email: string }`) を export
  - `getCurrentUser(): Promise<CurrentUser | null>` を実装。Better Auth `auth.api.getSession({ headers: await headers() })` を呼び、`session.user` から `id` と `email` を抽出。null ならば未認証
  - `requireUser(): Promise<CurrentUser>` を実装。`getCurrentUser()` が null なら `throw new AuthError('UNAUTHORIZED')`
  - `requireAdmin(): Promise<CurrentUser>` を実装。`requireUser()` を呼び、`process.env.ADMIN_ALLOWED_EMAILS` を comma-split + trim + lowercase した配列に email (lowercase) が含まれるか確認。空配列または不一致は `console.warn({ event: 'admin_access_denied', email, timestamp })` を出力した後に `throw new AuthError('FORBIDDEN')`
  - `requireSessionOwnership<T extends { userId: string }>(resource: T | null | undefined, userId: string): asserts resource is T` を実装。`resource` が null/undefined または `resource.userId !== userId` なら `throw new AuthError('NOT_FOUND_OR_FORBIDDEN')`
  - 観測完了条件: ファイル単体で `pnpm --filter web typecheck` がエラーなく完了し、`AuthError` / `requireUser` / `requireAdmin` / `requireSessionOwnership` / `getCurrentUser` の 5 シンボルが export される
  - _Requirements: 2.4, 2.5, 3.3, 3.4, 3.5, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 11.6, 12.5_
  - _Boundary: Guards (apps/web/lib/guards.ts)_
  - _Depends: 5.1_

- [ ] 4.2 `apps/web/lib/safe-action.ts` に authedAction / adminAction ラッパーを実装
  - 冒頭で `'server-only'` を import
  - JSDoc で「全 mutation は authedAction または adminAction を必ず経由すること。素の `async function` で Server Action を書かない (`security.md` 規約)」を明記
  - `authedAction<S extends z.ZodTypeAny, R>(schema: S, handler: (input: z.infer<S>, ctx: CurrentUser) => Promise<R>): (input: unknown) => Promise<R>` を実装。手順: `schema.parse(input)` → `requireUser()` → `handler(parsed, ctx)`
  - `adminAction<S, R>(...)` を同パターンで実装、`requireAdmin()` を使用
  - `AuthError` を `guards.ts` から re-export
  - 観測完了条件: ファイル単体で typecheck 通過、`authedAction` と `adminAction` のジェネリック型推論が動作する (例: `authedAction(z.object({ x: z.string() }), async ({ x }, { userId }) => ...)` が `(input: unknown) => Promise<...>` を返す)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.4, 10.5, 11.5_
  - _Boundary: SafeAction (apps/web/lib/safe-action.ts)_
  - _Depends: 4.1_

## Core: Better Auth サーバー設定とレート制限

- [ ] 5. Better Auth サーバー設定とレート制限ロジックを実装
- [ ] 5.1 `apps/web/lib/auth/rate-limit.ts` に DB ベースのレート制限を実装
  - 冒頭で `'server-only'` を import
  - `getClientIp(request: Request): string | null` を export。`x-forwarded-for` ヘッダの最初の値を返す、無ければ null
  - `checkAndIncrement(input: { email: string; ip: string | null }): Promise<void>` を実装:
    - per-email key (`'email:' + email.toLowerCase()`) に対し、window 5 分・上限 3 で判定
    - per-IP key (`'ip:' + ip`) に対し、window 60 分・上限 20 で判定 (ip が null なら skip)
    - DB 操作は `INSERT INTO rate_limit (...) VALUES (...) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN expires_at < now() THEN 1 ELSE count + 1 END, window_start = CASE WHEN expires_at < now() THEN now() ELSE window_start END, expires_at = CASE WHEN expires_at < now() THEN now() + interval '...' ELSE expires_at END RETURNING count, expires_at` のような atomic upsert で実装
    - 制限超過時は `console.warn({ event: 'rate_limit_triggered', limit_type, identifier_hash: <sha256 first 8>, timestamp })` を出力し `throw new AuthError('RATE_LIMITED', 'Too many requests')`
    - per-email を先にチェックし、失敗したら per-IP は呼ばない
  - 観測完了条件: 単体で typecheck 通過し、ローカル DB に対して 3 回連続呼び出し OK、4 回目で throw、5 分後に reset することがマニュアル smoke で確認できる (タスク 11 の Validation で実施)
  - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7_
  - _Boundary: RateLimitMod (apps/web/lib/auth/rate-limit.ts)_
  - _Depends: 2.5_

- [ ] 5.2 `apps/web/lib/auth/server.ts` に Better Auth インスタンスを構築
  - 冒頭で `'server-only'` を import
  - 起動時 Fail Fast: `BETTER_AUTH_SECRET`、`RESEND_API_KEY`、`(BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL)` のいずれか未設定で `throw new Error(...)`
  - `betterAuth({...})` で初期化:
    - `baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL`
    - `secret: process.env.BETTER_AUTH_SECRET`
    - `trustedOrigins: [baseURL]`
    - `database: drizzleAdapter(db, { provider: 'pg' })` (`@bulr/db` の `db`、`user`、`session`、`account`、`verification` を参照)
    - `session: { expiresIn: 60*60*24*7, updateAge: 60*60*24, cookieCache: { enabled: true, maxAge: 60*5 } }`
    - `advanced.cookies.session_token.attributes`: `httpOnly: true`、`secure: NODE_ENV === 'production'`、`sameSite: 'lax'`
    - `plugins: [magicLink({ expiresIn: 60*15, sendMagicLink })]` を設定:
      - `sendMagicLink({ email, url }, request)` の中で `getClientIp(request)` → `checkAndIncrement({ email, ip })` → `buildMagicLinkEmail({ url })` → `resendClient.send({...})`
    - `databaseHooks.user.create.after(user)`: `db.insert(userProfile).values({ userId: user.id, profileInput: {} }).onConflictDoNothing()` を実行
  - `auth` を named export
  - `AuthInstance` 型を `typeof auth` で export
  - 観測完了条件: `import { auth } from '@/lib/auth/server'` が typecheck 通過し、未設定環境変数で起動時に `Error: BETTER_AUTH_SECRET is required` 等が throw される
  - _Requirements: 1.2, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 7.1, 7.4, 8.1, 10.1, 10.3, 12.2, 12.3, 12.4_
  - _Boundary: AuthServer (apps/web/lib/auth/server.ts)_
  - _Depends: 2.4, 3.1, 3.2, 5.1_

- [ ] 5.3 (P) `apps/web/lib/auth/client.ts` に Better Auth React クライアントを実装
  - 冒頭で `'use client'` を記述
  - `createAuthClient({ baseURL: process.env.NEXT_PUBLIC_APP_URL, plugins: [magicLinkClient()] })` で `authClient` を構築
  - `authClient` を named export
  - 観測完了条件: ファイル単体で typecheck 通過、`authClient.signIn.magicLink` が型補完される
  - _Requirements: 1.1, 3.6_
  - _Boundary: AuthClient (apps/web/lib/auth/client.ts)_
  - _Depends: 1.1_

## Core: Better Auth API ルート

- [ ] 6. Better Auth handler を Next.js Route Handler として公開
- [ ] 6.1 `apps/web/app/api/auth/[...all]/route.ts` を作成
  - `import { toNextJsHandler } from 'better-auth/next-js'`
  - `import { auth } from '@/lib/auth/server'`
  - `export const { POST, GET } = toNextJsHandler(auth)`
  - 観測完了条件: `pnpm dev` 起動後、`curl http://localhost:3000/api/auth/get-session` が 200 + `{ session: null }` 様の JSON を返す
  - _Requirements: 1.7, 2.3_
  - _Boundary: AuthRoute (apps/web/app/api/auth/[...all]/route.ts)_
  - _Depends: 5.2_

## Core: proxy.ts (Edge Runtime)

- [ ] 7. proxy.ts に Basic 認証 + UX redirect を実装
- [ ] 7.1 `apps/web/proxy.ts` を作成
  - ファイル頭の JSDoc で「このファイルは UX レイヤーであり認可境界ではない。各 Server Component / Server Action / API Route で `requireUser()` / `requireAdmin()` を呼ぶこと (CVE-2025-29927 教訓)」を明記
  - `import { NextResponse, type NextRequest } from 'next/server'`
  - `BASIC_AUTH_REGEX = /^Basic [A-Za-z0-9+/=]+$/` を定義
  - `middleware(request)` 関数:
    - `pathname.startsWith('/admin')` の場合:
      - `ADMIN_BASIC_AUTH_USER` または `ADMIN_BASIC_AUTH_PASSWORD` 未設定で 503 (`'admin auth not configured'`) を返す
      - `Authorization` ヘッダ未設定または `BASIC_AUTH_REGEX` 不一致で 401 + `WWW-Authenticate: Basic realm="bulr admin"` を返す
      - `atob(b64)` で decode し `:` で USER と PASSWORD に分離、env と一致しなければ 401 + WWW-Authenticate を返す
      - 一致なら `NextResponse.next()`
    - `pathname.startsWith('/assessments/')` かつ `'/assessments/start'` でも `'/assessments/done'` でもない場合:
      - cookie `'better-auth.session_token'` の有無を確認、無ければ `/assessments/start` へ redirect
    - その他は `NextResponse.next()`
  - `config.matcher = ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)']` を export
  - 観測完了条件: `pnpm dev` 起動後、`curl -i http://localhost:3000/admin` が 401 + `WWW-Authenticate` ヘッダを返す。`curl -i -u user:pass http://localhost:3000/admin` (env 一致時) で proxy を通過して下流の 404 / 200 が返る。`curl -i http://localhost:3000/assessments/abc-123` が 307 + `Location: /assessments/start` を返す
  - _Requirements: 3.1, 3.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 10.2, 11.7, 12.6_
  - _Boundary: Proxy (apps/web/proxy.ts)_

## Core: サインイン UI

- [ ] 8. 受験者サインイン UI を実装
- [ ] 8.1 (P) `apps/web/app/(assessment)/assessments/start/page.tsx` を作成 (Server Component)
  - 静的レンダリング
  - h1 で「bulr ベータへようこそ」、続けて日本語短文 (「メールアドレスを入力するとサインインリンクをお送りします」) と英語短文 (「Enter your email to receive a sign-in link」) を表示
  - 「入力したメールはサインイン目的のみで利用します」 の利用目的明示文を表示
  - `<SignInForm />` (Client Component) を埋め込む
  - 観測完了条件: `pnpm dev` で `/assessments/start` にアクセスしてフォームが描画される
  - _Requirements: 1.1, 1.9_
  - _Boundary: SignInPage (apps/web/app/(assessment)/assessments/start/page.tsx)_
  - _Depends: 8.2_

- [ ] 8.2 (P) `apps/web/app/(assessment)/assessments/start/sign-in-form.tsx` を作成 (Client Component)
  - `'use client'` を冒頭に記述
  - `import { authClient } from '@/lib/auth/client'`
  - `import { z } from 'zod'`
  - `emailSchema = z.string().trim().toLowerCase().email().max(254)` をローカル定義
  - state: `email`、`status: 'idle' | 'sending' | 'sent' | 'error'`、`errorMessage`
  - 送信ハンドラ:
    - `emailSchema.safeParse(email)` で形式検証、失敗時に「メールアドレスの形式が正しくありません」 を表示し中止
    - `await authClient.signIn.magicLink({ email: parsed.data, callbackURL: '/assessments/done' })`
    - 成功時に「メールを送信しました。受信ボックスをご確認ください」 を同一ページに表示 (情報漏洩防止: ユーザー存在の有無は出さない)
    - エラー時に「しばらく時間をおいて再度お試しください」 (rate limit / その他を区別しない generic message)
  - 観測完了条件: ローカル開発で実際にメール入力 → 送信完了メッセージが表示される
  - _Requirements: 1.1, 1.3, 1.4, 10.1_
  - _Boundary: SignInForm (apps/web/app/(assessment)/assessments/start/sign-in-form.tsx)_
  - _Depends: 5.3_

- [ ] 9. 管理者サインイン UI を実装
- [ ] 9.1 (P) `apps/web/app/admin/login/page.tsx` を作成 (Server Component)
  - 静的レンダリング (Basic 認証は proxy.ts で既に通過している前提)
  - h1 で「bulr 管理者ログイン」、説明文「管理者メールアドレスにサインインリンクを送信します」
  - `<AdminSignInForm />` を埋め込む
  - 観測完了条件: Basic 認証通過後 `/admin/login` にアクセスしてフォームが描画される
  - _Requirements: 3.6_
  - _Boundary: AdminLoginPage (apps/web/app/admin/login/page.tsx)_
  - _Depends: 9.2_

- [ ] 9.2 (P) `apps/web/app/admin/login/admin-sign-in-form.tsx` を作成 (Client Component)
  - 構造は SignInForm と同じだが文言を管理者向けに調整
  - `callbackURL: '/admin/sessions'` (admin-review-panel が後で実装するパス、本スペック完了時点では 404 になる可能性あり、smoke test では `/admin` の任意のパスで Magic Link 検証フローのみ確認)
  - 観測完了条件: ローカル開発で Basic 認証通過後にメール入力 → 送信完了メッセージが表示される
  - _Requirements: 3.6_
  - _Boundary: AdminSignInForm (apps/web/app/admin/login/admin-sign-in-form.tsx)_
  - _Depends: 5.3_

## Integration: 多層認証の動作確認用一時ページ

- [ ] 10. 後続 spec が無くても認証境界を smoke test できる一時的な保護ページを設置
- [ ] 10.1 `apps/web/app/admin/_health/page.tsx` を作成 (Server Component、本スペックの smoke test 専用)
  - 冒頭で `await requireAdmin()` を呼ぶ
  - 通過後に `<p>admin auth ok: {email}</p>` のような最小描画
  - JSDoc で「本ページは authentication spec の smoke test 用。admin-review-panel spec 実装時に削除する」 を明記
  - 観測完了条件: Basic 認証 + Magic Link で `ADMIN_ALLOWED_EMAILS` に含まれるメールでサインインしたユーザーがアクセスすると 200 + email 表示、含まれないユーザーは 403 (AuthError 経由)、未認証は `/admin/login` に redirect (proxy.ts は通過している)
  - _Requirements: 11.1, 11.6_
  - _Boundary: Smoke test page (apps/web/app/admin/_health/page.tsx)_
  - _Depends: 4.1, 7.1_

## Validation: 動作確認 (Manual Smoke Tests)

- [ ] 11. ローカル開発で end-to-end の動作確認を実施
- [ ] 11.1 ローカル DB に migration を反映
  - Owner 自身の `apps/web/.env.local` に `multi-env-infrastructure` で取得した Neon dev branch `DATABASE_URL` 等の必要変数 (`BETTER_AUTH_SECRET`、`RESEND_API_KEY`、`NEXT_PUBLIC_APP_URL=http://localhost:3000`、`ADMIN_ALLOWED_EMAILS`、`ADMIN_BASIC_AUTH_USER`、`ADMIN_BASIC_AUTH_PASSWORD`) が記入済みであることを確認
  - `pnpm --filter @bulr/db push` を実行し、Neon dev branch に 6 テーブル (`user` / `session` / `account` / `verification` / `user_profile` / `rate_limit`) が作成されることを確認
  - 観測完了条件: Neon ダッシュボードまたは `psql` で `\dt` を実行して 6 テーブルが存在する
  - _Requirements: 7.6, 12.7, 12.8_
  - _Boundary: (validation)_
  - _Depends: 2.5_

- [ ] 11.2 受験者 Magic Link フローを smoke test
  - `pnpm dev` で起動、`http://localhost:3000/assessments/start` を開く
  - 自分のメールアドレスを入力して送信、Resend 経由で実際にメール受信することを確認
  - メール件名が `[bulr] サインインリンク / Sign-in link` で、本文に日本語と英語が両方含まれること
  - リンクをクリックして session cookie が発行されること、`/assessments/done` (または callbackURL) に redirect されること
  - DB の `user` と `user_profile` に行が作成されていること、`session` に有効な行が入っていること
  - 観測完了条件: メール受信 + リンククリック後に Network タブで `Set-Cookie: better-auth.session_token=...; HttpOnly; Secure; SameSite=Lax` を確認
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.7, 1.8, 2.1, 2.2, 7.4, 8.1, 8.2, 8.3, 8.4_
  - _Boundary: (validation)_
  - _Depends: 6.1, 8.1, 11.1_

- [ ] 11.3 レート制限を smoke test
  - 同一メールに対して 5 分以内に 4 回 Magic Link を送信
  - 4 回目で generic error message が返ることを確認
  - DB の `rate_limit` テーブルに `key='email:<lower email>'` の行があり、`count >= 3` であること
  - Vercel ログ (またはローカル console) に `rate_limit_triggered` の warn が出ること
  - 観測完了条件: 4 回目のレスポンスがエラー、3 回目までは成功
  - _Requirements: 9.1, 9.3, 9.7_
  - _Boundary: (validation)_
  - _Depends: 11.2_

- [ ] 11.4 管理者 Basic 認証 + ADMIN_ALLOWED_EMAILS フローを smoke test
  - `http://localhost:3000/admin/_health` を開き、Basic 認証ダイアログが出ることを確認
  - 不正な USER/PASSWORD で 401 が再表示されることを確認
  - 正しい USER/PASSWORD で通過後、未認証なら `/admin/login` に redirect されることを確認
  - `/admin/login` で Magic Link を送信、受信メールでサインイン、再度 `/admin/_health` にアクセスして 200 + email が表示されることを確認
  - `ADMIN_ALLOWED_EMAILS` に含まれないメールでサインインした場合、`/admin/_health` で 403 (AuthError) が出ること、Vercel ログに `admin_access_denied` warn が出ること
  - 観測完了条件: 上記 5 ケースすべてが期待通り動作
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 6.1, 6.2, 11.1_
  - _Boundary: (validation)_
  - _Depends: 7.1, 9.1, 10.1, 11.1_

- [ ] 11.5 proxy.ts の matcher exclusion を smoke test
  - `curl -i http://localhost:3000/_next/static/<任意のファイル>` が proxy.ts を通らず 200/404 を返すこと
  - `curl -i http://localhost:3000/api/auth/get-session` が Basic 認証なしで 200 を返すこと (API ルートが proxy 401 で阻害されないこと)
  - `curl -i http://localhost:3000/assessments/start` が proxy.ts を通過しても redirect しないこと (matcher 内だが redirect 条件に該当しない)
  - 観測完了条件: 3 ケースすべてが期待通り動作
  - _Requirements: 6.6_
  - _Boundary: (validation)_
  - _Depends: 7.1_

- [ ] 11.6 Vercel Preview デプロイで end-to-end を再確認
  - feature ブランチを push して PR を作成、Vercel Preview URL が PR コメントに投稿されることを確認
  - Preview URL で 11.2 / 11.4 と同等のフローが動作することを確認 (Neon dev branch 共有、Resend テストドメイン、ADMIN_* 環境変数)
  - 観測完了条件: Preview URL で受験者と管理者の認証両方が成立
  - _Requirements: 12.8_
  - _Boundary: (validation)_
  - _Depends: 11.2, 11.4_

## Cleanup & Documentation

- [ ] 12. 完了処理
- [ ] 12.1 (P) `apps/web/.env.local.example` および リポジトリルート `.env.example` を確認
  - 本スペックで追加導入される `RESEND_REPLY_TO_EMAIL` (オプショナル) を `.env.example` に追加するか判断
  - 追加する場合は `multi-env-infrastructure` の規約 (両ファイル同期) に従い、コメントで「Optional. If unset, magic link emails will not include a Reply-To header.」 を記述
  - 追加しない場合はその判断を design.md または research.md に追記
  - 観測完了条件: 判断が明示され、両 example ファイルの状態が一致
  - _Requirements: 8.6, 12.1_
  - _Boundary: (env vars convention; cross-cuts EnvExampleRoot/Web from upstream spec)_

- [ ] 12.2 (P) PR レビューチェックリストを `security.md` の既存規約に倣って認識
  - 後続 spec の PR で必須となる確認事項を本スペック完了時の PR description またはコミットメッセージで言及:
    - `requireUser()` / `requireAdmin()` を Server Component / Server Action / API Route で呼んでいるか
    - `authedAction` / `adminAction` を mutation で使っているか
    - `requireSessionOwnership` で所有権チェックをしているか
    - Zod で全入力を検証しているか
    - DB クエリに userId / sessionId スコープが含まれているか
  - 本タスクは新規ファイルを作らない。PR description / commit message に上記を含める運用上の確認のみ
  - 観測完了条件: PR description に上記 5 項目が含まれる
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - _Boundary: (PR review hygiene)_

- [ ] 12.3 (P) Better Auth admin_health 一時ページの削除予定を README または admin-review-panel spec brief にメモ
  - `apps/web/app/admin/_health/page.tsx` は本スペック smoke test 専用。後続の `admin-review-panel` spec が `/admin/sessions` を実装した時点で削除する
  - 削除予定を `apps/web/app/admin/_health/page.tsx` の JSDoc にも明記済みであることを再確認 (タスク 10.1 で記述済み)
  - admin-review-panel の brief.md (まだ存在しないなら本タスクでは作らず、後続 spec 実行時に対応) または本スペックの design.md「Migration Strategy」で言及
  - 観測完了条件: 削除タイミングと責務が文書化されている
  - _Requirements: 11.1_
  - _Boundary: (documentation)_
