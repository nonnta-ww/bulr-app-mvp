# Implementation Plan — authentication

> 本スペックは bulr Stage 1 の認証基盤（Better Auth 1.6.x + Magic Link + Resend + Basic 認証 + DB ベースレート制限）を確立する。すべての作業は `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/` 配下で行う。
>
> 完了の最終条件:
> (a) `pnpm dev` で `/sign-in` フォームが表示され、メール送信 → Resend で受信 → クリック → `/interviews` リダイレクト + DB に `user` / `session` / `user_profile` が作成される、
> (b) `/admin/_health` で Basic 認証 + Magic Link サインイン済み + ADMIN_ALLOWED_EMAILS 一致の 3 条件すべて通過時のみ「OK: admin authenticated」が表示される、
> (c) 同じメールに 4 回連続 Magic Link 送信を試みると 4 回目が拒否される、
> (d) `pnpm --filter @bulr/db push` で Neon dev branch に 6 テーブル（user / session / account / verification / user_profile / rate_limit）が作成される、
> (e) `pnpm typecheck` / `pnpm lint` がエラーなく通る。

## Foundation: 依存関係追加と DB スキーマ

> 1.x はパッケージ依存追加と DB スキーマ定義。1.1 と 1.2 は別パッケージへの追加で並列実行可能。1.3-1.5 はスキーマファイル作成、相互参照あり（1.4 が 1.3 の user テーブルに FK）。

- [ ] 1. パッケージ依存追加と DB スキーマ定義

- [x] 1.1 (P) `apps/web/package.json` に better-auth と resend を追加
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/package.json` の `dependencies` に以下を追加:
    - `"better-auth": "^1.6.0"`
    - `"resend": "^4.0.0"`
  - 既存の依存（next / react / @bulr/\*）と整合する形で merge
  - ルートで `pnpm install` を実行し、lockfile が更新されることを確認
  - 観測可能な完了状態: `pnpm install` 完了、`apps/web/node_modules/better-auth/package.json` と `apps/web/node_modules/resend/package.json` が存在
  - _Requirements: 1.1, 2.1_
  - _Boundary: AuthServer, ResendClient_

- [x] 1.2 (P) `packages/db/src/schema/auth.ts` を作成（Better Auth 管理テーブル）
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/packages/db/src/schema/auth.ts` を新規作成
  - Better Auth 1.6.x 公式スキーマに従って Drizzle で `user` / `session` / `account` / `verification` の 4 テーブルを定義
  - 各テーブルの主要カラム:
    - `user`: `id text PK`, `email text UNIQUE NOT NULL`, `email_verified boolean DEFAULT false`, `name text`, `image text`, `created_at timestamp`, `updated_at timestamp`
    - `session`: `id text PK`, `user_id text REFERENCES user(id) ON DELETE CASCADE`, `token text UNIQUE`, `expires_at timestamp`, `ip_address text`, `user_agent text`, `created_at`, `updated_at`
    - `account`: `id text PK`, `user_id text REFERENCES user(id) ON DELETE CASCADE`, `provider_id text`, `account_id text`, `password text NULL`（Magic Link 未使用）, `access_token text NULL`, `refresh_token text NULL`, `id_token text NULL`, `access_token_expires_at timestamp NULL`, `refresh_token_expires_at timestamp NULL`, `scope text NULL`, `created_at`, `updated_at`
    - `verification`: `id text PK`, `identifier text NOT NULL`, `value text NOT NULL`, `expires_at timestamp NOT NULL`, `created_at`, `updated_at`
  - 独自カラムは一切追加しない（`structure.md` L181 準拠）
  - `$inferSelect` / `$inferInsert` で型を export
  - 観測可能な完了状態: `pnpm --filter @bulr/db typecheck` がエラーなく通り、Better Auth が要求する 4 テーブル定義が揃っている
  - _Requirements: 7.1_
  - _Boundary: DbAuthSchema_

