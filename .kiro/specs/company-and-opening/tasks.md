# 実装計画 — company-and-opening

## タスク一覧

- [x] 1. DB スキーマ基盤の整備
- [x] 1.1 company テーブルの Drizzle スキーマを追加する
  - `packages/db/src/schema/company.ts` を新規作成し、`id` (text PK, nanoid)、`name` (text, NOT NULL)、`created_at` / `updated_at` (timestamptz, `{ withTimezone: true }`) カラムを定義する
  - `Company` / `NewCompany` 型を `$inferSelect` / `$inferInsert` で導出してエクスポートする
  - `pnpm --filter @bulr/db typecheck` が通ること
  - _Requirements: 1.1, 1.3_

- [x] 1.2 opening テーブルの Drizzle スキーマを追加する
  - `packages/db/src/schema/opening.ts` を新規作成し、`id`、`company_id` (NOT NULL FK → company.id)、`title`、`description` (nullable)、`status` (pgEnum: `'draft' | 'open' | 'closed'`, NOT NULL, default `'draft'`)、`created_at` / `updated_at` (timestamptz) カラムを定義する
  - `Opening` / `NewOpening` 型をエクスポートする
  - `pnpm --filter @bulr/db typecheck` が通ること
  - _Requirements: 2.1, 2.4_
  - _Depends: 1.1_

- [x] 1.3 invitation テーブルの Drizzle スキーマを追加する
  - `packages/db/src/schema/invitation.ts` を新規作成し、`id`、`opening_id` (NOT NULL FK → opening.id)、`token` (text, NOT NULL, `.unique()`)、`created_at` (timestamptz)、`expires_at` (nullable timestamptz)、`consumed_at` (nullable timestamptz) カラムを定義する
  - `Invitation` / `NewInvitation` 型をエクスポートする
  - `pnpm --filter @bulr/db typecheck` が通ること
  - _Requirements: 3.1, 3.5, 3.6, 3.7_
  - _Depends: 1.2_

- [x] 1.4 user_profile テーブルに company_id nullable FK を追加する
  - `packages/db/src/schema/user-profile.ts` の `userProfile` テーブル定義に `companyId: text('company_id').references(() => company.id)` カラムを追加する（nullable FK）
  - 既存レコードは `company_id=NULL` のままで継続稼働できることを確認する（nullable のため migration が non-destructive であること）
  - `pnpm --filter @bulr/db typecheck` が通ること
  - _Requirements: 1.4, 1.5_
  - _Depends: 1.1_

- [x] 1.5 packages/db のバレルエクスポートを更新する
  - `packages/db/src/schema/index.ts` に `company` / `opening` / `invitation` スキーマの re-export を追加する
  - `pnpm --filter @bulr/db typecheck` が通ること
  - _Requirements: 1.3, 2.3, 3.3_
  - _Depends: 1.1, 1.2, 1.3_

- [x] 1.6 Drizzle migration ファイルを生成して開発 DB に適用する
  - `drizzle-kit generate` を実行して migration SQL ファイル（`packages/db/drizzle/` 配下）を生成する
  - `drizzle-kit push`（inline env override: `DIRECT_URL=... DATABASE_URL=...`）で dev DB に `company` / `opening` / `invitation` テーブルと `user_profile.company_id` カラムが作成されること
  - psql または drizzle-studio で 3 テーブルの存在と `user_profile.company_id` カラムを確認できること
  - _Requirements: 1.2, 2.2, 3.2_
  - _Depends: 1.5_

- [x] 2. requireCompanyUser 認証ガードの実装
- [x] 2.1 AuthErrorCode に COMPANY_NOT_ASSOCIATED を追加する
  - `packages/auth/src/errors.ts` の `AuthErrorCode` union 型に `'COMPANY_NOT_ASSOCIATED'` を追加する
  - `pnpm --filter @bulr/auth typecheck` が通ること
  - _Requirements: 4.5_
  - _Depends: 1.4_

