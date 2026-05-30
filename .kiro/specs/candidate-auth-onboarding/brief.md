# Brief: candidate-auth-onboarding

## Problem

Wave 1（monorepo-app-split / multi-app-deployment）で `apps/candidate`（bulr.net）のシェルとデプロイは整ったが、候補者がサインインしてプロフィールを持てる動線が無い。具体的には次の3点が欠けている。

1. 候補者向け Magic Link サインインのアプリ別オンボーディング動線（候補者用コピー・候補者用ランディング）
2. 候補者所有データの基点となる `candidate_profile` テーブル（Stage 1 の `candidate` テーブルは「面接官が手入力する受動的マスタ」で、候補者自身が所有・更新する想定ではない）
3. 招待リンク（invitation トークン）から候補者がサインインし、`candidate_profile` を初期化する受け取り動線

さらに、Wave 1 完了時点で `packages/auth` は singleton（`auth` を直接 export）で、Magic Link 送信テンプレートも 3 アプリ共有のため、candidate/business/admin いずれも同じ「bulr — AI 面接アシスタント」というビジネス向け文面が届く。候補者にこのコピーが届くと体験が破綻する（参照: `feedback_package_dependency_direction.md`）。

## Current State

- `apps/candidate`: ルーティング・layout・`sign-in/` 枠組みのみ。サインイン後に行く先（profile / onboarding）が無い
- `packages/auth`: singleton 構成。`packages/auth/src/email/templates/magic-link.ts` が business 文面で 3 アプリ共有
- `packages/db/src/schema/candidate.ts`: 既存 Stage 1 `candidate` テーブル（面接官が手入力する受動マスタ。`name` / `applied_role` / `background_summary` / `email`）
- 認証ガード `requireUser` / `requireAdmin` 等は `packages/auth/src/guards.ts` に存在し、business / admin で使われている
- `invitation` / `opening` / `entry` エンティティ自体は Wave 3 の `company-and-opening` / `entry-flow` の責務。本 spec は **招待リンクの受け取り口（トークンを query/path で受け、候補者をサインイン後にプロフィール初期化に誘導する seam）** のみを所有し、エンティティ実体は Wave 3 で具体化する

## Desired Outcome

- 候補者は `bulr.net/sign-in` で Magic Link サインインでき、**候補者向け文面**のメールが届く
- サインイン後、初回ユーザーは `bulr.net/onboarding` に誘導され、`candidate_profile` が初期化される（最小フィールド）
- 招待リンク `bulr.net/invitations/{token}` を踏むと、サインイン後に `candidate_profile` 初期化＋将来の `entry` 作成のためのトークンが受け渡される（実エンティティ作成は Wave 3）
- `packages/auth` は `createAuth({ sendMagicLink })` の factory に refactor 済み。各アプリは `lib/magic-link-template.ts` を自所有して `createAuth` に注入する
- business / admin の既存サインイン動線が回帰せず動く（factory 移行の後方互換）

## Approach

- **packages/auth refactor**: singleton `export const auth = betterAuth(...)` を `createAuth({ sendMagicLink, ...overrides })` factory に変更。各アプリの `lib/auth.ts` で `createAuth` を呼んでアプリ自分の `magic-link-template.ts` を注入。`@bulr/auth/server` の barrel は factory と既存 `requireUser` 等の guard をそのまま export
- **app 別テンプレート**: `apps/candidate/lib/magic-link-template.ts`（候補者文面）/ `apps/business/lib/magic-link-template.ts`（既存文面を移設）/ `apps/admin/lib/magic-link-template.ts`（運営文面）を新設
- **candidate_profile スキーマ**: `packages/db/src/schema/candidate-profile.ts` を新設。`user.id` への 1:1 FK、`display_name` / `headline` / `created_at` / `updated_at` の最小列。Stage 1 `candidate` テーブルは Wave 3 `session-from-entry` で `entry` へ移行するまで temporarily 残置（本 spec では触らない）
- **オンボーディング動線**: `apps/candidate/app/onboarding/page.tsx` を新設し、初回ユーザーの `candidate_profile` 作成を 1 ステップで完了する（display_name のみ必須）。`/sign-in` 後の middleware/guard が「`candidate_profile` 未作成なら onboarding に redirect」する
- **招待トークン受け取り**: `apps/candidate/app/invitations/[token]/page.tsx` を新設。サインイン未完了なら token を query で `/sign-in` に持ち回り、サインイン後に token を読んで pending state（cookie or server action）に保持。実 `entry` 作成は Wave 3
- **既存への影響最小**: business / admin の Better Auth 設定値（cookie / session 有効期間 / DB アダプタ）は factory 経由でも同等になるよう、現在 `server.ts` で持っている設定をそのまま `createAuth` のデフォルトに移す