- [x] 1.3 (P) `packages/db/src/schema/user-profile.ts` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/packages/db/src/schema/user-profile.ts` を新規作成
  - `user_profile` テーブル定義:
    - `user_id text PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE`
    - `display_name text NOT NULL`
    - `role_in_org text NULL`
    - `years_of_experience integer NULL`
    - `created_at timestamp NOT NULL DEFAULT now()`
    - `updated_at timestamp NOT NULL DEFAULT now()`
  - `auth.ts` の `user` テーブルを import して FK 参照
  - `$inferSelect` / `$inferInsert` で `UserProfile` / `NewUserProfile` 型を export
  - ファイルヘッダコメントに「v1 では受験者プロファイルだったが、v2 では面接官プロファイル（Better Auth user と 1:1）を保持する」を明記
  - 観測可能な完了状態: `pnpm --filter @bulr/db typecheck` 通過、user-profile.ts が user テーブルへ FK 参照を持つ
  - _Requirements: 7.2_
  - _Boundary: DbUserProfileSchema_
  - _Depends: 1.2_

- [x] 1.4 (P) `packages/db/src/schema/rate-limit.ts` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/packages/db/src/schema/rate-limit.ts` を新規作成
  - `rate_limit` テーブル定義:
    - `key text PRIMARY KEY`
    - `count integer NOT NULL DEFAULT 0`
    - `window_start timestamp NOT NULL DEFAULT now()`
  - ファイルヘッダコメントに key prefix の用途を列挙:
    - `'email:<email>'` — Magic Link メールレート制限（authentication spec）
    - `'ip:<ip>'` — Magic Link IP レート制限（authentication spec）
    - `'session:<id>'` — 将来予約
    - `'chat:<userId>'` — assessment-engine spec で再利用予定
  - `$inferSelect` / `$inferInsert` で型を export
  - 観測可能な完了状態: `pnpm --filter @bulr/db typecheck` 通過
  - _Requirements: 7.3_
  - _Boundary: DbRateLimitSchema_

