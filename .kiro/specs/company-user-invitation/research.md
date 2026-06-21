# Research Log — company-user-invitation

> Discovery type: **Light（既存システム拡張）**。新規外部依存なし。既存の招待トークン・メール・認可基盤を再利用する統合中心の調査。

## 1. Discovery スコープ

- 候補者×募集の既存招待フロー（参考実装）の構造把握
- company / user_profile / invitation スキーマと制約の確認
- admin の会社管理・Server Action ラッパー・認可ガードのパターン確認
- メール送信基盤（magic-link 注入パターン）の再利用可否
- business の未所属時挙動（catch → redirect）と proxy の責務確認

## 2. 主要調査結果（source: file:line）

### 2.1 既存招待トークンフロー（参考実装）

- `packages/db/src/schema/invitation.ts:13-24` — `invitation`（id/openingId/token unique/createdAt/expiresAt/consumedAt）。**候補者×募集専用**。
- `apps/candidate/app/invitations/[token]/confirm/_actions/create-entry.ts:32-123` — `authedAction` + `requireCandidate`。token SELECT → 未消費確認 → `db.transaction` 内で `consumed_at` を条件付き UPDATE（`WHERE consumed_at IS NULL`）→ recheck で race 検知 → INSERT。redirect は transaction 外。
- 含意: **企業ユーザー招待は概念が異なる（会社×メール）ため別テーブルを新設**。token ライフサイクル（発行→保存→cookie→ページ検証→transaction で単回消費）はこの型をそのまま踏襲する。

### 2.2 company / user_profile スキーマ

- `packages/db/src/schema/company.ts:11-19` — `company`（id/name/`isActive` boolean default true/createdAt/updatedAt）。**status enum は無く isActive のみ**。
- `packages/db/src/schema/user-profile.ts:13-23` — `userProfile`（userId PK→user cascade / `companyId` nullable→company / displayName / `roleInOrg` text nullable / yearsOfExperience / timestamps）。
- 含意: 会社ライフサイクルを active/suspended/terminated で区別するため **`company.status` 列を新設し authoritative にする**。`is_active` は既存読み手のため後方互換シャドウとして当面同期維持（移行タスクで一掃）。`roleInOrg` は free text だが、新規書込（招待/受諾）は固定 enum に制約する。

### 2.3 認可ガード / Server Action ラッパー

- `packages/auth/src/guards.ts:157-195` — `requireCompanyUser()` は user_profile を userId で引き `companyId` NULL なら `COMPANY_NOT_ASSOCIATED`。**会社ステータスは未判定**。
- `packages/auth/src/errors.ts:17-23` — `AuthErrorCode`（UNAUTHORIZED/FORBIDDEN/SESSION_EXPIRED/NOT_FOUND/CANDIDATE_PROFILE_MISSING/COMPANY_NOT_ASSOCIATED）。
- `packages/auth/src/safe-action.ts:30-88` — `authedAction`(requireUser) / `adminAction`(requireAdmin)。`Result<R> = {ok:true,data} | {ok:false,error:{code,message}}`。AuthError/ZodError を error に変換、それ以外は再 throw。
- 含意: `requireCompanyUser()` に会社ステータス判定を追加し、非 active 時は新コード **`COMPANY_INACTIVE`** を throw。admin mutation は全て `adminAction` でラップ。

### 2.4 admin 会社管理

- `apps/admin/app/companies/_actions/create-company.ts` / `disable-company.ts` — `adminAction` パターン。`disable-company` は `isActive=false` + `revalidatePath`。
- `apps/admin/app/companies/[id]/page.tsx:181-` — 「面接官一覧」表示のみ（追加/招待/解除 UI 無し）。
- `packages/db/src/queries/admin/companies-query.ts:182` — `userProfile.companyId = companyId` でメンバー読み取り。
- 含意: 会社詳細ページに「招待発行フォーム / 保留中招待一覧 / メンバー解除 / ステータス操作」を追加。`disable-company` は `setCompanyStatus` に統合。

