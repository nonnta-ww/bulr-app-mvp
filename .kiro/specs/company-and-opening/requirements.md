# 要件定義 — company-and-opening

## はじめに

本 spec は Wave 3 の起点となる feature であり、企業側の主体エンティティ（`company` / `opening` / `invitation`）を確立する。Wave 2 完了時点で候補者側データは揃ったが、企業側に募集（opening）と招待（invitation）が存在しないため、Wave 3 の `entry-flow` が前提とする「どの募集に対するエントリーか」を表現できない。本 spec はその基盤となる 3 エンティティを整備し、企業ユーザーが募集を作成して招待リンクを発行できる UI を `apps/business` に追加する。

## スコープ境界

- **スコープ内**: `company` / `opening` / `invitation` Drizzle スキーマと migration、`user_profile.company_id` カラム追加、`requireCompanyUser` ガード新設（`packages/auth`）、`apps/business` の openings ルート群（一覧 / 作成 / 詳細 / 招待発行 / 招待一覧）、`authedAction` + 内部 `requireCompanyUser` パターンによる Server Actions、`CANDIDATE_BASE_URL` 環境変数と `turbo.json` `build.env` 追加、招待 URL 表示とクリップボードコピー UI
- **スコープ外**: `entry` エンティティと作成フロー（Wave 3 `entry-flow`）、`invitation.consumed_at` の設定ロジック（Wave 3 `entry-flow`）、公開求人ボード化（Wave 5+）、複数ユーザー × 1 社 RBAC（Wave 5+）、招待リンクのメール送信（UI 上での URL 表示のみ）
- **隣接 spec との期待関係**: `entry-flow`（Wave 3）は本 spec が確立する `opening.id` と `invitation.token` を参照して `entry` を作成し、`invitation.consumed_at` を設定する。`candidate-auth-onboarding`（Wave 2）の `/invitations/[token]` 受け取り口は本 spec が発行した token（`/^[A-Za-z0-9_-]+$/` regex 互換）を前提とする。

---

## 要件一覧

### 要件 1: company エンティティの確立

**目的:** 開発者として、企業を表す `company` エンティティが `packages/db` に存在することで、企業ユーザーを特定の企業に所属させ、企業スコープでのデータ管理ができるようにしたい。

#### 受け入れ基準

1. The db package shall define a `company` table with at minimum the columns: `id` (text, nanoid PK), `name` (text, NOT NULL), `created_at` (timestamptz), `updated_at` (timestamptz).
2. The db package shall generate a Drizzle migration file for the `company` table that can be applied to the Neon Postgres database.
3. The `company` table shall be exported from the `packages/db` barrel.
4. The db package shall add a `company_id` column (text, nullable, FK to `company.id`) to the existing `user_profile` table so that each interviewer user can be associated with one company.
5. When a `user_profile.company_id` is NULL, the system shall treat that user as a non-company user and continue to operate the existing `requireUser` flows without regression.

### 要件 2: opening エンティティの確立

**目的:** 企業ユーザーとして、募集（opening）を表すエンティティが存在することで、候補者への招待を特定の募集に紐付けられるようにしたい。

#### 受け入れ基準

1. The db package shall define an `opening` table with at minimum the columns: `id` (text, nanoid PK), `company_id` (text, NOT NULL, FK to `company.id`), `title` (text, NOT NULL), `description` (text, nullable), `status` (enum: `'draft' | 'open' | 'closed'`, NOT NULL), `created_at` (timestamptz), `updated_at` (timestamptz).
2. The db package shall generate a Drizzle migration file for the `opening` table that can be applied to the Neon Postgres database.
3. The `opening` table shall be exported from the `packages/db` barrel.
4. The opening system shall support status transitions among `'draft'`, `'open'`, and `'closed'`; the MVP shall operate primarily with `'open'` status.

### 要件 3: invitation エンティティの確立

**目的:** 企業ユーザーとして、招待（invitation）エンティティが存在することで、安全な URL-safe トークンを持つ招待リンクを発行し、候補者に配布できるようにしたい。

#### 受け入れ基準

1. The db package shall define an `invitation` table with at minimum the columns: `id` (text, nanoid PK), `opening_id` (text, NOT NULL, FK to `opening.id`), `token` (text, NOT NULL, UNIQUE), `created_at` (timestamptz), `expires_at` (timestamptz, nullable), `consumed_at` (timestamptz, nullable).
2. The db package shall generate a Drizzle migration file for the `invitation` table that can be applied to the Neon Postgres database.
3. The `invitation` table shall be exported from the `packages/db` barrel.
4. The system shall generate invitation tokens using a cryptographically secure random source producing at least 256 bits of entropy and encoding the result as URL-safe base64, producing tokens that match the regex `/^[A-Za-z0-9_-]+$/`.
5. The invitation table shall enforce a UNIQUE constraint on the `token` column.
6. The `expires_at` column shall be nullable; when NULL, the invitation has no expiration in the MVP.
7. The `consumed_at` column shall be nullable and shall remain NULL until Wave 3 `entry-flow` sets it upon entry creation.

### 要件 4: requireCompanyUser 認証ガード

