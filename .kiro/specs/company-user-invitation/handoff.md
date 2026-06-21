# 引き継ぎ資料 — company-user-invitation

> 別セッション（会話コンテキストなし）でこの spec をゼロから引き継ぐための自己完結メモ。
> 作成日: 2026-06-21 / 起票元: business `/openings` 二段リダイレクト調査から派生。

## 0. これは何の spec か（1行）

企業ユーザー(`user_profile`)を会社(`company`)に紐付ける手段がコードに存在しないため、admin からの招待/紐付け・受諾での `company_id` 設定・business 側の「会社未所属」UX を新規実装する。

## 1. 発見の経緯（root cause、確証済み）

症状: business アプリで `/openings` を開くと `/interviews` にリダイレクトされる。

確証済みの連鎖:
```
/openings (Server Component)
  → requireCompanyUser() が user_profile.company_id 無し → AuthError('COMPANY_NOT_ASSOCIATED') を throw
  → openings/page.tsx の catch が redirect('/sign-in')   ← COMPANY_NOT_ASSOCIATED を UNAUTHORIZED と同列に扱っている
  → /sign-in がログイン済みを検知して redirect('/interviews')   ← sign-in/page.tsx:18
  ∴ 体感「/openings → /interviews」
```
`/interviews` は `requireUser()`（ログインのみ）なので通る。この非対称が症状の正体。

根本原因: **`user_profile.company_id` を書き込む経路がソース全体に存在しない**。
- サインアップフックは profile を `userId`+`displayName` だけで作成（`company_id` は NULL）。
- admin は会社作成とメンバー「表示」のみで、ユーザーを会社に紐付ける機能が無い。
- 結果、正規手段で会社所属を得られず、全企業ユーザーが会社ゲート付きページに入れない。

## 2. 関連コード（file:line、現状把握の出発点）

**認可ガード（packages/auth）**
- `packages/auth/src/guards.ts:57` `requireUser()` — ログインのみ。
- `packages/auth/src/guards.ts:157-195` `requireCompanyUser()` — `user_profile` を userId で引き `company_id` 取得、無ければ `throw new AuthError('COMPANY_NOT_ASSOCIATED')`。
- `packages/auth/src/errors.ts` — `AuthError` / `AuthErrorCode`（`COMPANY_NOT_ASSOCIATED` は定義済み）。
- `packages/auth/src/server.ts:162-177` — better-auth `databaseHooks.user.create.after` で `insert(userProfile).values({ userId, displayName })`（**company_id を設定していない**＝ここが起点の欠落）。

**スキーマ（packages/db）**
- `packages/db/src/schema/user-profile.ts:17` — `companyId: text('company_id').references(() => company.id)`（nullable）。他に `role_in_org` 等。
- `packages/db/src/schema/company.ts` — `company`（id 自動 / `name` 必須 / `is_active` 既定 true）。
- `packages/db/src/queries/admin/companies-query.ts:182` — `userProfile.companyId = companyId` で会社メンバー（面接官）を読み取り。

**admin（会社管理、現状）**
- `apps/admin/app/companies/_actions/create-company.ts` — `adminAction`、`insert(company)`（会社作成はある）。
- `apps/admin/app/companies/_actions/disable-company.ts` — 会社無効化。
- `apps/admin/app/companies/[id]/page.tsx:181` — 「面接官一覧」セクション（**表示のみ、追加/招待 UI なし**）。

**business（未所属 UX 対象）**
- `apps/business/app/(interviewer)/openings/page.tsx:49-59` — `requireCompanyUser()` → catch で `redirect('/sign-in')`（要 UX 改善）。
- 同様パターン: `openings/[openingId]/page.tsx`, `.../entries/page.tsx`, `.../entries/[entryId]/page.tsx`, `.../invitations/page.tsx`（いずれも会社ゲート）。
- `apps/business/app/(interviewer)/interviews/page.tsx:53-59` — `requireUser()` のみ（会社ゲートなし）。
- `apps/business/app/sign-in/page.tsx:18` — ログイン済みは `redirect('/interviews')`。
- `apps/business/proxy.ts` — Next.js 16 の middleware 相当。Cookie 存在チェックで `/sign-in` 送りのみ（`/interviews` には飛ばさない）。認可はここに依存しない方針（CVE-2025-29927）。

**参考実装（受諾フロー）— これを土台にする**
- `apps/candidate/app/invitations/[token]/confirm/page.tsx:72` — `companyId: company.id` を使う候補者側の招待トークン受諾フロー。token 検証 → 受諾でレコード作成、の型がそのまま流用候補。
- business 側の候補者招待発行: `apps/business/app/(interviewer)/openings/[openingId]/_actions/create-invitation.ts`（**これは「候補者を募集に招待」する別物**。企業ユーザー招待とは分離して設計すること）。

## 3. 要件（spec の出発点。詳細は /kiro-spec-requirements で EARS 化）

