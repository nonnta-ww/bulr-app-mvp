# Requirements Document

## Introduction

bulr Stage 1 MVP では、(1) 受験者を識別して回答を `user_id` でスコープ保存できる状態、(2) 創業者だけが管理画面にアクセスできる状態の 2 種類の認証境界が必要である。受験者識別ができないと Stage 1 の検証ゴール（ベトナム人 50 名 + 日本人 20 名のデータ収集）が成立せず、管理画面アクセス制御がないと回答データと受験者メールが漏洩する。

本スペックは、`monorepo-foundation` で用意された `apps/web` と `packages/db` のスケルトンと、`multi-env-infrastructure` で確立された環境変数規約（`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `RESEND_API_KEY` / `ADMIN_ALLOWED_EMAILS` / `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` / `NEXT_PUBLIC_APP_URL`）の上に、Better Auth 1.6.x + Magic Link + Resend を統合した受験者認証と、Basic 認証 + 許可メール二重チェックによる管理者認証を構築する。さらに `security.md` が要求する多層認証パターン（CVE-2025-29927 教訓）に基づき、`requireUser()` / `requireAdmin()` / `requireSessionOwnership()` の認証ヘルパーと、`authedAction()` / `adminAction()` の Server Action ラッパーを `apps/web/lib/` に配置する。

参照プロジェクト `dishxdish-app-mvp` は匿名セッション + 認証昇格 + dual-owner CHECK の複雑な構成だが、bulr Stage 1 は Magic Link 必須・匿名セッションなし・受験者と管理者の 2 ロールのみで簡素化する。`packages/auth` には切り出さず、Better Auth 設定は `apps/web/lib/auth/` に直書きし、Stage 2 で `apps/admin` 分離時に packages 化する。

## Boundary Context

- **In scope**:
  - Better Auth 1.6.x のサーバー設定とクライアント設定（`apps/web/lib/auth/server.ts` / `apps/web/lib/auth/client.ts`）
  - Magic Link プラグイン設定（有効期限 15 分、使い切り、Resend 配信）
  - Better Auth API ルート（`apps/web/app/api/auth/[...all]/route.ts`）
  - 受験者向けサインイン UI（`/assessments/start` でメール入力 → Magic Link 送信完了表示）
  - 管理者向けログイン UI（`/admin/login`、Basic 認証ダイアログを促す導線）
  - `proxy.ts`（Next.js 16 で middleware.ts から rename）: 管理画面 Basic 認証ヘッダーチェック + 受験者向け UX リダイレクト（未認証で `/assessments/[id]` にアクセスしたら `/assessments/start` に遷移）
  - 認証ヘルパー（`apps/web/lib/guards.ts`: `getCurrentUser` / `requireUser` / `requireAdmin` / `requireSessionOwnership` / `AuthError` クラス）
  - Server Action ラッパー（`apps/web/lib/safe-action.ts`: `authedAction` / `adminAction`）
  - DB スキーマ: Better Auth 管理テーブル（`user` / `session` / `account` / `verification`）の Drizzle 定義 + `user_profile` テーブルの新規定義（`user_id` FK 1:1、`profile_input` JSONB、`created_at` / `updated_at`）
  - Drizzle migration の生成（`pnpm --filter @bulr/db generate`）
  - Magic Link メールテンプレート（日本語 + 英語のシンプルテキスト + HTML 一体型、bulr のサインイン CTA + 15 分失効の注意 + 心当たりがない場合の無視可能注記）
  - Resend 統合ヘルパー（`apps/web/lib/email/resend.ts`）
  - レート制限（Magic Link 送信: メールあたり 3 回 / 5 分、IP ベース 20 回 / 時。Stage 1 は DB ベースカウンタまたはメモリで実装）
  - Zod 入力検証（メール形式、Basic 認証 Authorization ヘッダーの形式）
  - HttpOnly + Secure + SameSite=Lax クッキー設定（Better Auth デフォルトを継承、有効期限は適切に設定）
  - 多層認証の徹底（`proxy.ts` の Basic 認証チェックは UX 兼最初のゲートだが、`requireAdmin()` を Server Component / Server Action / API Route で必ず再チェック）
  - 後続 spec が認証ヘルパーと Server Action ラッパーを使うための contract（型シグネチャと例外規約）

- **Out of scope**:
  - 受験セッション作成ロジック、回答記録、対話 API → `assessment-engine` spec
  - 管理画面の機能 UI（セッション一覧、回答詳細、ヒートマップ等）→ `admin-review-panel` spec
  - 状況パターンマスタの定義とシード → `assessment-pattern-seed` spec
  - Google OAuth、SSO、Apple Sign-in（Stage 2）
  - パスワード認証（Stage 1 では使わない、Magic Link のみ）
  - 匿名セッション、匿名 → 認証ユーザーの昇格フロー（bulr Stage 1 は Magic Link 必須、匿名概念なし）
  - dual-owner CHECK（dishxdish にあるが bulr 不要）
  - データエクスポート、アカウント削除フロー（Stage 2）
  - 監査ログ（Stage 2）
  - Better Auth ロールベースアクセス制御（管理者は ADMIN_ALLOWED_EMAILS で判定、ロールカラムは追加しない）
  - `packages/auth` への切り出し（Stage 2 で `apps/admin` 分離時に実施）
  - `packages/ui` への共通 UI 切り出し（Stage 1 は `apps/web/components/` で十分）
  - i18n ライブラリ導入（メールは日本語+英語の 1 テンプレート併記で対応、`next-intl` 等は Stage 2）
  - メールカスタムドメイン認証（DNS SPF / DKIM）→ Stage 2、Stage 1 は Resend テストドメイン `onboarding@resend.dev` を利用
  - シークレットローテーション自動化（手順書のみ、Stage 1 は手動）
  - 受験プロファイル（経験年数等）入力フォームの UI 実装 → 本スペックは `user_profile` テーブルの構造定義と空での 1:1 行作成のみを担い、フォーム本体は `assessment-engine` spec が `assessment_session` 開始時に実装する

- **Adjacent expectations**:
  - `multi-env-infrastructure` で `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `RESEND_API_KEY` / `ADMIN_ALLOWED_EMAILS` / `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` / `NEXT_PUBLIC_APP_URL` が `.env.example` に定義済みであり、本スペックはそれらを参照するのみで再定義しない。
  - 後続 spec（`assessment-engine` / `admin-review-panel`）は本スペックが提供する `requireUser()` / `requireAdmin()` / `requireSessionOwnership()` および `authedAction()` / `adminAction()` を使い、素の `async function` で Server Action を書かない。
  - `assessment-engine` spec は本スペックが定義する `user_profile` テーブルから受験プロファイルを読み取り、新規受験セッション作成時に必要なら `profile_input` を更新する。
  - `monorepo-foundation` で導入された `packages/db/src/client.ts` の `db` インスタンスを Better Auth の Drizzle adapter に渡す。
  - 本スペックは Better Auth 管理テーブル（`user` / `session` / `account` / `verification`）に独自カラムを追加しない。bulr 固有データはすべて `user_profile` 別テーブルで `user_id` FK 1:1 参照とする。

