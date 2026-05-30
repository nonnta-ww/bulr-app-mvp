# 要件定義 — candidate-auth-onboarding

## はじめに

本 spec は Wave 2 の最初の spec であり、候補者向けアプリ `apps/candidate`（bulr.net）に Magic Link サインインと初回オンボーディング動線を追加する。合わせて `packages/auth` を singleton から factory（`createAuth({ sendMagicLink })`）に refactor し、3 アプリが独自のメールテンプレートを所有できるようにする。候補者固有データの基点となる `candidate_profile` テーブルを新設し、招待リンクのトークン受け取り口（seam）を設置する。

## スコープ境界

- **スコープ内**: `packages/auth` factory refactor、アプリ別 Magic Link テンプレート（candidate / business / admin）、`candidate_profile` スキーマ新設＋migration、候補者サインイン動線の候補者向け文言化、`apps/candidate/app/onboarding` 新設、`apps/candidate/app/invitations/[token]` 新設（トークン受け取り口）、`requireCandidate` ガード新設
- **スコープ外**: `invitation` / `opening` / `entry` エンティティ実体（Wave 3）、履歴書アップロード（`resume-registration`）、スキルアンケート（`skill-survey`）、Stage 1 `candidate` テーブルの削除（Wave 3 `session-from-entry`）、SSO・クロスドメイン cookie 共有
- **隣接 spec との期待関係**: `resume-registration` / `skill-survey` / `entry-flow` は本 spec が確立する `requireCandidate` ガードと `candidate_profile.id` を前提とする。`company-and-opening`（Wave 3）が `invitation` トークンの発行・検証を実装するまで、本 spec のトークン受け取り口は pending state の保持のみを責務とする

---

## 要件一覧

### 要件 1: packages/auth の factory 化

**目的:** 開発者として、`packages/auth` が `createAuth({ sendMagicLink, ...overrides })` factory を公開することで、各アプリが独自のメールテンプレートを注入できるようにしたい。それにより、候補者・企業・運営それぞれが異なるメール文面を受信できる。

#### 受け入れ基準

1. The auth package shall export a `createAuth({ sendMagicLink, ...overrides })` factory function that initializes and returns a Better Auth instance with the provided `sendMagicLink` callback.
2. When `createAuth` is called without `overrides`, the auth package shall apply default settings (cookie attributes, session expiry, database adapter) equivalent to the previous singleton configuration.
3. The auth package shall continue to export `requireUser`, `requireAdmin`, `requireSessionOwnership`, `authedAction`, `adminAction`, `AuthError` from the `@bulr/auth/server` subpath.
4. If `BETTER_AUTH_SECRET` or `DATABASE_URL` is not set at the time `createAuth` is called, the auth package shall throw an error with a descriptive message.
5. The auth package shall export `createAuthClient` from the `@bulr/auth/client` subpath so each app can instantiate its own Better Auth client with the correct `baseURL`.
6. While the factory refactor is applied, the auth package shall preserve backward compatibility with `apps/business` and `apps/admin` so that their existing sign-in and session flows continue to work without regression.

### 要件 2: アプリ別 Magic Link テンプレート

**目的:** 候補者として、「bulr — AI 面接アシスタント」という企業向けコピーではなく、候補者向けに適した文面の Magic Link メールを受信したい。それにより、サービスへの信頼感と使いやすさが向上する。

#### 受け入れ基準

1. When a candidate requests a Magic Link, the candidate app shall send an email using the candidate-specific template with copy appropriate for candidates.
2. When a business user requests a Magic Link, the business app shall send an email using the existing business-facing template copy.
3. When an admin user requests a Magic Link, the admin app shall send an email using the admin-facing template copy.
4. The auth package shall not own or embed any app-specific email template content; each app shall own its `lib/magic-link-template.ts` and inject it via `createAuth`.
5. The `__Secure-` cookie prefix behavior in production HTTPS environments shall be handled consistently with the existing middleware/proxy convention across all three apps.

### 要件 3: candidate_profile スキーマの新設

**目的:** 開発者として、候補者固有データの基点となる `candidate_profile` テーブルが `packages/db` に存在することで、候補者所有データ（プロフィール・履歴書・スキルアンケート等）を安全に関連付けられるようにしたい。

#### 受け入れ基準

1. The db package shall define a `candidate_profile` table with at minimum the columns: `id`, `user_id` (1:1 FK to Better Auth `user`), `display_name` (required), `headline` (optional), `created_at`, `updated_at`.
2. The `candidate_profile.user_id` column shall reference the Better Auth `user.id` with a unique constraint (1:1 relationship).
3. The db package shall generate a Drizzle migration file for the `candidate_profile` table that can be applied to the Neon Postgres database.
4. The existing Stage 1 `candidate` table shall not be modified by this spec.
5. The `candidate_profile` table shall be exported from the `packages/db` barrel.

### 要件 4: 候補者サインイン動線

