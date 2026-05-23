# Requirements Document — monorepo-app-split

## Project Description (Input)

`bulr-app-mvp` モノレポを単一アプリ構成（`apps/web`）から、候補者／企業／運営の3アプリ構成へ分割する Stage 2 再設計 Wave 1 の最初のスペック。

### スコープ（やること）

- `apps/web` → `apps/business` にリネーム（現行の面接官 UI ＋管理画面はそのまま動くこと）
- `apps/candidate` スケルトン作成（Next.js 16 ＋ Better Auth 配線 ＋ サインインページのみ、機能は後続 Wave）
- `apps/admin` シェル作成（Next.js 16 ＋ Better Auth ＋ `ADMIN_ALLOWED_EMAILS` ゲート配線）＋ 既存検証パネル（admin-review-panel の成果、現 `apps/web/admin/` 配下のルート群）を `apps/admin` へ移設
- `packages/auth` 切り出し（Better Auth 設定の単一の真実、3アプリ共有）
- `packages/ui` 切り出し（最初は最小：3アプリで共有される shadcn/ui プリミティブ等から）
- `pnpm-workspace.yaml` / `turbo.json` を3アプリ対応に更新
- `packages/db` / `packages/ai` / `packages/types` / `packages/lib` の参照経路が3アプリから通ること

### ゴール（Definition of Done）

- 3アプリ（candidate / business / admin）が `pnpm build` / `pnpm typecheck` / `pnpm lint` を通過する
- `apps/business` は現行 `apps/web` と機能等価（リネーム＋移設のみで挙動が変わらない）
- `apps/admin` で既存の検証パネル（セッション一覧・詳細・手動評価入力・LLM 評価突合・CSV/JSON エクスポート）が引き続き動作する
- `apps/candidate` はサインインページが表示でき、サインイン後に空のダッシュボード（プレースホルダ）に到達できる
- 既存の `apps/web` 配下のルート・API が新ロケーション（`apps/business` / `apps/admin`）で動作する（admin 配下の URL は flat 化されることに注意、Requirement 3 で明示）

### 非ゴール（本 spec の範囲外）

- Vercel 3プロジェクト化・ドメイン設定・Preview 自動デプロイ（次の `multi-app-deployment` spec で扱う）
- `apps/candidate` / `apps/admin` の機能実装（後続 Wave 2〜4）
- `packages/i18n` の追加（しない、日本語のみ継続）
- 新規 DB スキーマの追加（本 spec は構造変更のみ。新エンティティは Wave 2 以降）
- `packages/ai` への候補者向け関数セット（`mock/`）追加（Wave 4 `mock-interview` で行う）

### 依存・前提

- Stage 1 MVP（7 spec）実装済み
- Dependencies: なし（Stage 1 完了が前提）

### 参照

- 詳細設計メモ: `docs/superpowers/specs/2026-05-23-bulr-candidate-business-split-design.md`（特に セクション4 アプリ／ドメイン構成、セクション5 モノレポ構造、セクション7 認証）
- Wave 1 ロードマップ: `.kiro/steering/roadmap.md`
- 既存 admin-review-panel の成果物: `apps/web/admin/`、`packages/db/queries/admin/`

## Boundary Context

- **In scope（本 spec で扱う）**:
  - `apps/web` のリネーム、`apps/candidate` と `apps/admin` のシェル/スケルトン新規作成
  - `apps/web/admin/*` の `apps/admin/*` への移設
  - `packages/auth` と `packages/ui` の切り出し
  - `pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` の3アプリ対応化
  - 3アプリすべてで `pnpm build` / `pnpm typecheck` / `pnpm lint` の通過
  - 既存 admin 検証パネル機能の `apps/admin` での動作維持（URL は flat 化）
- **Out of scope（本 spec で扱わない）**:
  - Vercel 3プロジェクト化、本番ドメイン設定、Preview 自動デプロイ（`multi-app-deployment`）
  - `apps/candidate` の業務機能（履歴書・スキルアンケート・模擬面接・エントリー）— Wave 2〜4
  - `apps/admin` の運営拡張機能（企業管理・候補者管理・マスタ CMS・コスト監視）— `admin-operations`
  - `packages/i18n` の追加
  - 新規 DB スキーマ（`candidate_profile`・`opening`・`entry`・`mock_interview` 等）
  - `packages/ai` の候補者向け関数セット