## Requirements

### Requirement 1: 受験者の Magic Link サインインフロー

**Objective:** 受験者として、自分のメールアドレスを入力するだけで Magic Link を受信し、リンククリックで bulr にサインインしたい。それにより、パスワード不要で安全に受験を開始でき、認証情報の管理負担なく問診に集中できる。

#### Acceptance Criteria

1. The Authentication shall provide a sign-in page at `/assessments/start` that displays a single email input field with a 「サインイン用のリンクを送信」 submit button.
2. When 受験者が `/assessments/start` で有効なメールアドレスを入力して送信する場合、the Authentication shall validate the email format using Zod、generate a Magic Link、and send it to the entered email address via Resend.
3. When Magic Link 送信が成功した場合、the Authentication shall display a confirmation message on the same page (例: 「メールを送信しました。受信ボックスをご確認ください」) without exposing whether the email is already registered (情報漏洩防止: 既存ユーザーと新規ユーザーで挙動を変えない).
4. If 受験者が入力したメール形式が無効な場合、then the Authentication shall display 「メールアドレスの形式が正しくありません」 のエラーメッセージを同一ページに表示し、Magic Link 送信処理を実行しない。
5. The Magic Link shall have an expiration of 15 minutes from the time of issuance, and the Authentication shall reject any link that is older than 15 minutes with a redirect to an error page (`/assessments/start?error=expired` 等).
6. The Magic Link shall be single-use; once a link has been successfully used to sign in, the Authentication shall mark it as consumed and reject any subsequent click on the same link.
7. When 受験者が有効な Magic Link をクリックした場合、the Authentication shall verify the token、create or retrieve the corresponding `user` record、issue a session cookie、and redirect to the assessment flow (`/assessments/[sessionId]` if a session exists, else to a profile-input page that the `assessment-engine` spec implements).
8. When the Authentication first creates a `user` record for a new email、the Authentication shall create a corresponding `user_profile` row with `profile_input = {}` (空 JSONB) and `created_at = now()` so that downstream specs can read or update the profile.
9. The sign-in UI shall display a brief Japanese explanation that bulr is a beta and that the entered email is used solely for sign-in (個人情報利用目的の最小限明示).

