# Research & Design Decisions — monorepo-app-split

## Summary

- **Feature**: `monorepo-app-split`
- **Discovery Scope**: Extension（既存 Stage 1 MVP の構造リファクタ。新規外部依存・新 API・新 DB スキーマなし）
- **Key Findings**:
  - Stage 1 の 7 spec は実装済み（`apps/web` 単一アプリ）。`apps/web/app/admin/` は `_components/_actions/_lib/` 構造が完備で、`apps/admin` への移設準備が既にできている（`admin-review-panel` R11 の布石）。
  - `apps/web/components/ui/` は**未作成**（shadcn/ui プリミティブが未インストール、`components.json` のみ存在）。`packages/ui` は「既存プリミティブの切り出し」ではなく「3アプリで使う最小プリミティブを新規導入」が実態。
  - 既存 `apps/web` の dev ポートは `:3020`（`package.json` の `next dev --turbopack -p 3020`）。設計メモの統一ポート計画（candidate `:3000` / business `:3001` / admin `:3002`）へ移行する。
  - `vercel.json`（Cron `audio-purge`）がリポジトリルートにある。Vercel 3プロジェクト化（`multi-app-deployment`）の前提として、本 spec で `apps/business/vercel.json` に移動する。

## Research Log

### 現行 `apps/web` の構造

- **Context**: 3アプリ分割における「何が動くか」「何が移設対象か」を確定する必要があった。
- **Sources Consulted**: `apps/web/` のディレクトリ・`package.json`・`vercel.json`・`tsconfig` の直接確認。
- **Findings**:
  - `app/(interviewer)/interviews/` 配下に面接実行系 33 ファイル（`_components/agenda/` 13、`_components/report/` 8 ほか）。
  - `app/admin/` は `_actions/`（1）、`_components/`（9）、`_lib/`（5）、`login/`、`sessions/`、`sessions/[id]/`、`sessions/[id]/export/` で完結。
  - `lib/auth/` に Better Auth の `server.ts` / `client.ts` / `schemas.ts`。
  - `lib/guards.ts`・`lib/safe-action.ts` は認証ヘルパー。
  - API: `/api/auth/[...all]`・`/api/interview/turns/next`・`/api/interview/proposal/regenerate`・`/api/interview/finalize`・`/api/cron/audio-purge`。
  - `components/` 直下は `app-shell/`（`app-shell.tsx` / `sidebar.tsx` / `user-menu.tsx`）のみ。`components/ui/` は存在しない。
- **Implications**:
  - `apps/admin` への admin/ 移設は private folder ごと丸ごと動かせる（R3.4）。
  - `packages/auth` には `lib/auth/{server,client,schemas}.ts` ＋ `lib/guards.ts` ＋ `lib/safe-action.ts` を集約する（R5.2 / R5.4）。
  - `app-shell/sidebar/user-menu` は business 専用（面接官 UI シェル）。3アプリ共有ではないので `packages/ui` に含めない（R6.7 「YAGNI」）。

### `packages/` の現状

- **Context**: 既存パッケージ参照が3アプリから通るかの確認、依存方向の把握。
- **Sources Consulted**: 各 `packages/*/package.json` の `name`・`exports`・`dependencies`。
- **Findings**:
  - `@bulr/db`（drizzle-orm / pg / nanoid、peer: `@bulr/types`）。`src/queries/admin/` に `sessionListQuery` / `sessionDetailQuery`、`src/queries/interview/` に 3 関数。
  - `@bulr/types`（純型のみ、依存なし）。
  - `@bulr/lib`（薄く `src/index.ts` のみ。実装は最小）。
  - `@bulr/ai`（`functions/` 5 関数、`lib/`、`whisper/` 4 プロバイダ実装、`prompts/`、`client.ts`）。
- **Implications**:
  - 既存 packages の公開 API は変更しない（R8.4）。
  - `packages/ai` は本 spec で再編しない（R8.5）。
  - 依存方向は維持: `apps/* → packages/{auth,ui,db,types,lib,ai}` ／ `packages/auth → packages/db` ／ `packages/db → packages/types`。

### モノレポ設定