**目的:** 候補者として、`bulr.net/sign-in` で Magic Link 認証によってサインインできるようにしたい。それにより、パスワードなしで安全にアカウントにアクセスできる。

#### 受け入れ基準

1. When a candidate visits `bulr.net/sign-in` and submits their email address, the candidate app shall send a Magic Link email using the candidate-specific template.
2. When a candidate clicks the Magic Link in the email, the candidate app shall create a session and redirect the candidate to the appropriate next page.
3. If the candidate's `candidate_profile` does not exist after successful authentication, the candidate app shall redirect the candidate to `/onboarding`.
4. If the candidate's `candidate_profile` already exists after successful authentication, the candidate app shall redirect the candidate to the home page (`/`).
5. The candidate app shall display appropriate Japanese-language UI copy on the sign-in page.
6. If a Magic Link request exceeds the rate limit (3 requests per email per 5 minutes, or 20 requests per IP per hour), the candidate app shall display a user-friendly error message.

### 要件 5: 候補者オンボーディング

**目的:** 候補者として、初回サインイン後に最小限のプロフィールを作成することで、bulr の候補者サービスを利用できるようにしたい。

#### 受け入れ基準

1. When a candidate is authenticated but `candidate_profile` does not exist, the candidate app shall redirect the candidate to `/onboarding`.
2. When a candidate submits the onboarding form with a valid `display_name`, the candidate app shall create a `candidate_profile` record and redirect to the home page (`/`).
3. If the onboarding form is submitted without a `display_name`, the candidate app shall display a validation error and not create the `candidate_profile`.
4. While the candidate is on the onboarding page, the candidate app shall not allow skipping onboarding and accessing other protected pages.
5. The `requireCandidate` guard shall verify both that the user is authenticated AND that `candidate_profile` exists; if either condition is false, it shall redirect appropriately.

### 要件 6: 招待トークン受け取り口

**目的:** 候補者として、企業から受け取った招待リンク `bulr.net/invitations/{token}` を踏むことで、サインイン後に招待の文脈が保持された状態でプロフィール初期化に誘導されたい。それにより、招待からエントリーまでの動線が途切れない。

#### 受け入れ基準

1. When a candidate visits `bulr.net/invitations/{token}` without being authenticated, the candidate app shall redirect to `/sign-in` with the token preserved as a query parameter.
2. When a candidate completes authentication and a pending invitation token exists, the candidate app shall store the token in a server-side pending state (cookie or server action) for later retrieval by the Wave 3 entry-flow spec.
3. When a candidate visits `bulr.net/invitations/{token}` while already authenticated, the candidate app shall store the pending token and redirect to `/onboarding` (if `candidate_profile` does not exist) or to the home page (if it does).
4. The candidate app shall not attempt to validate or consume the invitation token against any database entity in this spec; token validation is the responsibility of the Wave 3 `company-and-opening` spec.
5. The pending invitation token shall be stored in a way that survives the redirect chain (sign-in → callback → onboarding/home) without being exposed in client-side JavaScript.

### 要件 7: 候補者認証ガード

**目的:** 開発者として、候補者向けルートを保護する `requireCandidate` ガードが `packages/auth` から提供されることで、後続の Wave 2 spec（履歴書・スキルアンケート）が一貫したアクセス制御を再実装なしに利用できるようにしたい。

#### 受け入れ基準

1. The auth package shall export a `requireCandidate` function from the `@bulr/auth/server` subpath that returns the authenticated user and their `candidate_profile` when both exist.
2. If the user is not authenticated, `requireCandidate` shall throw `AuthError('UNAUTHORIZED')`.
3. If the user is authenticated but `candidate_profile` does not exist, `requireCandidate` shall throw `AuthError('CANDIDATE_PROFILE_MISSING')`.
4. The `requireCandidate` guard shall be usable in Server Components, Server Actions, and API Route Handlers following the same multi-layer defense pattern as `requireUser` and `requireAdmin`.
5. The auth package shall accept a `db` instance as a dependency (injected via `createAuth` or as a direct parameter) to query `candidate_profile`, maintaining the unidirectional dependency direction (`packages/auth` → `packages/db`).

### 要件 8: Turborepo ビルド環境変数と後方互換

**目的:** 開発者として、本 spec で追加・変更する環境変数が Turborepo の `build.env` に列挙され、かつ `apps/business` / `apps/admin` の既存動線が回帰なく動くことで、Vercel デプロイが確実に成功するようにしたい。

#### 受け入れ基準

1. The turbo.json `build.env` array shall include all environment variables required by the candidate app that are new or changed in this spec.
2. When `apps/business` and `apps/admin` are deployed after the factory refactor, their Magic Link sign-in flows shall continue to function correctly without any regression.
3. The `apps/candidate` package.json shall declare all required `@bulr/*` workspace dependencies.
4. The `packages/auth` package shall not import from any `apps/*` package, maintaining the unidirectional dependency rule (`apps/* → packages/*`).