### Requirement 2: 受験者のセッション管理とサインアウト

**Objective:** 受験者として、サインイン後は適切な期間ログイン状態が保持され、必要な時に明示的にサインアウトできる状態にしたい。それにより、複数回の受験フローを安全に行え、共有端末で受験した場合もリスクを最小化できる。

#### Acceptance Criteria

1. The Authentication shall issue session cookies with `HttpOnly = true`、`Secure = true` (本番)、`SameSite = Lax`、`Path = /`、and a session expiration of 7 days with sliding refresh on activity (Better Auth デフォルトを採用).
2. The Authentication shall NOT expose any session token or user ID to client-side JavaScript via `document.cookie` reading; all session lookup occurs through Better Auth `auth.api.getSession({ headers })` on the server side.
3. When 受験者が `/api/auth/sign-out` を呼び出す場合、the Authentication shall invalidate the current session in the `session` table and clear the session cookie via `Max-Age=0`.
4. When 受験者のセッションが期限切れになった場合、the Authentication shall return `null` from `getCurrentUser()` so that `requireUser()` の呼び出しが `AuthError('UNAUTHORIZED')` をスローし、Server Component 側で `/assessments/start` への redirect が成立する。
5. While 受験者が認証済みである場合、the Authentication shall make `getCurrentUser()` return `{ userId, email }` consistently across Server Components、Server Actions、and API Routes within the same request.

### Requirement 3: 管理者の Basic 認証 + 許可メール二重チェック

**Objective:** 創業者として、管理画面 (`/admin/*`) に Basic 認証 + 許可メールリストの二重チェックでアクセスし、自分以外の人間が管理画面に到達できない状態にしたい。それにより、回答データと受験者メールアドレスの漏洩リスクを最小化できる。

#### Acceptance Criteria