1. **管理機能（admin）**: 会社に企業ユーザーを招待、または既存ユーザーの会社への紐付け／解除。
2. **受諾フロー**: 招待受諾で `user_profile.company_id` を設定。
3. **未所属 UX（business）**: `COMPANY_NOT_ASSOCIATED` を `/sign-in` 送りにせず「会社未所属」を明示。

`requirements.md` に背景・境界・留意点を記載済み。

## 4. 設計時に決めるべき論点（未決・要判断）

- **招待テーブル: 新設 vs 既存 invitation 流用** — 既存 invitation は「候補者×募集」用途。企業ユーザー招待は別概念のため、`company_user_invitation`（token / email / company_id / role_in_org / expires_at / status / accepted_at 等）の新設が有力。既存 invitation スキーマを確認して判断する。
- **招待の宛先と本人特定** — メール宛に token 発行 → magic-link サインアップ（既存の sendMagicLink 基盤あり）→ 受諾で company_id 設定、という流れか。既存ユーザーをメールで直接 assign する経路も要件1に含む（招待 vs 直接紐付けの両対応か片方か）。
- **会社とユーザーの多重度** — 現状 `user_profile.company_id` は単一（1 user → 1 company）。1:1 維持が前提。複数会社所属は今回スコープ外とするか明記。
- **role_in_org の扱い** — 受諾/紐付け時に役割を設定するか。
- **未所属 UX の置き場** — 専用ページ（例: `/no-company`）か、business 共通レイアウトでの分岐か。`requireCompanyUser` の呼び出し側 catch を `COMPANY_NOT_ASSOCIATED` と `UNAUTHORIZED` で分岐させる。
- **admin の権限** — どの admin が、どの会社に、誰を招待/解除できるか（`adminAction` 前提）。
- **解除時の整合** — company_id を外したユーザーの既存データ（作成した opening 等）の扱い。

## 5. 制約 / 既存方針

- 認可は proxy/middleware に依存しない（CVE-2025-29927）。各 Server Component / Server Action / API Route で `requireUser()` / `requireCompanyUser()` / `adminAction` を独立に呼ぶ。
- 依存方向は `apps → packages` 単方向（`packages → apps` 禁止）。アプリ別ブランド/文面は app 側に持ち、package には factory/DI で渡す。
- 対象: `apps/business`, `apps/admin`, `packages/auth`, `packages/db`。
- 既存 spec との整合: `company-and-opening`（会社・募集の土台）, `authentication` / `candidate-auth-onboarding`（招待トークン受諾の既存実装）, `monorepo-app-split`（admin/business 分割）。

## 6. spec / 進行状態

- `.kiro/specs/company-user-invitation/spec.json` — phase: `initialized`（requirements 未生成）。
- `.kiro/specs/company-user-invitation/requirements.md` — Project Description まで記載済み、Requirements 本文は未生成。
- ⚠️ これらの spec ファイルは **main の作業ディレクトリに未コミット**。着手時に専用ブランチ（worktree 推奨）へ移すこと。

### 次のコマンド（Kiro ワークフロー）
```
/kiro-spec-requirements company-user-invitation
/kiro-validate-gap company-user-invitation        # 既存コードとの差分確認（任意・推奨）
/kiro-spec-design company-user-invitation
/kiro-validate-design company-user-invitation     # 任意
/kiro-spec-tasks company-user-invitation
/kiro-impl company-user-invitation                # 実装（タスク無指定=自律, 指定=手動）
```
※ business/admin 機能なので candidate 側 PR (#21, マージ済) とは別ブランチ・別 PR で進める。

## 7. ローカル環境の現状（重要）

- Docker Postgres: `postgres://bulr:dev_password@localhost:5434/bulr_dev`（起動中）。migration 適用済み + skill-survey seed 済み。
- **暫定回避を手動適用済み（コードではなく DB の状態）**:
  - 会社「ワンダーシステム」`ptXtpFA-h1idRFgbpMhDn`（ユーザーが admin で作成）。
  - 両テストユーザー（`tanno.t@wonderwalls.co.jp`, `nonnta21+bulr-dev-01@gmail.com`）の `user_profile.company_id` をこの会社に手動 UPDATE 済み → 現在は `/openings` が開ける。
  - これは**この機能が無いことの手動代替**。本 spec 実装後は正規フローで再現できるべき。
  - DB をリセット（`pnpm db:reset` = ボリューム破棄）すると会社/紐付けは消えるため、再度 admin で会社作成 + 手動 UPDATE、または本機能の実装が必要。
- drizzle-kit 系コマンドは `DIRECT_URL` と `DATABASE_URL` を両方 inline 指定するのが安全（env 解決のハマり回避）。

## 8. 検証観点（実装完了時）

- 新規企業ユーザーが正規フロー（招待→受諾、または admin 紐付け）で `company_id` を得て `/openings` が開ける。
- 未所属ユーザーは `/openings` 等で「会社未所属」が明示され、`/interviews` への混乱する二段リダイレクトが起きない。
- admin で紐付け/解除ができ、解除後はゲートが効く。
- 認可は各サーバ境界で独立に成立（middleware バイパスで通らない）。