## Scope

- **In**:
  - `packages/auth` factory refactor（`createAuth({ sendMagicLink })`）
  - 3 アプリ別 `lib/magic-link-template.ts`（candidate / business / admin）
  - `packages/db/src/schema/candidate-profile.ts` 新設 + drizzle migration
  - `apps/candidate/app/sign-in` の文言・コピー候補者向け化
  - `apps/candidate/app/onboarding/page.tsx` 新設（最小プロフィール作成）
  - `apps/candidate/app/invitations/[token]/page.tsx` 新設（トークン受け取り口 + pending state 保持）
  - `apps/candidate` 用認証ガード `requireCandidate`（`candidate_profile` 存在チェックを兼ねる）
  - business / admin 側の認証動線を新 factory ベースに移行（回帰なし）
- **Out**:
  - `invitation` / `opening` / `entry` エンティティ実体（Wave 3 `company-and-opening` / `entry-flow`）
  - 履歴書アップロード（Wave 2 `resume-registration`）
  - スキルアンケート（Wave 2 `skill-survey`）
  - 模擬面接（Wave 4 `mock-interview`）
  - Stage 1 `candidate` テーブルの削除（Wave 3 `session-from-entry` で移行）
  - SSO・クロスドメイン cookie 共有（設計メモ §7 で明示的に却下）
  - 候補者のロール権限（RBAC）/ 候補者向け管理 UI

## Boundary Candidates

- `packages/auth` factory refactor（3アプリ横断・基盤）
- アプリ別 magic-link template（各アプリの content / branding 所有）
- `candidate_profile` スキーマ追加（DB layer）
- 候補者サインイン動線（`apps/candidate/app/sign-in`）
- 候補者オンボーディング（`apps/candidate/app/onboarding`）
- 招待トークン受け取り口（`apps/candidate/app/invitations/[token]`）
- 候補者認証ガード（`requireCandidate`）

## Out of Boundary

- `invitation` トークンの**発行**と検証ロジック実装 → Wave 3 [[company-and-opening]]
- `entry` 作成 → Wave 3 [[entry-flow]]
- 履歴書 / スキルアンケート / 模擬面接 → 各 Wave 2/4 spec
- Stage 1 `candidate` テーブルとの統合・廃止 → Wave 3 [[session-from-entry]]
- 本格マルチテナント / RBAC（roadmap.md §Stage 2 制約で後回し）

## Upstream / Downstream

- **Upstream**:
  - Wave 1 `monorepo-app-split`（`apps/candidate` skeleton / `packages/auth` 切り出し済み）
  - Wave 1 `multi-app-deployment`（bulr.net ドメイン稼働）
  - Stage 1 `authentication` spec（既存 Better Auth Magic Link 設定値・`requireUser` / `requireAdmin` ガード）
- **Downstream**:
  - [[resume-registration]] — `requireCandidate` と `candidate_profile.id` を前提
  - [[skill-survey]] — `requireCandidate` と `candidate_profile.id` を前提
  - [[entry-flow]]（Wave 3）— `candidate_profile.id` × `opening.id` で `entry` を作成
  - [[mock-interview]]（Wave 4）— `candidate_profile.id` を起点に `mock_interview` を作成

## Existing Spec Touchpoints

- **Extends**: Stage 1 `authentication`（Better Auth 構成・ガード一式）。本 spec は `packages/auth` を factory に refactor するため、`authentication` の現状コードに直接手を入れる。後方互換は保つ
- **Adjacent**:
  - Wave 1 `monorepo-app-split`（`apps/*/lib/` の所有方針・パッケージ依存方向）
  - Wave 2 `resume-registration` / `skill-survey`（同じ `candidate_profile` を所有）
  - Stage 1 `assessment-engine`（Stage 1 `candidate` テーブルを参照）— 本 spec は触らないが、後の `session-from-entry` で再編される前提

## Constraints

- 既存 monorepo（Turborepo + pnpm）を継続。新規 package は作らない（factory も `packages/auth` 内で完結）
- 日本語 UI / 日本語メール（`packages/i18n` は作らない）
- Better Auth の管理する `user` / `session` / `account` / `verification` テーブルは構造変更しない
- `__Secure-` cookie プレフィックスの扱いは既存 middleware/proxy のロジックに合わせる（参照: `feedback_better_auth_secure_cookie_prefix.md`）
- Turborepo `build.env` への env 列挙が必須（参照: `feedback_turborepo_env_passthrough.md`）
- packages → apps の依存方向は単方向（参照: `feedback_package_dependency_direction.md`）
- 「将来像は見据えるが、実装は最小」原則（roadmap.md §Stage 2 制約）
