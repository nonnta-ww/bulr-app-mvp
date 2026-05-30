# Brief: company-and-opening

## Problem

Wave 2 完了時点で候補者所有データ (candidate_profile + resume_document + skill_survey_response) は揃ったが、**企業側の主体エンティティ (company / opening / invitation) が存在しない**。これがないと:

1. `entry` を「どの募集に対するエントリーか」として作れない (Wave 3 `entry-flow` の前提)
2. 招待リンクを発行できない (candidate-auth-onboarding 7.1 は invitation トークンの**受け取り口**を実装済みだが、トークンを発行する側がない)
3. `apps/business` の現状ナビゲーション (`/interviews` のみ) が「直接面接セッションを作る」モデルのままで、Stage 2 の「募集 → 招待 → エントリー → 面接」モデルに移行できない

Stage 1 の `apps/business` (旧 apps/web) は「面接官がその場で候補者情報を手入力してセッションを作る」前提だった。Stage 2 は企業ユーザーが事前に「募集 (opening)」を作り、候補者を招待し、エントリーが集まってから面接に進むモデルへ移行する。本 spec はその基盤となる 3 エンティティ + 企業側 UI を整える。

## Current State

- `apps/business`: `/interviews`, `/interviews/new`, `/interviews/[sessionId]`, `/settings`, `/sign-in` のみ。`/openings` / `/invitations` ルートは未存在
- `packages/db`: `company` / `opening` / `invitation` テーブル未実装
- `user_profile` テーブル (Stage 1 authentication で作成): 企業ユーザー用プロフィール。`company` への FK はまだ無い
- candidate-auth-onboarding 7.1 が `apps/candidate/app/invitations/[token]/page.tsx` で **トークン受け取り口** を実装済み。`pending_invitation_token` cookie に保存して `/onboarding` または `/` に redirect する。トークン検証・entry 作成は本 spec + `entry-flow` の責務
- 招待制 MVP 方針 (設計メモ §2 案B): public な求人ボード化はせず、当面は招待リンク経由のエントリーに絞る

## Desired Outcome

- 企業ユーザーが `bz.bulr.net/openings` で募集 (opening) を新規作成・一覧・編集できる
- 各 opening から `bz.bulr.net/openings/{id}/invitations` で招待リンクを発行できる (トークン付き URL を生成して候補者へ共有可能)
- 招待リンクは `bulr.net/invitations/{token}` (candidate-auth-onboarding 7.1 が受け取る) へ繋がる
- `user_profile` に `company_id` FK が追加され、企業ユーザーは 1 社に所属する (RBAC は Wave 5+ で本格化、本 spec は最小)
- Wave 3 `entry-flow` から `opening.id` + `invitation.token` を参照できる seam が確立される

## Approach

- **company スキーマ** (`packages/db/src/schema/company.ts`): id (text nanoid PK) / name / created_at / updated_at の最小エンティティ。RBAC・複数ユーザー所属管理は本 spec では追加せず、`user_profile.company_id` で 1:N の所属関係のみ作る
- **opening スキーマ** (`packages/db/src/schema/opening.ts`): id / company_id FK / title / description (nullable) / status enum ('draft' | 'open' | 'closed') / created_at / updated_at。Stage 2 MVP では `status='open'` のみで運用、draft / closed は最小サポート
- **invitation スキーマ** (`packages/db/src/schema/invitation.ts`): id / opening_id FK / token (URL-safe random 32 bytes 程度、UNIQUE) / created_at / expires_at (nullable, MVP は無期限を許容) / consumed_at (nullable、Wave 3 entry-flow が `entry` 作成時に設定)
- **user_profile.company_id**: `user_profile` テーブルに `company_id text references company(id) nullable` を追加。既存の Stage 1 ユーザーは `company_id=NULL` のまま稼働 (segmentation 開始は本 spec 以降の新規企業から)
- **企業側 UI** (`apps/business/app/(interviewer)/openings/`):
  - `page.tsx`: 募集一覧 + 「+ 新規作成」リンク
  - `new/page.tsx` + `_actions/create-opening.ts`: 募集作成フォーム (title / description / status)
  - `[openingId]/page.tsx`: 募集詳細 (title / description / invitations 一覧 + 招待発行ボタン + entries 一覧プレースホルダ)
  - `[openingId]/_actions/create-invitation.ts`: 招待リンク発行 (token 生成 + DB INSERT + URL を画面に返す)
  - `[openingId]/invitations/page.tsx`: 招待リンク一覧 (token / 作成日時 / consumed 状態)
- **認証ガード**: `requireUser` + 内部で `user_profile.company_id` チェック (未所属ユーザーは「企業所属が必要」エラーで弾く)。Stage 1 の `requireAdmin` / `requireUser` パターンを踏襲、新規ガード `requireCompanyUser` を `packages/auth/src/guards.ts` に追加
- **token 生成**: `crypto.randomBytes(32).toString('base64url')` で URL-safe な 43 文字程度。candidate-auth-onboarding 7.1 の token regex `/^[A-Za-z0-9_-]+$/` と互換
- **invitation URL**: `${CANDIDATE_BASE_URL}/invitations/{token}` の形で UI に表示 (コピーボタン付き)。`CANDIDATE_BASE_URL` env を新規追加 (Vercel 上では `https://bulr.net`、dev では `http://localhost:3020`)