- **Adjacent expectations（隣接スペックへの期待・前提）**:
  - Stage 1 の 7 spec（`monorepo-foundation` / `multi-env-infrastructure` / `authentication` / `assessment-pattern-seed` / `assessment-engine` / `interview-sse-progress` / `admin-review-panel`）の実装は本 spec で**無変更で継承**される。本 spec はリネーム・移設・パッケージ切り出しのみ。
  - `admin-review-panel` の Requirement 11（`_components/` `_actions/` `_lib/` 配下に閉じて配置）は本 spec の移設を意識した布石。本 spec はその布石を実体化する。
  - 次の `multi-app-deployment` spec は本 spec の完了（3アプリのビルド通過）を前提とする。
  - Wave 2 の `candidate-auth-onboarding` は本 spec が用意した `apps/candidate` シェル＋`packages/auth` を出発点にする。

## Requirements

### Requirement 1: 3アプリ構成への移行

**User Story:** 開発者として、モノレポが `apps/candidate`・`apps/business`・`apps/admin` の3アプリ構成になり、それぞれ独立して起動・ビルドできることで、ドメイン別の関心事をクリーンに分離したい。

#### Acceptance Criteria

1.1. システムは `apps/` 配下に `candidate/`・`business/`・`admin/` の3つのアプリディレクトリを持つ。
1.2. システムは `apps/web/` ディレクトリを持たない（`apps/business` にリネーム済み）。
1.3. システムは `pnpm-workspace.yaml` で3アプリを workspace として認識する。
1.4. システムは各アプリの `package.json` で workspace 名を `@bulr/candidate`・`@bulr/business`・`@bulr/admin` の命名規約で宣言する。
1.5. WHEN `pnpm --filter @bulr/{candidate|business|admin} dev` を実行 THEN システムは該当アプリのみを起動する。
1.6. システムは各アプリをローカルで異なるポートで起動する：`apps/candidate` は `:3000`、`apps/business` は `:3001`、`apps/admin` は `:3002`。
1.7. WHEN プロジェクトルートで `pnpm dev` を実行 THEN システムは3アプリの dev サーバを Turbo によって並列起動する。

### Requirement 2: apps/business の現行機能の維持

**User Story:** 開発者として、`apps/business` が現行 `apps/web` の面接官 UI と API を機能等価で継承し、リネームによる回帰がないことを保証したい。

#### Acceptance Criteria

2.1. システムは `apps/business` 配下に現行 `apps/web` の `(interviewer)/*` ルート群（面接セッション一覧・新規セッション作成・面接中 UI（状態A/B）・面接後レポート・サインイン）を保持する。
2.2. システムは `apps/business` 配下に現行 `apps/web` の `/api/interview/*`・`/api/auth/*`・`/api/cron/audio-purge` 等の API ルート群を保持する。
2.3. システムは `apps/business` の URL パス（`/interviews`・`/interviews/new`・`/interviews/[sessionId]`・`/interviews/[sessionId]/report`・`/sign-in`・`/api/*`）を現行 `apps/web` と同一に保つ。
2.4. システムは `apps/business` 配下に `/admin/*` ルートを**持たない**（`apps/admin` へ移設するため）。
2.5. WHEN 面接官が `apps/business` にサインインして既存セッションを開く THEN システムは現行 `apps/web` と同等の状態A/B UI と API 応答を返す。
2.6. システムは `apps/business` の build / typecheck / lint がパスする。
2.7. システムは `apps/business` 内の `import` パス（`@/...`・`@bulr/...`）がリネーム後も解決する。

### Requirement 3: apps/admin シェルと既存検証パネルの移設

**User Story:** 運営スタッフとして、admin 機能が `apps/admin` という独立アプリとして稼働し、既存の検証パネル（セッション一覧・詳細・手動評価入力・LLM 評価突合・CSV/JSON エクスポート）が以前と同じ操作感で使えることを保証したい。

#### Acceptance Criteria