- [x] 2.2 requireCompanyUser ガード関数を実装する
  - `packages/auth/src/guards.ts` に `requireCompanyUser` 関数を追加する
  - 実装: `requireUser()` を呼び出して認証を確認 → `user_profile` テーブルを `userId` でクエリ → `company_id` が NULL なら `AuthError('COMPANY_NOT_ASSOCIATED')` を throw → `{ user, companyId }` を返す
  - 未認証ユーザーには `AuthError('UNAUTHORIZED')` が返ること（`requireUser` に委譲）
  - `company_id=NULL` ユーザーには `AuthError('COMPANY_NOT_ASSOCIATED')` が返ること
  - `pnpm --filter @bulr/auth typecheck` が通ること
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - _Depends: 2.1, 1.4_

- [x] 2.3 @bulr/auth/server バレルから requireCompanyUser を re-export する
  - `packages/auth/src/server-entry.ts` の exports に `requireCompanyUser` を追加する
  - `pnpm typecheck` が全 workspace で通ること
  - _Requirements: 4.1, 4.4_
  - _Depends: 2.2_

- [x] 3. CANDIDATE_BASE_URL 環境変数と Turborepo 設定
- [x] 3.1 turbo.json の build.env に CANDIDATE_BASE_URL を追加する
  - ルートの `turbo.json` の `pipeline.build.env`（または `tasks.build.env`）配列に `"CANDIDATE_BASE_URL"` を追加する
  - Vercel ビルド時に `CANDIDATE_BASE_URL` が `apps/business` の Next.js ビルドプロセスに届くことを確認する
  - `pnpm build` が全 packages・apps で成功すること（`CANDIDATE_BASE_URL` 未設定時は起動時エラーではなく、利用箇所での fail-loud を許容）
  - _Requirements: 9.1, 9.2_

- [x] 4. 企業向け openings ルート群の実装
- [x] 4.1 (P) openings 一覧ページを実装する
  - `apps/business/app/(interviewer)/openings/page.tsx` を新規作成する（Server Component）
  - `requireCompanyUser()` を呼び出して認証・企業所属を確認する
  - `company_id` でスコープした opening 一覧を `created_at` 降順で DB から取得して表示する
  - `+ 新規募集を作成` リンク（`/openings/new`）を配置する
  - _Requirements: 5.1, 5.5_
  - _Boundary: OpeningsListPage_
  - _Depends: 2.3_

- [x] 4.2 (P) openings 作成ページと Server Action を実装する
  - `apps/business/app/(interviewer)/openings/new/page.tsx` を新規作成する（Client Component: フォーム）
  - `apps/business/app/(interviewer)/openings/_actions/create-opening.ts` を新規作成する
  - Server Action: `authedAction(schema, handler)` でラップ。handler 内で `requireCompanyUser()` を呼び、`company_id` を取得して `opening` テーブルに INSERT し、`redirect(/openings/{id})` する
  - Zod スキーマ: `title` (min 1, max 200), `description` (optional, max 5000), `status` (enum, default `'draft'`)
  - title 未入力でのフォーム送信時にフィールドエラーが表示されること
  - _Requirements: 5.2, 5.3, 5.4_
  - _Boundary: OpeningsNewPage, CreateOpeningAction_
  - _Depends: 2.3_

- [x] 4.3 (P) クリップボードコピーボタンコンポーネントを実装する
  - `apps/business/app/(interviewer)/openings/_components/copy-url-button.tsx` を新規作成する（`'use client'`）
  - `url: string` props を受け取り、クリック時に `navigator.clipboard.writeText(url)` を呼ぶ
  - コピー成功時に「コピーしました ✓」のような一時フィードバックを表示する（useState でトグル）
  - _Requirements: 7.4, 8.4_
  - _Boundary: CopyUrlButton_

- [x] 4.4 opening 詳細ページを実装する
  - `apps/business/app/(interviewer)/openings/[openingId]/page.tsx` を新規作成する（Server Component）
  - `requireCompanyUser()` で認証確認後、`opening.id AND opening.company_id = companyId` でクエリし、他社 opening は `notFound()` を返す
  - opening の title / description / status を表示する
  - 招待一覧（`invitation` テーブルを `opening_id` でフェッチ）をインラインで表示し、各招待の URL・作成日・消費状態（`consumed_at` の有無）と `CopyUrlButton` を並べる
  - entries 一覧のプレースホルダを表示する（「Wave 3 で実装予定」注記）
  - 「招待リンクを発行」ボタンを配置して `create-invitation` Server Action を呼び出す
  - _Requirements: 6.1, 6.2, 6.3, 7.1_
  - _Depends: 4.3, 2.3_

