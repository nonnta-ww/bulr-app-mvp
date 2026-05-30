# 要件定義 — entry-flow

## はじめに

本 spec は Wave 3 の中核機能として、候補者所有資産（履歴書 + スキルアンケート）と企業所有資産（opening + invitation）を `entry` エンティティでつなぐ。Wave 2 完了時点で候補者側には `candidate_profile` / `resume_document` / `skill_survey_response` が揃い、Wave 3 `company-and-opening` 完了時点で企業側には `company` / `opening` / `invitation` が揃うが、両者をつなぐ `entry` エンティティが存在しない。

本 spec はその接続点を実装し、候補者が招待リンク経由でエントリーを確定し、企業ユーザーがエントリー一覧から各候補者の書類を確認できる動線を完成させる。

## スコープ境界

- **スコープ内**:
  - `entry` Drizzle スキーマ（id / candidate_profile_id FK / opening_id FK / invitation_id FK / resume_document_id FK nullable / skill_survey_response_id FK nullable / status enum / timestamps）+ `UNIQUE(candidate_profile_id, opening_id)` 制約
  - `resume_document` テーブルに対する `ON DELETE SET NULL` FK 制約の更新（本 spec が `entry.resume_document_id` FK を追加する際に、`resume_document` 側の削除制約を決定する）
  - 候補者側エントリー確認画面（`apps/candidate` `/invitations/[token]/confirm`）
  - 候補者側エントリー一覧（`apps/candidate` `/entries`）
  - 企業側エントリー一覧（`apps/business` `/openings/[openingId]/entries`）
  - 企業側エントリー詳細（`apps/business` `/openings/[openingId]/entries/[entryId]`）
  - `createEntry` Server Action（token 検証 + invitation consume + entry INSERT + snapshot 参照保存）、transaction + race condition 対策（`WHERE consumed_at IS NULL` 条件付き UPDATE）
  - `getResumeSignedUrlForBusiness` Server Action（`apps/business` 側、entry → opening → company 所有権検証）
  - `getEntriesByCandidateProfileId` クエリ（候補者向け）
  - `getEntriesByOpeningId` クエリ（企業向け）
  - `getEntryWithSnapshots` クエリ（Wave 4+ admin-operations / session-from-entry が消費する seam）
  - Drizzle migration ファイル
- **スコープ外**:
  - 面接セッション作成（Wave 3 `session-from-entry`）
  - エントリーの拒否・進捗管理ワークフロー（MVP は status の確認のみ）
  - 候補者によるエントリー取り消し（Wave 5+）
  - エントリー時の追加情報入力（志望動機等）
  - スカウト機能（Wave 5+）
  - エントリー通知メール（MVP は UI 確認のみ）
- **隣接 spec との期待関係**:
  - `company-and-opening`（Wave 3）が確立する `opening.id` / `invitation.token` / `invitation.consumed_at` を本 spec が消費する
  - `candidate-auth-onboarding`（Wave 2）が確立する `pending_invitation_token` cookie を本 spec が消費してエントリーを作成する
  - `resume-registration`（Wave 2）の `getPrimaryResumeDocument` seam と `resume_document.id` を本 spec が参照する
  - `skill-survey`（Wave 2）の `getLatestResponseByCandidateProfileId` seam と `skill_survey_response.id` を本 spec が参照する
  - `session-from-entry`（Wave 3）は本 spec が公開する `entry.id` と `getEntryWithSnapshots` seam を消費する

---

## 要件一覧

### 要件 1: entry エンティティの確立

**目的:** 開発者として、候補者のエントリーを表す `entry` エンティティが `packages/db` に存在することで、候補者と企業の opening を招待経由で安全につなぐデータ基盤を構築したい。

#### 受け入れ基準

1. The db package shall define an `entry` table with at minimum the columns: `id` (text, nanoid PK), `candidate_profile_id` (text, NOT NULL, FK to `candidate_profile.id`), `opening_id` (text, NOT NULL, FK to `opening.id`), `invitation_id` (text, NOT NULL, FK to `invitation.id`), `resume_document_id` (text, nullable, FK to `resume_document.id`), `skill_survey_response_id` (text, nullable, FK to `skill_survey_response.id`), `status` (pgEnum: `'submitted' | 'reviewed' | 'rejected' | 'progressing'`, NOT NULL, DEFAULT `'submitted'`), `created_at` (timestamptz), `updated_at` (timestamptz).
2. The `entry` table shall enforce a `UNIQUE(candidate_profile_id, opening_id)` constraint so that one candidate cannot submit multiple entries to the same opening at the database level.
3. All timestamp columns in the `entry` table shall use `{ withTimezone: true }` as required by the project convention.
4. The db package shall generate a Drizzle migration file for the `entry` table that can be applied to the Neon Postgres database.
5. The `entry` table and its types (`Entry`, `NewEntry`, `EntryStatus`) shall be exported from the `packages/db` barrel.