3.1. システムは `apps/admin/` を Next.js 16（App Router）ベースのアプリとして配置する。
3.2. システムは `apps/admin` で Better Auth Magic Link によるサインインを提供する。
3.3. システムは `apps/admin` の全保護ルートで `ADMIN_ALLOWED_EMAILS` 許可メール検査（`requireAdmin()`）を継続する。
3.4. システムは現行 `apps/web/app/admin/sessions/*` および関連 `_components/`・`_actions/`・`_lib/` を `apps/admin` の対応位置（`apps/admin/app/sessions/*` 等）に移設する。
3.5. システムは移設後の `apps/admin` で次の機能が動作する：セッション一覧、フィルタ・ソート、セッション詳細、手動評価入力・保存、LLM vs 手動 並列表示と差分ハイライト、CSV/JSON エクスポート。
3.6. システムは移設にあたり、`packages/db/src/queries/admin/` 配下の集約クエリ（`sessionListQuery`・`sessionDetailQuery`）の import パスを `apps/admin` から解決する。
3.7. システムは `apps/admin` の URL を flat 化する：`/sessions`・`/sessions/[id]`・`/sessions/[id]/export`・`/sign-in`（`/admin/` プレフィックスは持たない。`admin.bulr.net` サブドメイン全体が admin スコープのため）。
3.8. システムは URL flat 化に伴い、現行 `apps/web` の `/admin/sessions/*` URL は本 spec 完了時点で `apps/admin` の `/sessions/*` に置き換わることを明示する（旧 URL は存続しない）。
3.9. WHEN 許可外メールユーザが `apps/admin` にアクセス THEN システムは現行どおりサインインまたは 403 ページへ誘導する。
3.10. システムは `apps/admin` の build / typecheck / lint がパスする。
3.11. システムは `apps/admin` に運営拡張機能（企業管理・候補者管理・マスタ CMS・コスト監視）を本 spec で実装しない（後続 `admin-operations` spec）。
3.12. WHEN 創業者が `apps/admin` にサインインして既存セッションの手動評価を行う THEN システムは現行 `apps/web/admin/*` で発揮していた同じ機能（フィルタ・ソート・保存・差分ハイライト・エクスポート）と同等の体験を提供する。

### Requirement 4: apps/candidate スケルトン作成

**User Story:** 開発者として、候補者向けアプリの最小骨格が `apps/candidate` として配置され、サインインと空のダッシュボードが動くことで、後続 Wave 2 の機能追加の土台にしたい。

#### Acceptance Criteria

4.1. システムは `apps/candidate/` を Next.js 16（App Router）ベースのアプリとして配置する。
4.2. システムは `apps/candidate` で Better Auth Magic Link によるサインインを提供する。
4.3. システムは `apps/candidate` のサインインページ（`/sign-in`）をブラウザで表示できる。
4.4. WHEN 候補者がサインインを完了 THEN システムは認証後のプレースホルダ画面（例：`/`）にリダイレクトし、認証済み状態を確認できる。
4.5. システムは `apps/candidate` に候補者向け機能（履歴書登録・スキルアンケート・自己診断・模擬面接・エントリー等）を本 spec で実装しない（後続 Wave 2〜4）。
4.6. システムは `apps/candidate` の build / typecheck / lint がパスする。
4.7. システムは `apps/candidate` でロール判定（`candidate_profile` 必須化等）を本 spec では行わない（Wave 2 `candidate-auth-onboarding` で導入。本 spec ではサインイン済みのユーザを受け入れるだけで足りる）。

### Requirement 5: packages/auth の切り出し

**User Story:** 開発者として、Better Auth 設定が `packages/auth` に集約され、3アプリすべてが同じ設定を共有しつつ、各アプリの認証ガードでドメインを分離できることを保証したい。

#### Acceptance Criteria