- **Sources Consulted**: `pnpm-workspace.yaml`・`turbo.json`・`tsconfig.base.json`・ルート `package.json`。
- **Findings**:
  - `pnpm-workspace.yaml`: `packages: ['apps/*', 'packages/*']`（追加 packages を自動認識する）。
  - `turbo.json`: `build`（`dependsOn: ['^build']`）／`dev`（`cache: false`, `persistent: true`）／`typecheck`／`lint`。
  - `tsconfig.base.json`: `strict: true`、`noUncheckedIndexedAccess: true`、`target: ES2022`、`moduleResolution: bundler`。
  - ルート `package.json` scripts: `dev`・`build`・`typecheck`・`lint`・`db:up/down/reset`・`seed:patterns`。
- **Implications**:
  - `pnpm-workspace.yaml` の変更は不要（追加 packages は自動）。
  - `turbo.json` は dev タスクが既に persistent なので 3アプリの並列起動はそのまま機能する。
  - `tsconfig.base.json` の `paths` に `@bulr/auth`・`@bulr/ui` を追加。

### 環境変数とデプロイ

- **Findings**: `.env.example` に共有変数（DB / Auth / LLM / Whisper provider / Blob / Cron / Admin allowed emails）。`vercel.json` はルートで Cron 定義（`0 18 * * *`）。
- **Implications**:
  - `.env.example` をアプリ別 URL 変数（`NEXT_PUBLIC_APP_URL`・`BETTER_AUTH_URL`）の例示を含めて再構成（R9.1）。
  - `vercel.json` を `apps/business/vercel.json` に移動（次の `multi-app-deployment` で Vercel プロジェクトのスコープに沿う）。

### shadcn/ui の現状

- **Findings**: `apps/web/components.json` は存在するが、`components/ui/` 配下のプリミティブは未インストール。
- **Implications**: `packages/ui` は「既存切り出し」ではなく「**新規最小プリミティブ導入**」になる（R6.2 を実態に合わせる）。3アプリのサインインに必要な Button / Input / Label / Form / Card のみを `packages/ui/src/components/` に置き、Tailwind preset を共有する。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|--------------------|-------|
| **Turborepo + pnpm workspaces ＋ 3 Next.js apps**（採用） | 既存と同形の構成を3アプリに広げる。各アプリは独立、shared は `packages/*` | 既存ナレッジ・Vercel との親和性・Turbo キャッシュが効く・各アプリのデプロイが独立可能 | アプリ間の重複は packages 切り出しで吸収（YAGNI で運用） | 既存方針の自然な延長。`01-architecture-full.md` 青写真と一致 |
| Nx monorepo に切り替え | Nx 公式の multi-app | プラグイン・分析・キャッシュが豊富 | 既存 Turborepo からの移行コスト・学習コスト・Stage 1 で必要性なし | Stage 2 MVP では過剰 |
| 単一 Next.js アプリ＋ multi-zone | `apps/business` の中で zone を切る | アプリ数増を回避 | 認証・デプロイ・ドメインの分離が複雑、設計メモの3アプリ要件と乖離 | 採用条件外 |

## Design Decisions

### Decision: 各アプリは独立した Better Auth インスタンスを持ち、SSO 不要

- **Context**: 3アプリで認証をどう運用するか。
- **Alternatives Considered**:
  1. SSO（クロスドメイン cookie 共有 / Single Sign-On 機構）
  2. 各アプリで独立 Better Auth インスタンス＋共有設定（`packages/auth`）
- **Selected Approach**: 2 を採用。`packages/auth` が Better Auth 設定（schema・providers・guards・safe-action）を提供し、各アプリは自分の `/api/auth/[...all]` で独立に Better Auth を起動する。`user` テーブルは1つだけ DB に存在（共有）。
- **Rationale**: 候補者・面接官・運営は別人格。SSO の複雑度は不要。設計メモ セクション7 と整合。
- **Trade-offs**:
  - ◯ 単純・各アプリの cookie/セッションを完全分離・実装最小。
  - ✗ 同一人物が複数アプリで使うとき再サインインが必要（実用上ほぼ発生しない）。
- **Follow-up**: 各アプリの `BETTER_AUTH_URL`・`NEXT_PUBLIC_APP_URL` を env で独立指定可能にする。

### Decision: `apps/admin` の URL を flat 化（`/admin/` プレフィックスを持たない）

- **Context**: 現行 `/admin/sessions` を `apps/admin` に移すとき URL をどう設計するか。
- **Alternatives Considered**:
  1. `apps/admin/app/admin/sessions/...`（`/admin/sessions` URL 維持）
  2. `apps/admin/app/sessions/...`（flat、URL は `/sessions`）