**目的:** 開発者として、企業ユーザー専用のガード `requireCompanyUser` が `packages/auth` から提供されることで、企業ユーザーのみがアクセスできるルートを一貫したパターンで保護できるようにしたい。

#### 受け入れ基準

1. The auth package shall export a `requireCompanyUser` function from the `@bulr/auth/server` subpath that returns the authenticated user and their associated company when both exist.
2. If the user is not authenticated, `requireCompanyUser` shall throw `AuthError('UNAUTHORIZED')`.
3. If the user is authenticated but `user_profile.company_id` is NULL, `requireCompanyUser` shall throw `AuthError('COMPANY_NOT_ASSOCIATED')`.
4. The `requireCompanyUser` guard shall be usable in Server Components, Server Actions, and API Route Handlers following the same multi-layer defense pattern as `requireUser`, `requireAdmin`, and `requireCandidate`.
5. The auth package shall add `'COMPANY_NOT_ASSOCIATED'` to the `AuthErrorCode` union type.

### 要件 5: opening 一覧・作成

**目的:** 企業ユーザーとして、`bz.bulr.net/openings` でログイン済みの自社の募集一覧を確認し、新規募集を作成できるようにしたい。

#### 受け入れ基準

1. When an authenticated company user navigates to `/openings`, the business app shall display a list of openings belonging to their company, ordered by most recent first.
2. When an authenticated company user navigates to `/openings/new`, the business app shall display a form to create a new opening with fields for title (required), description (optional), and status.
3. When a company user submits the create-opening form with a valid title, the business app shall create an opening record in the database with the user's `company_id` and redirect to the opening detail page.
4. If a company user submits the create-opening form without a title, the business app shall display a validation error and not create the opening record.
5. If an unauthenticated user or a user without a company association attempts to access `/openings`, the business app shall redirect to the sign-in page or display an appropriate error.

### 要件 6: opening 詳細・編集

**目的:** 企業ユーザーとして、`bz.bulr.net/openings/{id}` で特定の募集の詳細を確認し、status を変更できるようにしたい。

#### 受け入れ基準

1. When an authenticated company user navigates to `/openings/{openingId}`, the business app shall display the opening's title, description, status, and a list of issued invitations.
2. When an authenticated company user views `/openings/{openingId}`, the business app shall display an entry list placeholder indicating that entries will be visible in a future Wave.
3. If a company user attempts to view an opening that does not belong to their company, the business app shall return a 404 or redirect appropriately.

### 要件 7: invitation 発行

**目的:** 企業ユーザーとして、特定の募集に対して招待リンクを発行し、その URL を取得して候補者に共有できるようにしたい。

#### 受け入れ基準

1. When an authenticated company user clicks the "招待リンクを発行" button on the opening detail page, the business app shall generate a new invitation token, insert an `invitation` record in the database, and display the resulting invitation URL in the format `${CANDIDATE_BASE_URL}/invitations/{token}`.
2. The system shall generate each invitation token using `crypto.randomBytes(32).toString('base64url')`, producing a URL-safe token of approximately 43 characters that satisfies the regex `/^[A-Za-z0-9_-]+$/`.
3. The business app shall not store the full invitation URL in the database; only the token shall be persisted.
4. The business app shall provide a one-click copy-to-clipboard button next to each displayed invitation URL so the company user can share it without manual text selection.
5. If the invitation token generation or database insertion fails, the business app shall display an error message and not emit a partial or duplicate token.
6. The `CANDIDATE_BASE_URL` environment variable shall be used to construct the invitation URL; when not set, the system shall throw or fall back to a safe default.

### 要件 8: invitation 一覧

**目的:** 企業ユーザーとして、`bz.bulr.net/openings/{id}/invitations` で特定の募集に対して発行済みの招待リンク一覧を確認し、各招待の消費状態を把握できるようにしたい。

#### 受け入れ基準

1. When an authenticated company user navigates to `/openings/{openingId}/invitations`, the business app shall display a list of invitations for that opening, showing for each invitation: the full invitation URL, the creation timestamp, and the consumed status (consumed / not consumed).
2. When an invitation's `consumed_at` is NULL, the business app shall display its status as "未使用".
3. When an invitation's `consumed_at` is not NULL, the business app shall display its status as "使用済み".
4. The business app shall provide a copy-to-clipboard button for each invitation URL in the list.

### 要件 9: 環境変数と Turborepo 設定

**目的:** 開発者として、`CANDIDATE_BASE_URL` 環境変数が `apps/business` のビルド時に利用可能であることで、招待 URL を正しく構築できるようにしたい。

#### 受け入れ基準

1. The system shall define `CANDIDATE_BASE_URL` as a new environment variable for the business app, with a production value of `https://bulr.net` and a development value of `http://localhost:3020`.
2. The `turbo.json` `build.env` array shall include `CANDIDATE_BASE_URL` so that the variable is passed through during Turborepo builds on Vercel.
3. When `CANDIDATE_BASE_URL` is not set at runtime, the invitation URL construction shall fail loudly (throw or log an error) rather than silently producing a malformed URL.