### 2.5 メール基盤

- `packages/auth/src/email/resend.ts:29` — `sendEmail({to,subject,html,text})`。`SMTP_HOST` 有→Mailpit、無→Resend。`@bulr/auth/server` から export 済み。
- `apps/admin/lib/auth.ts` + `apps/admin/lib/magic-link-template.ts` — 各アプリが `render*Email` で本文生成し `sendEmail` で送信する DI パターン。
- 含意: **admin に `renderCompanyInvitationEmail({url, companyName})` を新設**し `sendEmail` で送信。受諾リンクは business アプリ宛のため base URL が必要。

### 2.6 business 未所属挙動 / proxy / app URL

- `apps/business/app/(interviewer)/openings/page.tsx:49-59` — `requireCompanyUser()` を try/catch、AuthError でも catch-all でも `redirect('/sign-in')`（**COMPANY_NOT_ASSOCIATED を UNAUTHORIZED と同列に扱うのが症状の原因**）。同パターンが他の会社ゲートページにも存在。
- `apps/business/proxy.ts:30-72` — Cookie 存在チェックのみ（UX）。matcher は `/interviews`・`/openings*`。認可は持たない（CVE-2025-29927）。
- `apps/business/lib/capture/e2e-scenarios.test.ts:324` — **`BUSINESS_BASE_URL`** env が既に使われている。受諾リンク生成に流用する。
- 含意: 会社ゲートの catch を共通ヘルパー化し、`COMPANY_NOT_ASSOCIATED` / `COMPANY_INACTIVE` → `/no-company`、`UNAUTHORIZED` → `/sign-in` に分岐。`/no-company` を proxy matcher に追加（Cookie 無→/sign-in）。

## 3. Synthesis（build-vs-adopt / 一般化 / 簡素化）

- **Adopt（再利用）**: token transaction 消費パターン、`adminAction`/`authedAction`、`sendEmail`+`render*Email` DI、pg-error の `isUniqueViolation`（partial unique 違反検知に流用）。
- **Build（新設）**: `company_user_invitation` テーブル、`company.status` 列、`COMPANY_INACTIVE` コード、`renderCompanyInvitationEmail`、business 受諾ページ/route/action、`/no-company` ページ、会社ゲート共通ヘルパー、roleInOrg / companyStatus の共有 zod enum。
- **一般化**: business 各会社ゲートページの catch を `requireCompanyGate()`（apps/business/lib）に集約し重複を排除。
- **簡素化**: ステータス操作は個別アクションでなく `setCompanyStatus({companyId, status})` 1 本に集約し、許可遷移を内部検証（active→suspended/terminated、suspended→active/terminated、terminated は終端）。

## 4. リスク / 留意

- `is_active` の二重ソース化リスク → `status` を authoritative とし、status 系アクションで `is_active = (status==='active')` を同期。既存 `is_active` 読み手の status 移行を別タスクで実施し、最終的に `is_active` 廃止を将来 spec へ。
- 受諾者メールと招待メールの不一致 → token 横流し対策として `invitation.email === ctx.email`（小文字正規化）を受諾時に検証（`EMAIL_MISMATCH`）。
- クロスアプリ: 発行は admin、受諾は business。リンク base URL は `BUSINESS_BASE_URL`。env 未設定時は fail（本番必須）。
- 解約(terminated)後のデータ削除は本 spec 対象外。terminated を終端状態として保持し、将来の削除請求 spec が識別子に使う。

## 5. Revalidation Triggers

- `company.status` の意味/列挙値変更、`COMPANY_INACTIVE` コード追加 → `requireCompanyUser()` 消費側全ページ。
- `company_user_invitation` の契約変更 → admin 発行・business 受諾の双方。
- `is_active` 廃止 → 残存読み手すべて。