1. When 任意のリクエストが `/admin/*` パス（`/admin/login` を除く）に到達する場合、the Authentication shall verify the `Authorization` header using HTTP Basic auth scheme against `ADMIN_BASIC_AUTH_USER` and `ADMIN_BASIC_AUTH_PASSWORD` environment variables in `proxy.ts`.
2. If `Authorization` ヘッダーが存在しない or 値が `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` と一致しない場合、then the Authentication shall return HTTP 401 with `WWW-Authenticate: Basic realm="bulr admin"` ヘッダーを付与し、ブラウザに Basic 認証ダイアログを表示させる。
3. When Basic 認証が成功した状態で `/admin/*` の Server Component が表示される場合、the Authentication shall require `requireAdmin()` to be invoked at the top of every admin Server Component before any data access.
4. The `requireAdmin()` shall first invoke `requireUser()` to ensure a Better Auth session exists; if no session exists, then the Authentication shall throw `AuthError('UNAUTHORIZED')` so that the page redirects the admin user to `/admin/login` to complete a Magic Link sign-in.
5. After `requireUser()` returns a user, the `requireAdmin()` shall split `process.env.ADMIN_ALLOWED_EMAILS` by comma、trim each entry、and verify that the current user's email (case-insensitive comparison) is included; if not, then the Authentication shall throw `AuthError('FORBIDDEN')` so that a 403 page is rendered.
6. The Authentication shall expose `/admin/login` as a publicly reachable page (Basic 認証通過後) that displays a Magic Link sign-in form similar to `/assessments/start` so that admin users can obtain a Better Auth session.
7. The Authentication shall NOT rely on `proxy.ts` Basic auth alone; even if `proxy.ts` were bypassed (CVE-2025-29927 教訓), `requireAdmin()` invoked in each Server Component / Server Action / API Route shall still block unauthorized access via the `ADMIN_ALLOWED_EMAILS` check on the Better Auth session.
8. The Authentication shall log (Stage 1 では Vercel ログ + console.warn) the email of any user who passes Basic auth but fails the `ADMIN_ALLOWED_EMAILS` check, so that the Owner can detect attempted unauthorized access.

### Requirement 4: 認証ヘルパー（guards.ts）

**Objective:** 後続 spec の実装者として、Server Component / Server Action / API Route から呼び出せる統一された認証ヘルパー API を使いたい。それにより、認証ロジックを各所で重複実装せず、漏れを防げる。

#### Acceptance Criteria

1. The Authentication shall provide `apps/web/lib/guards.ts` exporting `getCurrentUser()`、`requireUser()`、`requireAdmin()`、`requireSessionOwnership()`、and an `AuthError` class.
2. The `getCurrentUser()` shall return `Promise<{ userId: string; email: string } | null>`; null を返す場合は未認証を意味する。
3. The `requireUser()` shall return `Promise<{ userId: string; email: string }>`; 未認証の場合は `throw new AuthError('UNAUTHORIZED')` を実行する。
4. The `requireAdmin()` shall return `Promise<{ userId: string; email: string }>`; 認証済みだが `ADMIN_ALLOWED_EMAILS` に含まれない場合は `throw new AuthError('FORBIDDEN')` を実行する。
5. The `requireSessionOwnership(resource, userId)` shall verify that `resource.userId === userId`; 不一致または `resource === null` の場合は `throw new AuthError('NOT_FOUND_OR_FORBIDDEN')` を実行する（情報漏洩防止のため、存在しないリソースと他人のリソースを区別しない）。
6. The `AuthError` class shall extend `Error` and expose a `code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND_OR_FORBIDDEN' | 'RATE_LIMITED'` property so that 呼び出し側が `instanceof AuthError` で識別できる。
7. The `apps/web/lib/guards.ts` shall include `'server-only'` import marker so that 誤ってクライアントコンポーネントから import された場合は build time にエラーとなる。
8. The Authentication shall ensure that `requireUser()` / `requireAdmin()` / `requireSessionOwnership()` の呼び出しコストが O(1) DB クエリ以下に収まる（同一リクエスト内の連続呼び出しは Better Auth のリクエストスコープキャッシュに依存）。

### Requirement 5: Server Action ラッパー（safe-action.ts）

**Objective:** 後続 spec の実装者として、Server Action から認証ガードと Zod 入力検証を一括で適用できるラッパー関数を使いたい。それにより、各 Server Action で認証チェックを書き忘れるリスクを排除し、`security.md` の「全 mutation はラッパー経由」ルールを遵守できる。

#### Acceptance Criteria