- [x] 4.5 招待リンク発行 Server Action を実装する
  - `apps/business/app/(interviewer)/openings/[openingId]/_actions/create-invitation.ts` を新規作成する
  - `authedAction` でラップし、handler 内で `requireCompanyUser()` を呼び出す
  - `opening.id AND company_id` で所有権を確認し、失敗時は `AuthError('NOT_FOUND')` を throw する
  - `crypto.randomBytes(32).toString('base64url')` でトークンを生成し（`~43 文字、/^[A-Za-z0-9_-]+$/ 互換`）、`invitation` テーブルに INSERT する
  - `CANDIDATE_BASE_URL` が未設定なら `throw new Error('CANDIDATE_BASE_URL is not set')` を送出する
  - 戻り値として `{ invitationUrl: '${CANDIDATE_BASE_URL}/invitations/${token}' }` を返す
  - `pnpm typecheck` が通ること。DB には token のみ保存され URL 全体は保存されないこと
  - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 9.3_
  - _Depends: 4.4, 3.1_

- [x] 4.6 招待一覧ページを実装する
  - `apps/business/app/(interviewer)/openings/[openingId]/invitations/page.tsx` を新規作成する（Server Component）
  - `requireCompanyUser()` で認証・所有権確認後、当該 opening の全 invitation を `created_at` 降順で表示する
  - 各招待行に: 招待 URL（`CANDIDATE_BASE_URL + '/invitations/' + token` で構築）、作成日時、消費状態（`consumed_at=NULL` → 「未使用」 / それ以外 → 「使用済み」）、`CopyUrlButton` を表示する
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - _Depends: 4.3, 4.5_

- [x] 4.7 `apps/business/proxy.ts` の matcher に opening ルートを追加する
  - `apps/business/proxy.ts` の `config.matcher` 配列に以下を追加する:
    - `/openings`
    - `/openings/new`
    - `/openings/:openingId*`
  - 既存の認証 cookie 存在チェック (`hasSessionCookie`) を利用し、`/openings*` への未認証アクセスは `/sign-in` にリダイレクトする
  - DB クエリは proxy では実施しない。`requireCompanyUser` は各 Server Component / Server Action 側で実施する（CVE-2025-29927 対策、多層防御）
  - 完了時の観察可能状態: 未認証で `/openings` にアクセスすると `/sign-in` にリダイレクトされる
  - _Boundary: BusinessProxy_
  - _Depends: 4.1（openings ルートが作成されていること）_
  - _Requirements: 5.5_

- [x] 5. 統合検証
- [x] 5.1 全体ビルド・タイプチェックの確認
  - `pnpm typecheck` が全 workspace（packages/auth、packages/db、apps/business 等）で成功すること
  - `pnpm build` が全 packages と apps で成功すること
  - `requireCompanyUser` が `@bulr/auth/server` から正しく import できること
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.4, 4.5, 9.2_

- [x] 5.2 smoke test: opening 作成・招待発行フローの手動確認
  - 開発環境で `CANDIDATE_BASE_URL=http://localhost:3020` を設定して `pnpm dev` を起動する
  - company_id が設定済みのユーザーで `/openings` にアクセスし一覧が表示されること
  - `/openings/new` で title を入力して送信 → opening 詳細ページにリダイレクトされること
  - 詳細ページで「招待リンクを発行」をクリック → `http://localhost:3020/invitations/{token}` 形式の URL が表示されること
  - token が `/^[A-Za-z0-9_-]+$/` にマッチすること（コンソールや DB で確認）
  - コピーボタンをクリックしてクリップボードの内容が正しい URL であること
  - `/openings/{id}/invitations` で招待一覧が表示され「未使用」ステータスが表示されること
  - _Requirements: 5.1, 5.2, 5.3, 5.5, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.6, 8.1, 8.2, 8.4, 9.1_
  - _Depends: 5.1_