### 要件 2: resume_document の ON DELETE 制約更新

**目的:** 開発者として、`entry.resume_document_id` FK が `resume_document` テーブルを参照する際に、履歴書削除時もエントリーレコード自体は保持されるよう、`ON DELETE SET NULL` 制約を採用したい。

#### 受け入れ基準

1. The `entry.resume_document_id` foreign key to `resume_document` shall be defined with `ON DELETE SET NULL` so that when a `resume_document` record is deleted, the `entry` row remains intact but `resume_document_id` becomes NULL.
2. The migration for this constraint change shall be included in the entry-flow migration file (or a separate migration that runs after the entry table is created).
3. The deletion constraint change shall not affect existing `resume_document` records or the `candidate_profile` → `resume_document` relationship.

### 要件 3: createEntry Server Action（エントリー確定）

**目的:** 候補者として、招待リンク経由でエントリーを確定したとき、`entry` レコードが作成され、`invitation.consumed_at` が設定されることで、招待リンクの再利用が防止されるようにしたい。

#### 受け入れ基準

1. The `createEntry` Server Action shall be located in `apps/candidate` and shall use `authedAction` + internal `requireCandidate()` as the double-defense pattern.
2. When invoked, the Server Action shall read the `pending_invitation_token` cookie (set by the `candidate-auth-onboarding` spec's invitation token page), look up the `invitation` record by token, and verify that `invitation.consumed_at IS NULL`; if already consumed, it shall return an error indicating the invitation is already used.
3. The Server Action shall execute the following operations in a single database transaction:
   a. Insert an `entry` record with `candidate_profile_id`, `opening_id` (from `invitation.opening_id`), `invitation_id`, and optionally `resume_document_id` (from `getPrimaryResumeDocument`) and `skill_survey_response_id` (from `getLatestResponseByCandidateProfileId`).
   b. Update `invitation.consumed_at = now()` with a `WHERE consumed_at IS NULL` condition to prevent race conditions; if the affected row count is 0, the transaction shall be rolled back and an error returned indicating a concurrent conflict.
4. After successful entry creation, the Server Action shall clear the `pending_invitation_token` cookie.
5. If the `UNIQUE(candidate_profile_id, opening_id)` constraint is violated (duplicate entry attempt), the Server Action shall return a meaningful error rather than an unhandled database error.
6. The `resume_document_id` and `skill_survey_response_id` shall be nullable in the created entry; if no primary resume or latest survey response exists, the entry shall still be created with those fields as NULL.

### 要件 4: 候補者側エントリー確認画面

**目的:** 候補者として、招待リンクからサインイン後に `/invitations/[token]/confirm` でエントリー確認画面を見て、エントリーを確定できるようにしたい。

#### 受け入れ基準

1. When an authenticated candidate with a valid `pending_invitation_token` cookie navigates to `/invitations/[token]/confirm`, the app shall display the opening information (company name, opening title) and the candidate's primary resume and latest skill survey response status.
2. The confirmation page shall display a "エントリーを確定する" button that triggers the `createEntry` Server Action when clicked.
3. If `invitation.consumed_at` is already set (invitation already used), the confirmation page shall display "この招待リンクは使用済みです" and not show the confirmation button.
4. If the candidate does not have a `pending_invitation_token` cookie or the token does not match a valid invitation, the page shall display an appropriate error or redirect.
5. After successful entry creation, the candidate shall be redirected to `/entries`.

### 要件 5: 候補者側エントリー一覧

**目的:** 候補者として、`bulr.net/entries` で自分がエントリー済みの企業・募集一覧を確認できるようにしたい。

#### 受け入れ基準

1. When an authenticated candidate navigates to `/entries`, the app shall display a list of all entries belonging to that candidate, ordered by most recent first.
2. Each entry in the list shall display at minimum: company name, opening title, entry date (`created_at`), and status.
3. If the candidate has no entries, the page shall display an appropriate empty state message.
4. The entries list shall be protected by `requireCandidate()` guard; unauthenticated or profile-missing users shall be redirected appropriately.

### 要件 6: getEntriesByCandidateProfileId クエリ

**目的:** 開発者として、候補者の全エントリーを企業・募集名付きで取得できるクエリ関数が `packages/db` から提供されることで、候補者側 UI を Server Component で安全に実装できるようにしたい。

#### 受け入れ基準

1. The db package shall export a `getEntriesByCandidateProfileId(candidateProfileId: string)` function from `packages/db/src/queries/entry/` that returns entries joined with opening and company names, ordered by `entry.created_at DESC`.
2. The returned type shall include at minimum: `entry` fields, `opening.title`, `company.name`.
3. The function shall scope all queries to the given `candidateProfileId` to prevent cross-candidate data access.

### 要件 7: 企業側エントリー一覧

**目的:** 企業ユーザーとして、`bz.bulr.net/openings/{openingId}/entries` でエントリーした候補者の一覧を確認し、履歴書や面接セッション作成へのリンクにアクセスできるようにしたい。

#### 受け入れ基準

1. When an authenticated company user navigates to `/openings/{openingId}/entries`, the business app shall display a list of entries for that opening, showing for each entry: candidate display name, entry date, entry status, and links to the resume preview and the entry detail page.
2. If the opening does not belong to the authenticated user's company, the app shall return 404 or redirect appropriately.
3. The entries list shall be protected by `requireCompanyUser()` guard and the opening's `company_id` shall be verified against the authenticated user's `company_id`.
4. If no entries exist for the opening, the page shall display an appropriate empty state message.

### 要件 8: 企業側エントリー詳細

**目的:** 企業ユーザーとして、`bz.bulr.net/openings/{openingId}/entries/{entryId}` でエントリーした候補者の詳細（履歴書 + スキルアンケート結果）を確認できるようにしたい。

#### 受け入れ基準

1. When an authenticated company user navigates to `/openings/{openingId}/entries/{entryId}`, the business app shall display the candidate's display name, entry status, and (if available) a button/link to preview the resume via signed URL.
2. If `entry.resume_document_id` is not NULL, the page shall provide a "履歴書を確認" action that calls `getResumeSignedUrlForBusiness` to generate a signed URL and opens it.
3. If `entry.skill_survey_response_id` is not NULL, the page shall display a link to the skill survey result or a summary of the candidate's skill survey answers.
4. If the entry does not belong to an opening of the authenticated user's company, the app shall return 404 or redirect appropriately.
5. The detail page shall display a "面接セッションを作成" button as a placeholder for the Wave 3 `session-from-entry` spec (the button need not be functional in this spec).

### 要件 9: getEntriesByOpeningId クエリ

**目的:** 開発者として、特定の opening に対する全エントリーを候補者名付きで取得できるクエリ関数が `packages/db` から提供されることで、企業側 UI を Server Component で安全に実装できるようにしたい。

#### 受け入れ基準

1. The db package shall export a `getEntriesByOpeningId(openingId: string)` function from `packages/db/src/queries/entry/` that returns entries joined with candidate display names, ordered by `entry.created_at DESC`.
2. The returned type shall include at minimum: `entry` fields, `candidate_profile.display_name`.

### 要件 10: getEntryWithSnapshots クエリ（Wave 3+ seam）

**目的:** 開発者として、エントリーの全スナップショット参照（resume_document + skill_survey_response）を取得できる seam クエリが `packages/db` から提供されることで、Wave 3 `session-from-entry` および Wave 4 `admin-operations` が安全に消費できるようにしたい。

#### 受け入れ基準

1. The db package shall export a `getEntryWithSnapshots(entryId: string)` function from `packages/db/src/queries/entry/` that returns the entry record joined with its related `opening`, `company`, `candidate_profile`, `resume_document` (nullable join), and `skill_survey_response` (nullable join).
2. The returned type `EntryWithSnapshots` shall be exported from `packages/db` for use by downstream specs.
3. The function shall return `null` if no entry with the given `entryId` exists.

### 要件 11: getResumeSignedUrlForBusiness Server Action

**目的:** 企業ユーザーとして、エントリーに添付された候補者の履歴書を署名 URL 経由で安全に閲覧できるようにしたい。

#### 受け入れ基準

1. The `getResumeSignedUrlForBusiness` Server Action shall be located in `apps/business` and shall use `authedAction` + internal `requireCompanyUser()` as the double-defense pattern.
2. The Server Action shall verify ownership by checking: `entry.opening_id` → `opening.company_id` === authenticated user's `company_id`; if ownership check fails, it shall throw or return `AuthError('FORBIDDEN')`.
3. The Server Action shall retrieve the `blob_pathname` from the `resume_document` record referenced by `entry.resume_document_id` and generate a short-lived signed URL via `@vercel/blob` `head()`.
4. If `entry.resume_document_id` is NULL (resume was deleted), the Server Action shall return `{ ok: false, error: { code: 'RESUME_NOT_AVAILABLE' } }` rather than throwing.

### 要件 12: Drizzle migration と drizzle-kit push

**目的:** 開発者として、entry テーブルの migration を安全に開発・本番環境に適用できるようにしたい。

#### 受け入れ基準

1. The db package shall generate a Drizzle migration file for the `entry` table using `drizzle-kit generate`.
2. The migration shall be applicable to the dev Neon branch using `drizzle-kit push` with inline env override (as per `feedback_drizzle_kit_env_resolution.md` convention).
3. The migration shall be applicable to the production Neon branch using `drizzle-kit migrate`.
4. The `entry` table's `status` pgEnum shall be included in the migration.