1. The Authentication shall provide `apps/web/lib/safe-action.ts` exporting `authedAction(schema, handler)` and `adminAction(schema, handler)` factory functions.
2. The `authedAction(schema, handler)` shall return a function that (a) parses the input with `schema.parse(input)`、(b) invokes `requireUser()` to obtain `{ userId, email }`、(c) calls `handler(parsedInput, { userId, email })`、(d) propagates `AuthError` and `ZodError` to the caller for client-side handling.
3. The `adminAction(schema, handler)` shall behave like `authedAction` but use `requireAdmin()` instead of `requireUser()`.
4. The Authentication shall ensure that any thrown `AuthError` or `ZodError` from a wrapper-protected Server Action serializes to a structure that Next.js can deliver to the client (例: `{ error: 'UNAUTHORIZED' }` 形式) without leaking stack traces.
5. The `apps/web/lib/safe-action.ts` shall include `'server-only'` import marker.
6. The Authentication shall document in `apps/web/lib/safe-action.ts` (JSDoc またはコメント) that 「素の `async function` で Server Action を書かず、必ずいずれかのラッパー経由で実装する」 という規約を後続 spec の実装者向けに明示する。

### Requirement 6: proxy.ts（middleware から rename された UX レイヤー）

**Objective:** 受験者と管理者として、未認証で保護されたパスに直接アクセスしたとき適切な誘導画面に到達したい。それにより、UX が破綻せず、認証フローへスムーズに導線が生成される。

#### Acceptance Criteria

1. The Authentication shall provide `apps/web/proxy.ts` (Next.js 16 で middleware.ts から rename された名称) that runs on every request matching `/admin/*` and `/assessments/[sessionId]` paths.
2. When a request reaches `/admin/*` (excluding `/admin/login`)、the proxy.ts shall verify the HTTP Basic auth `Authorization` header against `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD`; failure shall return HTTP 401 with `WWW-Authenticate: Basic realm="bulr admin"`.
3. When a request reaches `/assessments/[sessionId]` without a Better Auth session cookie、the proxy.ts shall redirect to `/assessments/start` (UX redirect; no authorization decision).
4. The proxy.ts shall NOT perform any database query or Better Auth `getSession` call; it operates only on cookie presence and `Authorization` header to keep latency minimal and avoid Edge Runtime DB dependencies.
5. The Authentication shall document in `apps/web/proxy.ts` JSDoc that the file is a UX layer and security responsibility lives in `requireUser()` / `requireAdmin()` invoked by each Server Component / Server Action / API Route (CVE-2025-29927 教訓).
6. The proxy.ts `config.matcher` shall exclude static assets (`/_next/`、`/favicon.ico`、`/api/auth/*`) so that auth callbacks and asset serving are not interrupted.

### Requirement 7: user_profile テーブル（Better Auth 管理外の bulr 固有データ）

**Objective:** プロダクトとして、受験プロファイル（経験年数、扱った言語等）を Better Auth 管理テーブルを汚染せず保存し、Stage 2 で Better Auth 管理テーブル構造が変わっても影響を受けない設計にしたい。それにより、Better Auth のメジャーバージョンアップ時に bulr 固有データの移行を独立に扱える。

#### Acceptance Criteria

1. The Authentication shall NOT add any custom column to the Better Auth managed tables (`user`、`session`、`account`、`verification`).
2. The Authentication shall define a new table `user_profile` in `packages/db/src/schema/` with columns: `user_id` (text、PK、FK to `user.id` ON DELETE CASCADE)、`profile_input` (jsonb、NOT NULL、default `{}`)、`created_at` (timestamp、NOT NULL、default `now()`)、`updated_at` (timestamp、NOT NULL、default `now()`).
3. The `user_profile` table shall have a 1:1 relationship with `user`; for every `user.id` there shall be exactly one `user_profile.user_id` row.
4. When the Authentication creates a new `user` row via Magic Link sign-in (first-time user)、the Authentication shall also create the corresponding `user_profile` row in the same transaction or via a Better Auth `databaseHooks.user.create.after` hook.
5. The `profile_input` JSONB shall be unconstrained at the DB level (`{}` まで許容) but downstream specs (`assessment-engine`) shall validate its content with Zod when reading or writing.
6. The Authentication shall provide a Drizzle migration file generated by `pnpm --filter @bulr/db generate` that creates the `user_profile` table along with the Better Auth managed tables.
7. The Authentication shall ensure that `user_profile` 行の物理削除は `user` 行の削除に追従する（`ON DELETE CASCADE` または手動 transaction）。