5.1. システムは `packages/auth/` パッケージを workspace に追加する（package.json の `name` は `@bulr/auth`）。
5.2. システムは現行 `apps/web/lib/auth/` の Better Auth 設定（auth インスタンス・サーバー側ヘルパー・クライアント側ヘルパー）を `packages/auth` に移し、3アプリから import 可能にする。
5.3. システムは `packages/auth` の Better Auth 設定で、Magic Link 配信（Resend 連携）・user テーブル運用を現行と同等の挙動で提供する。
5.4. システムは現行 `apps/web/lib/guards.ts` の `requireUser` / `requireAdmin` / `requireSessionOwnership` 等のガード関数を `packages/auth` に移管し、3アプリから import 可能にする。
5.5. システムは Better Auth が管理する `user` テーブルを1つに保ち、3アプリで共有する。
5.6. システムは `apps/business` が現行 `apps/web` と同じ認証フロー（面接官 Magic Link）で動作するよう `packages/auth` を経由して接続する。
5.7. システムは `apps/admin` が現行と同じ `ADMIN_ALLOWED_EMAILS` 検査を `packages/auth` の `requireAdmin()` 経由で実施する。
5.8. システムは `apps/candidate` が `packages/auth` の Magic Link を使ってサインインを成立させる（候補者ロール判定は本 spec のスコープ外、Requirement 4 参照）。
5.9. システムは各アプリの認証コールバック URL（dev・prod）を独立に設定可能にする（各アプリの env で `BETTER_AUTH_URL`・`NEXT_PUBLIC_APP_URL` 等を独立指定できる）。
5.10. システムは `packages/auth` が `packages/db`（Better Auth のテーブル定義の利用）に依存することを許容する。
5.11. システムは `packages/auth` の build / typecheck / lint がパスする。

### Requirement 6: packages/ui の切り出し

**User Story:** 開発者として、3アプリで共有される最小の UI プリミティブが `packages/ui` に切り出され、重複実装を避けたい。範囲は最小に留め、後続 Wave で必要に応じて拡張する。

#### Acceptance Criteria

6.1. システムは `packages/ui/` パッケージを workspace に追加する（package.json の `name` は `@bulr/ui`）。
6.2. システムは現行 `apps/web` の共通 UI プリミティブ（shadcn/ui ベースの Button・Input・Label・Form・Card 等のうち、3アプリで再利用される最小セット）を `packages/ui` に切り出す。
6.3. システムは `apps/business` が `packages/ui` から共通プリミティブを import して使い、`apps/business` 内に重複実装を持たない。
6.4. システムは `apps/candidate` と `apps/admin` のサインインページが `packages/ui` のプリミティブを使うことで実装の重複を避ける。
6.5. システムは Tailwind CSS の設定を3アプリで一貫させる（`packages/ui` のスタイルが各アプリで正しく適用される）。
6.6. システムは `packages/ui` の build / typecheck / lint がパスする。
6.7. システムは `packages/ui` の初期スコープを最小に保ち、3アプリでまだ共有されないコンポーネントは切り出さない（YAGNI）。

### Requirement 7: モノレポ設定の更新

**User Story:** 開発者として、`pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` が3アプリ＋拡張 packages 構成を正しく扱い、`pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint` がプロジェクトルートから3アプリすべてに対して実行できることを保証したい。

#### Acceptance Criteria

7.1. システムは `pnpm-workspace.yaml` で `apps/*` と `packages/*` を workspace 対象に含める（追加された `packages/auth` ・`packages/ui` も自動認識される）。
7.2. システムは `turbo.json` で3アプリの dev / build / lint / typecheck タスクを並列実行できる設定にする。
7.3. WHEN プロジェクトルートで `pnpm build` を実行 THEN システムは3アプリすべてと依存 packages をビルドし、すべて成功する。
7.4. WHEN プロジェクトルートで `pnpm typecheck` を実行 THEN システムは3アプリと全 packages の型チェックを行い、すべて成功する。
7.5. WHEN プロジェクトルートで `pnpm lint` を実行 THEN システムは3アプリと全 packages の lint を行い、すべて成功する。
7.6. システムは `tsconfig.base.json` のパスエイリアス（`@bulr/db`・`@bulr/auth`・`@bulr/ui`・`@bulr/types`・`@bulr/lib`・`@bulr/ai`）を3アプリから解決可能にする。
7.7. システムは Turbo の依存グラフで「`packages/*` のビルドが `apps/*` のビルドより先に走る」順序を担保する。

### Requirement 8: 既存 packages（db / ai / types / lib）の3アプリからの利用

**User Story:** 開発者として、既存 packages が3アプリすべてから import でき、リネーム・分割で参照が壊れないことを保証したい。

#### Acceptance Criteria

8.1. システムは `apps/business` が `@bulr/db`・`@bulr/ai`・`@bulr/types`・`@bulr/lib` を現行 `apps/web` と同様に import して使う。
8.2. システムは `apps/admin` が `@bulr/db`・`@bulr/types`・`@bulr/lib` を import して使う（admin の検証パネルは `packages/db/queries/admin` を経由）。
8.3. システムは `apps/candidate` が `@bulr/db`・`@bulr/types`・`@bulr/lib` を最小限 import できる状態にする（実機能の利用は Wave 2 以降）。
8.4. システムは既存 packages の公開 API を本 spec で変更しない（破壊的変更を避ける）。
8.5. システムは `packages/ai` を本 spec で再編しない（候補者向け関数セット `mock/` の追加は Wave 4 `mock-interview`）。