## Scope

- **In**:
  - `company` / `opening` / `invitation` Drizzle スキーマ + migration
  - `user_profile.company_id` 追加 + migration
  - `requireCompanyUser` ガード (`packages/auth`)
  - `apps/business/app/(interviewer)/openings/*` ルート群 (一覧 / 作成 / 詳細 / 招待発行 / 招待一覧)
  - opening / invitation 作成 Server Actions (authedAction + 所有権スコープ)
  - `CANDIDATE_BASE_URL` env 追加 + turbo.json build.env 追加
  - 招待リンク発行時の URL 表示 + クリップボードコピー UI
- **Out**:
  - 公開求人ボード化 (Wave 5+ で判断)
  - 複数ユーザー × 1 社の RBAC・権限階層 (Wave 5+)
  - `entry` の作成・候補者側エントリーフロー (Wave 3 [[entry-flow]])
  - invitation の使用済みマーキングロジック (Wave 3 [[entry-flow]] が `entry` 作成時に `consumed_at` を設定)
  - 招待リンクのメール送信機能 (UI 上で URL を表示するのみ、共有手段は企業側に委ねる)
  - 招待トークンの有効期限切れ判定 UI (MVP は expires_at=NULL 運用)
  - candidate 側エントリー一覧ページ (Wave 3 [[entry-flow]])
  - Stage 1 `interview_session` の `candidate_id → entry_id` 移行 (Wave 3 [[session-from-entry]])
  - 企業契約管理・課金 (Wave 5+)

## Boundary Candidates

- company / opening / invitation スキーマ (3 entities、DB layer)
- user_profile.company_id migration (既存テーブル拡張)
- requireCompanyUser ガード (packages/auth)
- 企業側 openings 一覧・作成・詳細 UI (apps/business)
- invitation 発行 Server Action + token 生成
- invitation URL 表示 + クリップボード UI

## Out of Boundary

- entry エンティティと作成フロー → Wave 3 [[entry-flow]]
- assessment-engine の entry 参照改修 → Wave 3 [[session-from-entry]]
- candidate 側エントリー一覧 → Wave 3 [[entry-flow]]
- L3 年収査定 (本 spec のスコアと無関係) / L4 模擬面接 → Wave 4
- 企業の有料機能 (席数課金 / スカウト課金) → 本格収益化フェーズ

## Upstream / Downstream

- **Upstream**:
  - Wave 1 `monorepo-app-split` (`apps/business` 稼働 + `packages/auth` factory)
  - Stage 1 `authentication` (`user_profile` テーブル + `requireUser`)
- **Downstream**:
  - [[entry-flow]] (Wave 3) — `opening.id` × `candidate_profile.id` で `entry` を作成、`invitation.consumed_at` を設定
  - [[session-from-entry]] (Wave 3) — `entry` 経由で `opening` 情報を引き継ぐ
  - Wave 4 [[admin-operations]] — 運営 admin が企業マスタを管理 (本 spec の `company` テーブルを参照)
  - 将来のスカウト機能 (Wave 5+) — opening の公開・検索基盤を拡張

## Existing Spec Touchpoints

- **Extends**:
  - Stage 1 `authentication` — `user_profile` に `company_id` カラム追加 + `requireCompanyUser` 新設
  - Wave 2 `candidate-auth-onboarding` — 7.1 の invitation 受け取り口 (`/invitations/[token]`) の発行側を本 spec が担う (token フォーマット regex `/^[A-Za-z0-9_-]+$/` 互換)
- **Adjacent**:
  - Stage 1 `assessment-engine` — `interview_session` は当面 `candidate_id` 参照のまま (移行は `session-from-entry`)
  - Wave 2 `resume-registration` / `skill-survey` — 本 spec は触らないが、Wave 3 `entry-flow` で両者と統合される

## Constraints

- 既存 monorepo + Drizzle Postgres を継続。新規 package は作らない
- 日本語 UI / 日本語フォームのみ
- 「将来像は見据えるが実装は最小」原則 (roadmap.md §Stage 2 制約)
- packages → apps の依存方向は単方向 (参照: `feedback_package_dependency_direction.md`)
- Turborepo `build.env` に `CANDIDATE_BASE_URL` 追加必須 (参照: `feedback_turborepo_env_passthrough.md`)
- Drizzle timestamp は `{ withTimezone: true }` で統一 (Wave 2 で確立した project convention)
- drizzle-kit push 時は `DIRECT_URL` + `DATABASE_URL` の inline 上書き必須 (参照: `feedback_drizzle_kit_env_resolution.md`)
- token のセキュリティ: 推測不可能な 256bit 以上のエントロピー (crypto.randomBytes 32 bytes)、UNIQUE 制約、URL-safe base64
- 招待リンクの取り扱い: 表示の都度 URL を再構築 (DB には token のみ保存、URL 全体は保存しない)
