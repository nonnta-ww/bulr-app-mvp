# Requirements Document

## Project Description (Input)

企業ユーザーを会社に招待・紐付けるフローを追加する。

### 背景

現状 admin で会社作成（`apps/admin/app/companies/_actions/create-company.ts`）と会社メンバー（面接官）一覧の表示（`apps/admin/app/companies/[id]/page.tsx`、読み取りのみ）はできるが、企業ユーザー(`user_profile`)を会社(`company`)に紐付ける = `user_profile.company_id` を設定する経路がソースに一切存在しない。better-auth サインアップフック（`packages/auth/src/server.ts` の `databaseHooks.user.create.after`）は `user_profile` を `userId` + `displayName` のみで作成し `company_id` は NULL のまま。

そのため全企業ユーザーが `requireCompanyUser()`（`packages/auth/src/guards.ts`）で `COMPANY_NOT_ASSOCIATED` となり、`/openings` 等の会社ゲート付き business ページに入れず、唯一通る `/interviews`（`requireUser` のみ）へ二段リダイレクト（`/openings` → `/sign-in` → `/interviews`）される。現状の紐付けは手動 DB 編集でしか不可能。

### 要件（概要）

1. **管理機能（admin）**: admin から会社の企業ユーザーを招待できる、または既存ユーザーを会社に紐付け／解除できる。
2. **受諾フロー**: 招待を受けた企業ユーザーが受諾すると `user_profile.company_id` が設定される。候補者側の招待トークン受諾フロー（`apps/candidate/app/invitations/[token]/confirm`）が参考実装。
3. **未所属 UX（business）**: `COMPANY_NOT_ASSOCIATED` の場合に `/sign-in` へ飛ばさず「会社未所属」を明示する UX 改善（`openings/page.tsx` 等の catch 分岐）。

### 境界（暫定）

- **admin**: 会社-ユーザー管理（招待発行 / 紐付け / 解除）
- **auth**: `guards`（COMPANY_NOT_ASSOCIATED の扱い）・招待トークン発行/検証
- **business**: 未所属 UX
- **db**: 招待テーブルを新設するか、既存の invitation（候補者招待）を流用/分離するかの検討

### 留意点

- 既存 spec `company-and-opening`（会社・募集）、`monorepo-app-split`（admin/business 分割）、`authentication` / `candidate-auth-onboarding`（招待トークン受諾の既存実装）との整合。
- 対象アプリ/パッケージ: `apps/business`, `apps/admin`, `packages/auth`, `packages/db`。
- CVE-2025-29927 の教訓（proxy/middleware に認可を依存しない）を踏襲し、認可は Server Component / Server Action 側の guard で行う。

## Requirements

<!-- Will be generated in /kiro-spec-requirements phase -->
</content>