- [x] 1.5 `packages/db/src/schema/index.ts` のバレルに 3 ファイルを追加
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/packages/db/src/schema/index.ts` を更新
  - 既存のコメントの後に以下を追加:
    - `export * from './auth';`
    - `export * from './user-profile';`
    - `export * from './rate-limit';`
  - 観測可能な完了状態: 他パッケージから `import { user, userProfile, rateLimit } from '@bulr/db/schema'` で型解決される
  - _Requirements: 7.4_
  - _Boundary: DbSchemaIndex_
  - _Depends: 1.2, 1.3, 1.4_

- [x] 1.6 drizzle-kit で migration を生成し dev branch に push
  - `.env.local` に Neon dev branch の DATABASE_URL が設定済みであることを確認
  - `pnpm --filter @bulr/db generate` を実行し `packages/db/drizzle/*_authentication.sql`（drizzle-kit が決定する番号付きファイル名）を生成
  - 生成された SQL を git にコミット（レビュー）
  - `pnpm --filter @bulr/db push` で dev branch にスキーマを反映
  - 検証: `psql $DATABASE_URL -c '\dt'` で `user` / `session` / `account` / `verification` / `user_profile` / `rate_limit` の 6 テーブルが存在することを確認
  - 観測可能な完了状態: Neon dev branch に 6 テーブルが作成されており、`packages/db/drizzle/*_authentication.sql` が git にコミットされている
  - _Requirements: 7.7, 7.8_
  - _Boundary: DrizzleMigration_
  - _Depends: 1.5_

## Core: Email / Rate Limit / Auth Schemas

> 2.x は apps/web/lib 配下のユーティリティ層。互いに独立しているため並列実行可能。

- [ ] 2. メール送信ユーティリティ・レート制限・Zod スキーマ集約

- [x] 2.1 (P) `apps/web/lib/email/resend.ts` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/lib/email/resend.ts` を新規作成
  - `RESEND_API_KEY` が未設定なら module load 時に明示的に throw
  - `resend = new Resend(process.env.RESEND_API_KEY)` を export
  - `FROM_ADDRESS = 'bulr <onboarding@resend.dev>'` を export（コメントで「Stage 1: Resend テストドメイン。Stage 2 でカスタムドメイン認証 (bulr.net) に切り替え」を明記）
  - 観測可能な完了状態: `apps/web/lib/email/resend.ts` が存在し、`pnpm typecheck` 通過
  - _Requirements: 2.1, 2.2, 2.6_
  - _Boundary: ResendClient_
  - _Depends: 1.1_

- [x] 2.2 (P) `apps/web/lib/email/templates/magic-link.ts` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/lib/email/templates/magic-link.ts` を新規作成
  - 純関数 `renderMagicLinkEmail({ url }: { url: string }): { subject: string; html: string; text: string }` を export
  - subject: `'[bulr] サインインリンク / Sign-in link'`
  - 日本語ブロック → `---` 区切り → 英語ブロックの並記
  - HTML: 最低限のインラインスタイル、ボタン要素 `<a href="${url}" style="...">サインイン</a>` と `Sign in` の両方
  - text: 平文 URL を 2 回（日本語ブロック内 + 英語ブロック内）
  - 両方の言語で「自分でリクエストしていない場合は無視してください / If you didn't request this, please ignore.」を含める
  - 受信者の個人情報（メアド本文埋め込み等）は一切含めない
  - 観測可能な完了状態: `renderMagicLinkEmail({ url: 'https://example.com/x' })` を Node REPL で実行すると subject / html / text が文字列として返る
  - _Requirements: 2.3, 2.4, 2.5, 2.8_
  - _Boundary: MagicLinkTemplate_

- [x] 2.3 (P) `apps/web/lib/rate-limit.ts` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/lib/rate-limit.ts` を新規作成
  - ファイルヘッダコメントで key prefix の用途を列挙（`email:` / `ip:` / `session:` / `chat:`）し「Vercel Functions メモリ非共有のため in-memory キャッシュ禁止」を明記
  - `RateLimitError` クラスを export（`extends Error`）
  - `checkAndIncrement(key: string, opts: { limit: number; windowMs: number }): Promise<void>` を export
    - 内部処理: `INSERT INTO rate_limit (key, count, window_start) VALUES (..., 1, now()) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN window_start + (windowMs * INTERVAL '1 millisecond') > now() THEN count + 1 ELSE 1 END, window_start = CASE WHEN window_start + (windowMs * INTERVAL '1 millisecond') > now() THEN window_start ELSE now() END RETURNING count`
    - 取得した count が `opts.limit` 超過なら `throw new RateLimitError(...)`
  - Drizzle の `db.execute(sql\`...\`)` で raw SQL を実行
  - 観測可能な完了状態: ユニット動作確認として、同じ key で `checkAndIncrement('test:x', { limit: 2, windowMs: 60000 })` を 3 回連続で呼ぶと 3 回目に RateLimitError が throw される（`pnpm tsx` で確認、後で削除）
  - _Requirements: 8.1, 8.3, 8.5, 8.6, 8.7_
  - _Boundary: RateLimitTs_
  - _Depends: 1.6_

- [x] 2.4 (P) `apps/web/lib/auth/schemas.ts` を作成（Zod スキーマ集約）
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/lib/auth/schemas.ts` を新規作成
  - export する schema:
    - `emailSchema = z.string().email().trim().max(254)`
    - `interviewerProfileSchema = z.object({ displayName: z.string().trim().min(1).max(100), roleInOrg: z.string().trim().max(100).optional(), yearsOfExperience: z.number().int().min(0).max(60).optional() })`
  - `InterviewerProfileInput = z.infer<typeof interviewerProfileSchema>` も export
  - 観測可能な完了状態: 他ファイルから `import { emailSchema, interviewerProfileSchema } from '@/lib/auth/schemas'` で参照可能、`pnpm typecheck` 通過
  - _Requirements: 9.1, 9.3-9.5, 9.7_
  - _Boundary: AuthSchemas_

## Auth Server: Better Auth サーバー設定とクライアント

> 3.x は Better Auth の core。3.1 が中核（Magic Link plugin + databaseHooks + sendMagicLink）、3.2 がクライアント、3.3 が Next.js API ルートで 3.1 に依存。

- [ ] 3. Better Auth サーバー / クライアント / API ルート

- [x] 3.1 `apps/web/lib/auth/server.ts` を作成（Better Auth サーバー設定）
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/lib/auth/server.ts` を新規作成
  - 環境変数チェック: `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` が未設定なら起動時に明示的に throw
  - `betterAuth({ ... })` を初期化し `auth` singleton を export
  - `database: drizzleAdapter(db, { provider: 'pg', schema: authSchema })` で Drizzle 統合
  - `session`: `expiresIn: 60 * 60 * 24 * 7`（7 日）、`updateAge: 60 * 60 * 24`（sliding 1 日）、`cookieCache.enabled: true`
  - `advanced.cookies.session_token.attributes`: `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`
  - `plugins: [magicLink({ expiresIn: 60 * 15, sendMagicLink: async ({ email, url }, request) => { ... } })]`
  - `sendMagicLink` 内処理:
    1. `request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'` で IP 取得
    2. `await checkAndIncrement('email:' + email, { limit: 3, windowMs: 5 * 60 * 1000 })`
    3. `await checkAndIncrement('ip:' + ip, { limit: 20, windowMs: 60 * 60 * 1000 })`
    4. `renderMagicLinkEmail({ url })` で本文生成
    5. `await resend.emails.send({ from: FROM_ADDRESS, to: email, subject, html, text })`
  - `databaseHooks.user.create.after: async (user) => { await db.insert(userProfile).values({ userId: user.id, displayName: user.email.split('@')[0] }).onConflictDoNothing(); }`
  - 観測可能な完了状態: `pnpm typecheck` 通過、`pnpm dev` 起動時にエラーなく `apps/web/lib/auth/server.ts` が import される
  - _Requirements: 1.1, 1.3-1.10, 2.7, 3.1-3.5, 7.5, 7.6, 7.9, 8.1, 8.3, 8.8_
  - _Boundary: AuthServer_
  - _Depends: 1.2, 1.3, 1.5, 2.1, 2.2, 2.3_

- [x] 3.2 (P) `apps/web/lib/auth/client.ts` を作成（Better Auth クライアント）
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/lib/auth/client.ts` を新規作成
  - `createAuthClient({ baseURL: process.env.NEXT_PUBLIC_APP_URL, plugins: [magicLinkClient()] })` を初期化
  - `signIn`, `signOut`, `useSession` を destructure して export
  - 観測可能な完了状態: `pnpm typecheck` 通過、Client Component から `import { signIn, signOut, useSession } from '@/lib/auth/client'` で参照可能
  - _Requirements: 1.2, 1.8, 3.6, 11.2, 11.7_
  - _Boundary: AuthClient_
  - _Depends: 1.1_

- [x] 3.3 `apps/web/app/api/auth/[...all]/route.ts` を作成（Better Auth API ルート）
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/app/api/auth/[...all]/route.ts` を新規作成
  - `toNextJsHandler(auth)` で GET / POST ハンドラを export:
    ```typescript
    import { auth } from '@/lib/auth/server';
    import { toNextJsHandler } from 'better-auth/next-js';
    export const { GET, POST } = toNextJsHandler(auth);
    ```
  - 観測可能な完了状態: `pnpm dev` 起動中に `curl http://localhost:3000/api/auth/get-session` が Better Auth の標準レスポンス（null セッション）を返す
  - _Requirements: 1.7, 1.9, 1.10, 3.6_
  - _Boundary: BetterAuthApiRoute_
  - _Depends: 3.1_

## Guards / SafeAction: 認証ヘルパー層

> 4.x は guards と safe-action を順次。4.1 が core、4.2 が 4.1 に依存。

- [ ] 4. 認証ヘルパーと Server Action ラッパー

- [x] 4.1 `apps/web/lib/guards.ts` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/lib/guards.ts` を新規作成
  - `AuthError` クラス: `class AuthError extends Error { constructor(public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND', message?: string) { super(message ?? code); } }`
  - `getCurrentUser()`: `auth.api.getSession({ headers: await headers() })` を呼び、`{ id, email } | null` を返す（throw しない）
  - `requireUser()`: getCurrentUser → null なら `throw new AuthError('UNAUTHORIZED')`
  - `requireAdmin()`: requireUser → `ADMIN_ALLOWED_EMAILS?.split(',').map(s => s.trim()).filter(Boolean) ?? []` を取得 → 空配列または email が含まれなければ `throw new AuthError('FORBIDDEN')`（fail secure）
  - `requireSessionOwnership(session, userId)`: session が null/undefined なら NOT_FOUND、`session.interviewerId !== userId` なら FORBIDDEN
  - 観測可能な完了状態: `pnpm typecheck` 通過、Server Component から `await requireUser()` / `await requireAdmin()` で session 検証可能
  - _Requirements: 3.8, 4.3, 4.7, 5.1-5.5, 6.8, 10.7, 10.8_
  - _Boundary: Guards_
  - _Depends: 3.1_

- [x] 4.2 `apps/web/lib/safe-action.ts` を作成（Server Action ラッパー）
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/lib/safe-action.ts` を新規作成
  - ファイルヘッダコメント:
    > すべての mutation は authedAction / adminAction でラップすること。素の async function で Server Action を書かない。これは security.md の多層認証パターンに従う標準パターン。
  - 戻り値型: `type Result<R> = { ok: true; data: R } | { ok: false; error: { code: string; message: string } }`
  - `authedAction<I, R>(schema: ZodSchema<I>, handler: (input: I, ctx: { userId: string; email: string }) => Promise<R>)` を export
    - 内部: `requireUser()` → `schema.parse(rawInput)` → `handler(parsed, ctx)` を try/catch、AuthError / ZodError を捕捉して Result 形式で返す
  - `adminAction<I, R>(schema, handler)` を export（内部で `requireAdmin()` を呼ぶ以外は authedAction と同じ）
  - サードパーティライブラリ（next-safe-action 等）を一切使わない
  - 観測可能な完了状態: `pnpm typecheck` 通過。テスト用 Server Action `async function testAction = authedAction(z.object({ x: z.string() }), async (input, ctx) => input.x.toUpperCase())` を一時的に作って呼び出すと型エラーなしで動く
  - _Requirements: 5.6-5.10, 9.6_
  - _Boundary: SafeAction_
  - _Depends: 4.1_

## Proxy: UX リダイレクトと Basic 認証

> 5.x は proxy.ts 単独。

- [ ] 5. proxy.ts (UX リダイレクト + Basic 認証 + CVE-2025-29927 教訓)

- [x] 5.1 `apps/web/proxy.ts` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/proxy.ts` を新規作成
  - ファイル冒頭の JSDoc コメントで以下を必ず明記:
    - 「このファイルは UX リダイレクトと管理画面 Basic 認証チェックのみを担当する」
    - 「CVE-2025-29927 (2025 年に発覚した Next.js middleware bypass 攻撃) の教訓により、認可は本ファイルに依存してはならない」
    - 「各 Server Component / Server Action / API Route で requireUser() / requireAdmin() を独立に呼び出すこと」
    - 「やること: /interviews/_ の Cookie 存在チェック → /sign-in リダイレクト、/admin/_ の Basic 認証チェック」
    - 「やらないこと: Better Auth セッション validation、ADMIN_ALLOWED_EMAILS 検査、Server Action / API Route の認可」
  - `proxy(request: NextRequest)` を export（Next.js 16 の rename に従う、仮に最終仕様で `middleware` のままなら export 名を `middleware` に戻して `middleware.ts` ファイル名にする）
  - `/admin/*` 処理:
    - `Authorization` header を取得、`Basic ` プレフィックスをチェック
    - base64 デコード → `user:password` を split
    - `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` と比較（Stage 1 は `===`、Stage 2 で timing-safe）
    - 失敗時に `new NextResponse('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="bulr admin"' } })` を返す
  - `/interviews/*` 処理:
    - Better Auth の session cookie 名（`better-auth.session_token` 等、Better Auth デフォルト）の存在を `request.cookies.get(...)` で確認
    - 無ければ `NextResponse.redirect(new URL('/sign-in', request.url))`
  - `export const config = { matcher: ['/interviews/:path*', '/admin/:path*'] }`
  - 観測可能な完了状態:
    - `pnpm dev` 起動中にブラウザで `/admin/_health` 訪問 → Basic 認証ダイアログ表示
    - 未認証で `/interviews/foo` 訪問 → `/sign-in` リダイレクト
    - `/api/auth/*` や `/sign-in` は matcher 対象外で素通り
  - _Requirements: 3.7, 4.1, 4.2, 4.6, 6.1-6.9, 9.2_
  - _Boundary: Proxy_

## UI: サインインページ・管理画面ログイン・smoke test

> 6.x は UI ページ群。各 page.tsx は独立して作れるが、すべて 4.1 (guards) と 3.2 (auth client) に依存。6.1-6.3 は互いに独立で並列実行可能。

- [ ] 6. サインイン / 管理画面ログイン / smoke test UI

- [x] 6.1 (P) `apps/web/app/(interviewer)/sign-in/page.tsx` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/app/(interviewer)/sign-in/page.tsx` を新規作成
  - Server Component で `getCurrentUser()` を呼び、null でなければ `redirect('/interviews')`
  - Client Component（別ファイル `apps/web/app/(interviewer)/sign-in/sign-in-form.tsx` を作成、`'use client'` 指定）でフォーム描画:
    - メール input + 「Magic Link を送信」ボタン
    - `useState` で `status: 'idle' | 'submitting' | 'success' | 'error'` 管理
    - 送信時に `emailSchema.safeParse(email)` でクライアント検証、不正なら「正しいメールアドレスを入力してください」
    - `await signIn.magicLink({ email, callbackURL: '/interviews' })` を呼び、レスポンス（または throw）を判定
    - エラーメッセージに `rate limit` を含む場合、「短時間に複数回のリクエストがあったため、しばらく待ってから再試行してください」を表示
    - 成功時は「メールを送信しました。受信ボックス（迷惑メールフォルダも）をご確認ください。」を表示
  - Tailwind CSS で最低限のスタイリング
  - 観測可能な完了状態: `pnpm dev` 起動中にブラウザで `/sign-in` 訪問 → フォーム表示、不正メールでクライアント検証エラー表示、有効メール送信で「メールを送信しました」表示
  - _Requirements: 1.8, 8.2, 8.4, 11.1-11.4, 11.7_
  - _Boundary: SignInPage_
  - _Depends: 3.2, 2.4, 4.1_

- [x] 6.2 (P) `apps/web/app/admin/login/page.tsx` を作成
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/app/admin/login/page.tsx` を新規作成
  - Server Component で `getCurrentUser()` を呼び、null でなく email が ADMIN_ALLOWED_EMAILS に含まれていれば `/admin/_health` へ redirect
  - そうでなければ「Basic 認証通過 OK。次に管理者メールアドレスで Magic Link サインインしてください」のメッセージと、`/sign-in?redirect=/admin/_health` へのリンクを表示
  - Tailwind CSS で簡易スタイリング
  - 観測可能な完了状態: Basic 認証通過後 `/admin/login` 訪問 → 案内文と `/sign-in` へのリンクが表示される
  - _Requirements: 4.5, 11.5, 11.6, 11.7_
  - _Boundary: AdminLoginPage_
  - _Depends: 4.1_

- [x] 6.3 (P) `apps/web/app/admin/_health/page.tsx` を作成（smoke test）
  - `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps/web/app/admin/_health/page.tsx` を新規作成
  - ファイル冒頭コメントで「本ページは authentication spec の smoke test 用に一時設置。admin-review-panel spec で `/admin/sessions` を実装した時点で削除する」を必ず明記
  - Server Component として実装:
    - try ブロックで `const user = await requireAdmin();` → 成功時に `<main><h1>OK: admin authenticated</h1><pre>{user.email}</pre></main>` 表示
    - catch (e) で:
      - `e instanceof AuthError && e.code === 'UNAUTHORIZED'` → `redirect('/sign-in')`
      - `e instanceof AuthError && e.code === 'FORBIDDEN'` → `<main><h1>FORBIDDEN</h1><p>あなたのメールアドレスは管理者として登録されていません。</p></main>` を return
      - その他は throw
  - 観測可能な完了状態: Basic 認証 + サインイン + 許可メールの 3 条件で「OK: admin authenticated」表示、未サインインなら /sign-in、非許可メールなら FORBIDDEN 表示
  - _Requirements: 4.8, 10.1-10.8_
  - _Boundary: AdminHealthPage_
  - _Depends: 4.1_

## Integration: 動作確認とスモークテスト

> 7.x は手動の E2E 動作確認。順次実施し、本スペック完了の最終ゲートとする。

- [ ] 7. 統合動作確認

- [ ] 7.1 ローカルで Magic Link サインインの End-to-End 検証
  - `.env.local` に Resend テストドメイン用の RESEND_API_KEY、Neon dev branch の DATABASE_URL、BETTER_AUTH_SECRET（`openssl rand -base64 32`）、BETTER_AUTH_URL=`http://localhost:3000`、NEXT_PUBLIC_APP_URL=`http://localhost:3000` を設定
  - `pnpm dev` 起動
  - ブラウザで `/sign-in` 訪問 → 自分のメールアドレスを入力して送信
  - メール受信を確認（送信元: `bulr <onboarding@resend.dev>`、件名: `[bulr] サインインリンク / Sign-in link`、日本語+英語並記）
  - メール内のサインインボタンをクリック → ブラウザが `/api/auth/magic-link/verify?token=...` を経由して `/interviews` にリダイレクト
  - DB を SQL で確認: `SELECT * FROM "user"; SELECT * FROM session; SELECT * FROM user_profile;` で 3 レコードが作成され、user_profile.display_name にメールローカル部が入っている
  - 観測可能な完了状態: 上記すべてが成功し、`/interviews` にアクセスできる状態（`/interviews` ページの本体は未実装で 404 でも OK、proxy.ts による redirect が起きないことを確認）
  - _Requirements: 1.3, 1.7-1.9, 2.3-2.7, 7.5, 7.9_
  - _Depends: 3.3, 5.1, 6.1, 1.6_

- [ ] 7.2 Magic Link 期限切れ・使い切りの検証
  - `/sign-in` でリンクを取得した後、16 分待ってからクリック → Better Auth のエラーページが表示される
  - 別のメール送信でリンクを取得 → クリックして成功 → 同じリンクを再度クリック → エラー表示
  - 観測可能な完了状態: 期限切れと再使用の両方でエラーが表示される
  - _Requirements: 1.10_
  - _Depends: 7.1_

- [ ] 7.3 Magic Link レート制限の検証
  - 同じメールアドレスに対し 5 分以内に 4 回連続で `/sign-in` から送信を試みる → 4 回目に「短時間に複数回...」が表示され、Resend には呼ばれない（Resend ダッシュボードで送信数を確認、または DB の rate_limit テーブルで count = 4 を確認）
  - `psql $DATABASE_URL -c "SELECT * FROM rate_limit WHERE key LIKE 'email:%';"` で該当キーの count と window_start を確認
  - 観測可能な完了状態: 4 回目の送信が拒否され、UI に該当エラーが表示、Resend には 3 通のみが配信される
  - _Requirements: 8.1, 8.2, 8.8_
  - _Depends: 7.1_

- [ ] 7.4 proxy.ts による UX リダイレクトと Basic 認証の検証
  - サインアウト状態（Cookie クリア）で `/interviews/foo` を訪問 → `/sign-in` にリダイレクトされる
  - `/admin/_health` を訪問 → Basic 認証ダイアログが表示される、不正な credentials で 401（WWW-Authenticate ヘッダーあり）、正しい credentials で pass through
  - 観測可能な完了状態: 2 つのリダイレクト / 401 挙動がブラウザで再現できる
  - _Requirements: 3.7, 4.1, 4.2, 6.1-6.7_
  - _Depends: 5.1, 6.3_

- [ ] 7.5 `/admin/_health` の 3 ケース検証
  - 環境変数 `ADMIN_ALLOWED_EMAILS=tanno@example.com,owner@example.com`（自分のメールを含める）を設定
  - (a) Basic 認証通過 + 未サインイン状態 → `/admin/_health` 訪問で `/sign-in` リダイレクト
  - (b) Basic 認証通過 + ADMIN_ALLOWED_EMAILS に含まれないメールでサインイン → `/admin/_health` 訪問で「FORBIDDEN」表示
  - (c) Basic 認証通過 + ADMIN_ALLOWED_EMAILS に含まれるメールでサインイン → `/admin/_health` 訪問で「OK: admin authenticated」+ 該当 email 表示
  - 観測可能な完了状態: 3 ケースすべてが期待通りに動作する
  - _Requirements: 4.3, 4.4, 4.7, 4.8, 10.1-10.8_
  - _Depends: 6.3, 5.1, 7.1_

- [ ] 7.6 多層防御（CVE-2025-29927 シミュレーション）の検証
  - `apps/web/proxy.ts` を一時的に修正して `config.matcher = []`（または `matcher` を空配列）にし、proxy.ts を実質無効化
  - `pnpm dev` を再起動
  - 未サインイン状態で `/admin/_health` を訪問 → proxy.ts の Basic 認証は飛ばされるが、Server Component の `requireAdmin()` が `AuthError('UNAUTHORIZED')` を throw → `/sign-in` リダイレクトが起きる
  - 検証後、`apps/web/proxy.ts` を元の matcher に戻す
  - 観測可能な完了状態: proxy.ts を無効化しても Server Component の独立 requireAdmin で防御が効くことを確認
  - _Requirements: 3.8, 4.4, 6.8_
  - _Depends: 7.5_

- [ ] 7.7 `pnpm typecheck` / `pnpm lint` / `pnpm build` の最終確認
  - リポジトリルートで `pnpm typecheck` 実行 → 全パッケージでエラーなく完了
  - リポジトリルートで `pnpm lint` 実行 → 全パッケージでエラーなく完了
  - リポジトリルートで `pnpm build` 実行 → apps/web の Next.js build がエラーなく完了
  - 観測可能な完了状態: 3 コマンドすべてが exit code 0 で終了
  - _Requirements: (cross-cutting quality gate)_
  - _Depends: 1.x-6.x すべて_

## Implementation Notes

- `packages/db/.env` symlink (→ `../../.env.local`) is required so `drizzle-kit push/generate` can read DATABASE_URL without explicit env var injection. drizzle-kit auto-loads `.env` but not `.env.local`. Documented in README.md and docs/setup/local.md.