### Requirement 8: Magic Link メールテンプレート（日本語 + 英語並記）

**Objective:** 受験者として、日本人でもベトナム人でも理解できるメールを受信したい。それにより、受験開始まで言語の壁で躓くことがない。

#### Acceptance Criteria

1. The Authentication shall send a Magic Link email containing both Japanese and English text in a single template (no `next-intl`、no per-locale switching).
2. The email subject shall be `[bulr] サインインリンク / Sign-in link` (Japanese first, English second).
3. The email body shall include in this order: (a) bulr のサインイン CTA リンク (URL)、(b) 「このリンクは 15 分で失効します」 / 「This link expires in 15 minutes」、(c) 「心当たりがない場合は無視してください」 / 「If you did not request this, please ignore this email」、(d) bulr のフッター (運営者名と連絡先メールアドレス).
4. The email shall be sent in both `text/plain` and `text/html` parts; HTML 版は最低限の `<a>` リンクと改行のみで、装飾は不要 (Stage 1 シンプル方針)。
5. The Authentication shall use `noreply@<resend テストドメイン>` as the `from` address (Stage 1 は Resend テストドメイン `onboarding@resend.dev` を使用、Stage 2 でカスタムドメイン認証).
6. The Authentication shall set the email `Reply-To` header to a configurable owner email (環境変数 `RESEND_REPLY_TO_EMAIL`、未設定なら省略).
7. The Authentication shall log (Stage 1 では Vercel ログ + console.info) every Magic Link send attempt with `{ to_email_hash, timestamp, success }` (メール本文は記録しない、PII 最小化)。

### Requirement 9: Magic Link レート制限

**Objective:** プロダクトとして、Magic Link 送信エンドポイントへの過剰リクエストによるメール大量送信攻撃と Resend 無料プラン枠枯渇を防ぎたい。それにより、Stage 1 の月数百通枠内で安定運用できる。

#### Acceptance Criteria

1. The Authentication shall enforce per-email rate limit of 3 Magic Link send attempts per 5-minute window; the 4th attempt within the window shall return an error response without sending an email.
2. The Authentication shall enforce per-IP rate limit of 20 Magic Link send attempts per 1-hour window; the 21st attempt within the window shall return an error response without sending an email.
3. When a request is rate-limited、the Authentication shall return a generic message (例: 「しばらく時間をおいて再度お試しください」) without revealing the specific limit type (per-email vs per-IP) to avoid enumeration.
4. The Authentication shall implement rate limit storage in Stage 1 using either (a) a `rate_limit` table in `packages/db` with columns `key`、`count`、`window_start`、`expires_at`、or (b) an in-process Map (限界として Vercel Function インスタンスごと別カウンタ); design phase で確定する。
5. The Authentication shall expire rate limit records after their window ends and shall NOT accumulate stale records (window_start + window_duration < now() のレコードはカウント対象外、または定期削除).
6. The rate limit logic shall NOT block the Better Auth session creation / verification endpoints; only the Magic Link send endpoint is rate-limited.
7. The Authentication shall log (Stage 1 では Vercel ログ + console.warn) every rate limit trigger with `{ limit_type: 'per_email' | 'per_ip', identifier_hash, timestamp }` so that the Owner can detect attack patterns.

### Requirement 10: Zod 入力検証

**Objective:** プロダクトとして、認証フローのすべての外部入力を Zod で検証したい。それにより、`security.md` の「全外部入力を Zod で検証」原則を遵守し、不正な入力による DB エラーや LLM コスト発生を防げる。

#### Acceptance Criteria

1. The Authentication shall validate the email input on `/assessments/start` and `/admin/login` using `z.string().trim().toLowerCase().email().max(254)` before invoking the Magic Link send.
2. The Authentication shall validate the `Authorization` header value in `proxy.ts` Basic auth check using a regex / Zod schema that ensures `Basic <base64>` format before base64 decoding.
3. The Authentication shall validate the Magic Link token format (Better Auth は内部で実施するが、追加の早期 reject として URL クエリパラメータの長さ・文字種を Zod で検証).
4. When any input fails Zod validation、the Authentication shall return an error response without invoking downstream side effects (Magic Link 送信、DB 書き込み等).
5. The Authentication shall ensure that all Server Action wrapper-protected handlers receive only Zod-parsed input (素の `unknown` を handler に渡さない).

