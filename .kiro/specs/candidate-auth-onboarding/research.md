# Research Log — candidate-auth-onboarding

## Discovery Summary

**Discovery Type**: Extension（既存システムへの追加）

本 spec は Wave 1 の `monorepo-app-split` と Stage 1 の `authentication` spec で確立された基盤を前提に、候補者向けの認証・オンボーディング動線を追加する。コードベース分析と既存設計ドキュメントのレビューを通じて以下の重要事項を確認した。

---

## Key Findings

### 1. packages/auth の現状（singleton 構成）

Wave 1 完了時点で `packages/auth/src/server.ts` は `export const auth = betterAuth(...)` という singleton。`sendMagicLink` 内に `packages/auth/src/email/templates/magic-link.ts` のテンプレートが直接参照されており、3 アプリが同一テンプレートを共有している。

**影響**: 候補者に「bulr — AI 面接アシスタント」という企業向けコピーが届く。factory 化が必須。

### 2. subpath exports の既存実装（Amendment 確認済み）

`monorepo-app-split/design.md` の Amendment により、`@bulr/auth/server`（server-only）と `@bulr/auth/client`（クライアント向け）の subpath exports が既に設計・実装済み。factory refactor はこの subpath exports 構造を維持しつつ、`server-entry.ts` から `auth` singleton の代わりに `createAuth` factory を export する形に変更する。

### 3. requireCandidate の実装位置

`packages/auth/src/guards.ts` に追加する。`candidate_profile` テーブルへのアクセスが必要なため `packages/db` への依存が発生するが、`packages/auth → packages/db` の依存方向は既存の drizzleAdapter 設定で既に確立されており、新たな循環参照リスクはない。

### 4. __Secure- cookie プレフィックス問題

`feedback_better_auth_secure_cookie_prefix.md` で記録済み。本番 HTTPS 環境では Better Auth が自動的に `__Secure-` プレフィックスを付与する。`proxy.ts` の cookie 存在チェックはプレフィックスあり/なしの両方にフォールバックする必要がある。

### 5. 招待トークン pending state の保持方法

Wave 3 の `company-and-opening` / `entry-flow` が実装される前の seam として、HttpOnly cookie に保存する方式を採用する。理由:
- サーバー側で生成・設定するため、クライアント JS からアクセス不能
- リダイレクトチェーン（sign-in → callback → onboarding/home）をまたいで値が保持される
- Wave 3 の entry-flow が Server Component / Server Action からこの cookie を読み取る

### 6. Turborepo build.env の必要性

`feedback_turborepo_env_passthrough.md` で記録済み。Vercel に登録した環境変数は `turbo.json` の `build.env` に列挙しないとビルド時に届かない。`NEXT_PUBLIC_APP_URL`（候補者アプリ用）は `NEXT_PUBLIC_*` であっても明示が必要。

---

## Architecture Decisions

### Decision 1: Factory vs Provider Pattern

**候補A**: `createAuth(config)` factory（採用）  
**候補B**: React Context / DI container を使う Provider Pattern  
**決定理由**: Next.js 16 App Router の Server Component 中心設計では Provider Pattern はクライアントバンドルへの影響が大きい。`createAuth` factory は server-only モジュールとして実装でき、3 アプリが独立した auth インスタンスを持つ既存設計（`monorepo-app-split/design.md` Key Decision §1）と整合する。

### Decision 2: テンプレートの所有権

**候補A**: `packages/auth` が複数テンプレートを map で管理（却下）  
**候補B**: 各アプリが `lib/magic-link-template.ts` を所有し `createAuth` に注入（採用）  
**決定理由**: `packages → apps` の単方向依存を守るには、アプリ固有のコンテンツを packages 層に持ち込めない（`feedback_package_dependency_direction.md`）。各アプリが自分のテンプレートを所有し factory に注入するパターンが最も整合性が高い。

### Decision 3: candidate_profile の ID 生成

Stage 1 の `user_profile` テーブルと同じパターンで `nanoid()` を使用。Better Auth の `user.id` も nanoid 形式のため整合性がある。

### Decision 4: 招待トークンの pending state 保存先

**候補A**: Server Session（Next.js `unstable_cache` や Iron Session 等）  
**候補B**: HttpOnly cookie（採用）  
**候補C**: DB に一時レコードとして保存（却下：Wave 3 前に `invitation` エンティティが存在しない）  
**決定理由**: 最小依存で実装可能。Iron Session 等の追加ライブラリ不要。リダイレクトチェーンを安全に越えられる。Wave 3 がこの cookie を読み取る際にサーバー側でアクセスできる。

---

## Risks & Mitigations

| リスク | 影響 | 対策 |
|------|------|------|
| factory 移行後の singleton import 見落とし | typecheck / build エラー | grep で `from '@bulr/auth/server'` の `auth` direct import を確認 |
| `__Secure-` プレフィックス対応漏れ | 本番でリダイレクトループ | proxy.ts の cookie チェックを両パターン対応にする |
| `RESEND_API_KEY` が候補者アプリに届かない | Magic Link 送信失敗 | turbo.json `build.env` に追加し、Vercel プロジェクトに env 登録 |
| pending invitation token cookie が長期間残留 | 意図しないエントリー作成（Wave 3 で発生） | `Max-Age: 3600`（1時間）を設定 |
| onboarding 画面のスキップ | candidate_profile なしで保護ルートにアクセス | `requireCandidate` を各 Server Component / Server Action で独立に呼ぶ多層防御 |