### Requirement 9: 環境変数の取り扱い

**User Story:** 開発者として、各アプリで必要な env が分離・整理され、ローカル開発で3アプリが起動できることを保証したい。Vercel デプロイ環境分離は次の spec で扱う。

#### Acceptance Criteria

9.1. システムはルートの `.env.example` を3アプリ対応に更新し、共有変数と各アプリ固有変数（`NEXT_PUBLIC_APP_URL`・`BETTER_AUTH_URL` 等）を分かるように整理する。
9.2. システムは各アプリで `NEXT_PUBLIC_APP_URL` 等のアプリ固有 URL 変数を独立に持てる構造にする。
9.3. システムは共有環境変数（`DATABASE_URL`・`BETTER_AUTH_SECRET`・`RESEND_API_KEY`・`ANTHROPIC_API_KEY`・`OPENAI_API_KEY`・`BLOB_READ_WRITE_TOKEN`・`CRON_SECRET`・`ADMIN_ALLOWED_EMAILS`）を3アプリすべてから読めるようにする。
9.4. システムはローカル開発で `.env.local` を3アプリすべてが参照できる構成にする。
9.5. システムは Vercel プロジェクト分離・本番ドメイン設定・preview 自動デプロイを本 spec のスコープ外とする（次 spec `multi-app-deployment`）。

### Requirement 10: スコープ外と非ゴールの明示

**User Story:** 開発者として、本 spec のスコープを明確にし、Wave 2 以降の機能・別 spec で扱う事項に手を出さないことを保証したい。

#### Acceptance Criteria

10.1. システムは本 spec で `apps/candidate` に履歴書登録・スキルアンケート・自己診断・模擬面接・エントリー等の機能を実装しない。
10.2. システムは本 spec で `apps/admin` に企業管理・候補者管理・マスタ CMS・コスト監視等の運営拡張機能を実装しない。
10.3. システムは本 spec で `packages/i18n` を追加しない（日本語のみ継続）。
10.4. システムは本 spec で新規 DB スキーマ（`candidate_profile`・`resume_document`・`skill_survey`・`opening`・`entry`・`company`・`mock_interview` 等）を追加しない。
10.5. システムは本 spec で Vercel プロジェクト分離・ドメイン設定・preview デプロイを扱わない（`multi-app-deployment`）。
10.6. システムは本 spec で既存実装の挙動を変更しない（リネーム・移設・切り出しによる構造変更のみ）。

### Requirement 11: smoke test での完了確認

**User Story:** 開発者として、Stage 1 の方針に沿った手動 smoke test で完了確認を行いたい（自動テストは Stage 1 と同様に導入しない）。

#### Acceptance Criteria

11.1. システムは Stage 1 と同様に Playwright / Vitest 等の自動テストフレームワークを本 spec で新規導入しない。
11.2. 完了確認は以下の手動 smoke test を実施する:

- `pnpm install` がクリーンな状態（`node_modules` 削除後）から成功する
- `pnpm build` が3アプリすべてで成功する
- `pnpm typecheck` が全 workspace で成功する
- `pnpm lint` が全 workspace で成功する
- 3アプリそれぞれ `pnpm --filter @bulr/{candidate|business|admin} dev` で起動でき、対応ポート（`:3000` / `:3001` / `:3002`）でブラウザアクセスできる
- `apps/business`: 既存の面接官サインイン → セッション一覧 → 新規セッション作成 → 面接中 UI（状態A/B）→ 面接後レポートの一連が現行と同じく動作する
- `apps/admin`: 許可メールでサインイン → セッション一覧（`/sessions`）→ セッション詳細（`/sessions/[id]`）→ 手動評価入力・保存 → LLM vs 手動 並列表示 → CSV/JSON エクスポート（`/sessions/[id]/export?format=csv|json`）の一連が現行と同じく動作する
- `apps/candidate`: サインインページ表示 → Magic Link でサインイン → 認証後のプレースホルダ画面に到達