### Requirement 11: 多層認証（Defense in Depth）の徹底

**Objective:** プロダクトとして、proxy.ts だけに認可を依存せず、各層で独立に認証チェックを行いたい。それにより、CVE-2025-29927 のような middleware バイパス脆弱性が将来発見されても、bulr の認可境界が破られない。

#### Acceptance Criteria

1. The Authentication shall require that every Server Component under `/admin/*` invokes `requireAdmin()` at the top of the component before any data access or rendering.
2. The Authentication shall require that every Server Component under `/assessments/[sessionId]` invokes `requireUser()` at the top of the component before any data access or rendering.
3. The Authentication shall require that every API Route under `/api/admin/*` invokes `requireAdmin()` before returning any response, regardless of HTTP method.
4. The Authentication shall require that every API Route under `/api/sessions/*` and `/api/chat` (後続 spec が実装) invokes `requireUser()` and `requireSessionOwnership()` before returning any response that depends on session-scoped data.
5. The Authentication shall require that every Server Action that mutates DB state is implemented through `authedAction()` or `adminAction()` wrapper; design phase で `apps/web/lib/safe-action.ts` JSDoc に明示し、PR レビューチェックリスト (`security.md` 既存) で担保する.
6. The Authentication shall NOT cache `requireUser()` / `requireAdmin()` results across requests; Better Auth のリクエストスコープのみ許容し、長期キャッシュ（Redis 等）は導入しない。
7. The proxy.ts shall be documented as a UX-only layer; the JSDoc comment shall explicitly state that 「proxy.ts は認可境界ではない、各 Server Component / Server Action / API Route で requireUser / requireAdmin を呼ぶこと」.

### Requirement 12: 開発・デプロイ運用

**Objective:** 開発者として、ローカル開発で Magic Link を実際に受信して動作確認でき、本番デプロイで同じ仕組みが動く状態にしたい。それにより、Magic Link フローの不具合をローカルで早期検知できる。

#### Acceptance Criteria

1. The Authentication shall use `RESEND_API_KEY` from environment variables (set in `multi-env-infrastructure` の `.env.example`) for Magic Link delivery in both local development and production.
2. When `RESEND_API_KEY` 未設定でアプリが起動する場合、the Authentication shall throw a startup-time error in the Better Auth server config initialization (Fail Fast).
3. When `BETTER_AUTH_SECRET` 未設定でアプリが起動する場合、the Authentication shall throw a startup-time error.
4. When `BETTER_AUTH_URL` 未設定でアプリが起動する場合、the Authentication shall fall back to `NEXT_PUBLIC_APP_URL` (multi-env-infrastructure 既存) and document the precedence in `apps/web/lib/auth/server.ts`.
5. When `ADMIN_ALLOWED_EMAILS` が空文字列または未設定の場合、the Authentication shall reject every `requireAdmin()` call (空配列扱い) so that デプロイ事故で管理画面が全公開される事態を防ぐ。
6. When `ADMIN_BASIC_AUTH_USER` または `ADMIN_BASIC_AUTH_PASSWORD` が未設定の場合、the Authentication shall return HTTP 503 from proxy.ts for `/admin/*` requests so that 設定漏れが即座に検知される。
7. The Drizzle migration that creates Better Auth tables and `user_profile` shall be generated by `pnpm --filter @bulr/db generate`; design phase で具体的なマイグレーション戦略（Better Auth CLI 利用 vs Drizzle スキーマ手動定義）を確定する。
8. The Authentication shall function in Vercel Preview environment using the `dev` branch DATABASE_URL (multi-env-infrastructure の規約) so that PR ごとに認証フロー全体を Preview URL で確認できる。