- **Selected Approach**: 2 を採用。`admin.bulr.net` サブドメイン全体が admin スコープのため、URL に `/admin/` プレフィックスは冗長。
- **Rationale**: 設計メモ セクション5 と整合。サブドメインで分離した時点で URL からの曖昧さは消える。
- **Trade-offs**:
  - ◯ URL がシンプル・サブドメインと整合・将来 admin 機能拡張時のルート設計が素直。
  - ✗ 旧 `/admin/sessions/*` URL のブックマークは無効化される（Stage 1 ユーザは創業者のみのため影響軽微）。
- **Follow-up**: 既存ドキュメント・スクリプトに `/admin/` URL を埋め込んでいないか確認（Bash grep で確認可能）。

### Decision: `packages/ui` は最小プリミティブのみで開始

- **Context**: 既存 `apps/web/components/ui/` は未作成。`packages/ui` のスコープをどうするか。
- **Alternatives Considered**:
  1. shadcn/ui の主要プリミティブを最初から全部入れる
  2. 3アプリで本 spec のサインインに必要なものだけ（Button / Input / Label / Form / Card 程度）
- **Selected Approach**: 2 を採用。
- **Rationale**: YAGNI（R6.7）。`packages/ui` を肥大化させず、必要になった時点で各 Wave の spec で追加する。
- **Trade-offs**:
  - ◯ 初期コスト最小・package のメンテ範囲が小さい。
  - ✗ Wave 2 以降で必要なプリミティブ追加のたびに `packages/ui` を触る（許容コスト）。

### Decision: `vercel.json` を `apps/business/vercel.json` に移動

- **Context**: ルートの `vercel.json` は Cron `audio-purge` を定義。Vercel 3プロジェクト化（`multi-app-deployment`）でルート vercel.json はどのプロジェクトに属するか曖昧。
- **Selected Approach**: 本 spec で `apps/business/vercel.json` に物理移動。Cron `audio-purge` は面接音声に関するため business のプロジェクトに属する。
- **Rationale**: 次の `multi-app-deployment` spec が Vercel プロジェクトを apps/business に Root Directory 指定するとき、`apps/business/vercel.json` が自然に拾われる。
- **Trade-offs**: ◯ 次の spec の前提を本 spec で整える。✗ ルートの `vercel.json` 参照に依存するスクリプト等があれば修正必要（探索で確認）。

## Risks & Mitigations

- **import パス破壊** — `@/lib/auth/*` から `@bulr/auth` への切り替えで広範な置換が発生。`apps/business` の typecheck で網羅的に検出可能。タスクで「`@bulr/auth` への import 置換」を独立ステップにし、`pnpm typecheck` をフェーズゲートに使う。
- **Better Auth の baseURL ミスマッチ** — 各アプリで `BETTER_AUTH_URL` が異なるため、`packages/auth` の設定が env-driven であることが必須。`packages/auth/src/server.ts` で `process.env.BETTER_AUTH_URL` を読む構造にし、各アプリで適切に注入。dev では `:3001`/`:3002`/`:3000` 別々。
- **ポート競合** — `apps/web` の `:3020` を `:3001` に変更するため、ローカル開発フローでブックマーク・スクリプト等の確認が必要。`.env.example` のコメントと `apps/business/package.json` の dev script に明示。
- **shadcn primitive のクラス名衝突** — `packages/ui` と 3アプリの Tailwind config が同じ preset を共有することで一貫性を担保。各アプリの `tailwind.config.ts` が `packages/ui/tailwind-preset` を `presets: []` で extend する。
- **vercel.json の移動による Cron 失効** — ローカルでは影響なし。次の `multi-app-deployment` で Vercel プロジェクトを business に切り、`apps/business/vercel.json` が拾われることを確認するまでは本番 Cron に手をつけない（本 spec は構造変更のみで本番デプロイは触らない）。
- **`apps/web/components/app-shell/` の business 限定性** — 移設後 `apps/business/components/app-shell/` のまま継続。`apps/admin`・`apps/candidate` は独自シェル（最小）を持つ。

## References

- 詳細設計メモ: `docs/superpowers/specs/2026-05-23-bulr-candidate-business-split-design.md`
- Wave ロードマップ: `.kiro/steering/roadmap.md`
- Stage 1 関連 spec: `.kiro/specs/{monorepo-foundation, multi-env-infrastructure, authentication, admin-review-panel}/`
- Turborepo（multi-app）: 既存プロジェクトで稼働中のため公式ドキュメント参照は省略
- Better Auth multiple instances: 設計判断 1（独立インスタンス＋共有設定）
