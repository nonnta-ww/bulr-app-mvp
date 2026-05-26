# Research / Gap Analysis — multi-app-deployment

> 2026-05-26 / multi-app-deployment spec の design 入り前の事前調査。`monorepo-app-split` 完了直後の状態を起点に、要件と既存資産の差分・実装オプション・research 必要項目をまとめる。

## 1. Current State Investigation

### 1.1 既に存在する deployment 関連資産

| 資産 | 状態 | 所感 |
|---|---|---|
| `apps/business/vercel.json` | ✅ 存在 (`crons: [{ path: "/api/cron/audio-purge", schedule: "0 18 * * *" }]`) | Root Directory = `apps/business` で読まれる。本 spec で **無変更**で再利用 |
| `apps/{candidate,admin}/vercel.json` | ❌ 不要 (Cron 等を持たない) | このまま不在で良い (Vercel 側が default 動作) |
| ルート `vercel.json` | ❌ 存在しない | Root Directory 方式採用なら不要 |
| `apps/*/next.config.ts` | ✅ 3 アプリ各々が `reactCompiler: true` + CSP ヘッダを持つ | `output: standalone` 等の最適化設定なし。Vercel デフォルトで OK |
| `turbo.json` | ✅ build cache が `.next/**`（`!.next/cache/**`）を出力扱い | Vercel が turbo を検出して並列ビルド可。dependsOn ^build で順序解決 |
| `pnpm-workspace.yaml` | ✅ `apps/*` + `packages/*` 標準構成 | Vercel built-in pnpm 検出が機能 |
| `tsconfig.base.json` | ✅ ES2022 / bundler moduleResolution | デプロイへの影響なし |
| `.gitignore` | ✅ `.vercel` / `.env*.local` 除外済み | `.vercelignore` は Root Directory 方式なら不要 |
| `.github/workflows/ci.yml` | ✅ pnpm typecheck / lint / audit を実行 (build は走らない) | Vercel の Production / Preview ビルドで build を担保 |
| `docs/setup/vercel.md` | ⚠️ 存在するが Stage 1 の `apps/web` 単一プロジェクト前提 | **3 アプリ対応に全面書き換え必要** |
| `docs/setup/{neon,resend,local}.md` 等 | ✅ 存在 | env-vars.md は新変数 (BUSINESS_BASE_URL 等) を追記する余地あり |

### 1.2 Better Auth / cross-app 関連の現状

| 観点 | 現状 | 本 spec での扱い |
|---|---|---|
| `BETTER_AUTH_URL` 読み込み | `packages/auth/src/server.ts` が起動時に env チェック (未定義なら throw) | このまま使う。各 Vercel プロジェクトで Production / Preview 両方に登録 |
| Better Auth baseURL 設定 | `baseURL: process.env.BETTER_AUTH_URL` 直接渡し | Preview で URL が変わるため、`?? \`https://${process.env.VERCEL_URL}\`` のフォールバックを追加するかは **design 判断** |
| `NEXT_PUBLIC_APP_URL` 使用箇所 | 各アプリの package.json start script で hardcoded（dev のみ）。runtime ではあまり読まれていない | Vercel では env 経由に統一 |
| `BUSINESS_BASE_URL` 読み込み | `apps/admin/app/_components/report-link.tsx` のみ。未設定時は相対 path にフォールバック | このまま動く。Production は固定値、Preview は **要 design** |
| Magic Link メール内 URL | Better Auth の `sendMagicLink` が baseURL を使って組み立て | request 時の host を解決する形なので、env が正しければそのまま動く |
| logout (Server Action) | `signOut()` で `@bulr/auth/client` 経由、cookie 削除 | デプロイ環境では cookie の Domain 属性が問題ないか **要 design** (現状 host-only 想定) |

### 1.3 既存 Vercel プロジェクト

ユーザー確認: **旧 `apps/web` 時代の単一プロジェクトは廃止 + 3 プロジェクト新規作成**。
旧プロジェクトに紐づいた Custom Domain / Vercel Blob ストア / Cron Job / 環境変数の控え取得は本 spec の手順に含める。

## 2. Requirement-to-Asset Map

| Req | 内容 | 既存 / 新規 / 要研究 |
|---|---|---|
| 1 | Vercel 3 プロジェクト構成 | **新規** (3 プロジェクト作成 + 旧削除)。Root Directory / Install / Build Command は **要 design**（具体的コマンド形） |
| 2 | 本番ドメイン割当と SSL | **新規** (Custom Domain 登録 3 件)。SSL は Vercel 自動発行 |
| 3 | DNS 設定（レジストラ側） | **新規** (A / CNAME / TXT)。レジストラ識別は未確定 (Cloudflare? GoDaddy?) — **要ユーザー確認 or design で flexible に** |
| 4 | 共有環境変数の 3 プロジェクト登録 | **新規** 作業だが、既存 `.env.example` が変数リストを保持 (Stage 1 multi-env-infrastructure)。**.env.example の 3 アプリ対応化は monorepo-app-split 完了済み** |
| 5 | プロジェクト別 env の least-privilege | **新規** (Vercel UI 作業)。一部 env (`BUSINESS_BASE_URL`) は monorepo-app-split で導入済み |
| 6 | Cron Job を business に限定 | ✅ **既存** (`apps/business/vercel.json`)。Vercel 側 dashboard 検証のみ追加 |
| 7 | 独立 Preview deploy | **新規 (Vercel 設定 + 動作確認)**。CI で `turbo-ignore` を入れるかは **design 判断** |
| 8 | Better Auth callback URL 整合 | **半既存** (`BETTER_AUTH_URL` env 読み込み構造は OK)。Preview 動的解決方式は **要 design** |
| 9 | 旧 Vercel プロジェクト廃止 | **新規** (環境変数 export → 新プロジェクトへ移植 → 旧削除)。Blob store re-link は **要 design** |
| 10 | Production デプロイ検証 | **新規** (運用検証スクリプト or 手動 checklist)。3 ドメインの HTTP 200 / Magic Link / cross-app link / Cron 表示 |

## 3. Implementation Approach Options

### Option A: Extend Existing Assets (拡張中心)

- 既存の `apps/business/vercel.json` をそのまま使う
- 既存 `docs/setup/vercel.md` を **全面書き換え** で 3 アプリ対応化
- 既存 `BUSINESS_BASE_URL` 機構をそのまま使う (Production は固定値、Preview は相対 fallback)
- Better Auth の baseURL は env 直接渡しを継続 (Preview は VERCEL_URL の手動注入で対応)
- 影響範囲: `docs/setup/*.md` の更新 + `packages/auth/src/server.ts` の baseURL 解決ロジックに **最小限の if 文**

**Trade-offs**:
- ✅ コード変更最小、既存パターンを尊重
- ✅ Magic Link の挙動を変えないので回帰リスク低
- ❌ Preview の cross-app link が Production に固定されて Preview 間遷移ができない
- ❌ Preview の Magic Link が `*.vercel.app` URL になり、運用上 confusing

### Option B: New Component (Cross-app URL helper を新設)

- `packages/lib` に `getAppUrl(targetApp, env): string` ヘルパーを追加し、Production / Preview 別に URL を生成
- Better Auth baseURL も env + VERCEL_URL からの組み立てを helper 経由に
- `apps/admin/app/_components/report-link.tsx` を helper 利用に書き換え
- 影響範囲: `packages/lib` に新 module、env 変数定義の追加 (`CANDIDATE_BASE_URL` / `BUSINESS_BASE_URL` / `ADMIN_BASE_URL` を一元管理)

**Trade-offs**:
- ✅ Cross-app URL のロジックが 1 箇所に集約され、後続 Wave 2-4 で再利用可能
- ✅ Preview deploy で各プロジェクトの URL を動的解決できる (e.g., `<project>-git-<branch>-<scope>.vercel.app` 規約構築)
- ❌ 「packages は app を知らない」原則 (memory `feedback-package-dependency-direction`) に抵触する可能性 — helper はアプリ名を enum で受けるため
- ❌ コード変更が増え、レビューと検証が必要

### Option C: Hybrid (推奨)

- **インフラ層 (Vercel dashboard / DNS / env)** は Option A — 既存設定を最大限活かす
- **app コード側** は Option A 起点 + 最小限の Preview 対応:
  - Better Auth の baseURL に `?? \`https://${process.env.VERCEL_URL}\`` フォールバックを追加 (1 行)
  - `BUSINESS_BASE_URL` は admin Production で固定値、Preview では未設定にして相対 path フォールバック (Preview で cross-app link は Production へ飛ぶ or 同 host へ飛んで 404 — 仕様として許容)
- `docs/setup/vercel.md` を 3 アプリ + 旧プロジェクト廃止手順に全面書き換え
- 検証は手動 checklist で要件 10 をカバー (自動化は spec 外)

**Trade-offs**:
- ✅ 既存パターンを尊重しつつ、Preview の Better Auth が壊れない
- ✅ Preview の cross-app link 仕様を「Production にフォールバック」と明示することで決定論を保つ
- ✅ Wave 2 以降で helper 化 (Option B) を検討する余地を残す
- ⚠️ Preview admin → Preview business の遷移を強制したい場合は Option B にアップグレード必要

## 4. Effort / Risk

| 評価軸 | レベル | 根拠 |
|---|---|---|
| Effort | **M (3-7 日)** | コード変更は最小だが、Vercel 3 プロジェクト作成 + DNS 設定 + 環境変数登録 + Preview 動作確認 + 旧プロジェクト廃止 + ドキュメント書き換え + 本番動作検証 で実時間がかかる。DNS 伝播待ちが律速。 |
| Risk | **Medium** | Vercel / DNS / SSL は well-known な手順だが、apex ドメイン (A record) は cert 発行ラグや Cloudflare proxy 設定で詰まる定番ポイント。Better Auth callback URL の Preview 整合は 1 つ漏れるとサインインが回らない (高インパクト)。Wave 2 移行を見据えると、Option C の妥協が後で技術負債化する可能性は middle weight。 |

## 5. Research Items for Design Phase

Design 入り前に固める必要がある項目:

### 5.1 Vercel 設定の具体形

- **Build Command**: `next build` (Vercel auto-detect with Root Directory) vs `cd ../.. && pnpm --filter @bulr/<app>... build` (Turborepo filter) — どちらを採用？
  - Vercel 推奨 (2026 公式): Root Directory + `turbo run build` (Turborepo がフィルタを自動付与)。`apps/*/package.json` の `build: "next build"` をそのまま呼ぶ
  - corepack / Install Command の明示は不要 (Vercel が pnpm-lock.yaml を検出)
- **Output Directory**: Next.js デフォルト (`.next`) で OK。明示不要
- **PORT 環境変数**: Vercel は内部で動的 PORT を割り当て、`next start -p <port>` を上書き。**現状の `next start -p 3021` のままで本番動作するか design で確認**
- **`turbo-ignore`** を Vercel の "Ignored Build Step" に設定するか (Preview ビルド時間 / コスト削減)

### 5.2 BETTER_AUTH_URL の Preview 動的解決

- パターン: `baseURL: process.env.BETTER_AUTH_URL ?? \`https://${process.env.VERCEL_URL}\``
- 注意: `VERCEL_URL` は protocol なしのため `https://` 必須
- Better Auth 1.6 (本リポは 1.6.x) で同等の dynamic baseURL があるか確認 (Better Auth 1.5+ で `baseURL` に `allowedHosts` パターンも使える)
- `BETTER_AUTH_SECRET` は 3 プロジェクト共通で問題なし

### 5.3 BUSINESS_BASE_URL の Preview 戦略

3 案:
- (a) **Preview では未設定** → 相対 path にフォールバック (admin Preview から開くと admin 自身に飛んで 404、cross-app 検証不可)
- (b) **Preview でも Production を指す** → admin Preview のレポートリンク = `https://bz.bulr.net/...` (機能上動くが、Preview で本番データに飛ぶ違和感)
- (c) **VERCEL_BRANCH_URL から business の Preview URL を組み立て** → `https://bulr-business-git-<branch>-<scope>.vercel.app/...` (要 helper、ブランチ名 sanitize 等の落とし穴)

design でユーザーの希望を確認して 1 つに決める。

### 5.4 DNS / レジストラ

- **bulr.net のレジストラ**を確認 (Cloudflare? GoDaddy? Namecheap?) — 設定手順が変わる
- Cloudflare 経由なら proxy off (gray cloud) 推奨、SSL/TLS は Full (strict)
- apex への A record: 現在は Vercel ダッシュボード上のプロジェクト固有 IP を確認 (古い汎用 `76.76.21.21` は当てにしない)
- 各サブドメインの CNAME: プロジェクト固有値が dashboard 表示 (e.g., `<hash>.vercel-dns-NNN.com`)

### 5.5 旧 Vercel プロジェクト廃止手順

- Vercel CLI `vercel env pull .env.backup` で全環境変数 export
- Vercel Blob store は Project 削除と独立 — 新 business プロジェクトに re-link (store settings → token コピー → business env に手動セット)
- Custom Domain は新プロジェクトに先に move (apex は cert 再発行に数分かかる)
- 旧プロジェクト削除前に Production 切替完了を確認 (rollback 経路を残す or 削除はあとで実施)

### 5.6 セキュリティ周辺の確認

- `BLOB_READ_WRITE_TOKEN` を business プロジェクトのみに置く構成は security.md の least-privilege と整合
- `CRON_SECRET` は business のみ — Vercel Cron が自動付与するため手動入力不要
- `ADMIN_ALLOWED_EMAILS` を admin のみに置くことで、business / candidate サイドから漏洩しない
- Cloudflare proxy on は **避ける** (Vercel 公式 KB が推奨せず)

## 6. Recommendations

### 6.1 Preferred Approach

**Option C (Hybrid)** を design の出発点に推奨。理由:
- 既存パターン (env 直接渡し、`BUSINESS_BASE_URL` の相対 fallback) を活かしてレビュー範囲を狭く保てる
- Better Auth の Preview 対応を 1 行追加で済ませられる (`?? https://${VERCEL_URL}`)
- 後で helper 化したくなったら Wave 2 の `candidate-auth-onboarding` で導入できる
- `packages/auth` factory 化 (Wave 2 予定) と合流させる選択肢を温存

### 6.2 Design 確定すべき主要判断

| 判断 | 推奨 (要 design 確定) |
|---|---|
| Build Command 形式 | Root Directory 方式 + Vercel auto-detect (`turbo run build` を Vercel が解決) |
| Better Auth Preview baseURL | env + VERCEL_URL の双線解決 (1 行追加) |
| BUSINESS_BASE_URL Preview | (b) Production 固定 → 簡潔、Preview の cross-app は production データに到達 |
| ドメイン apex 方式 | Vercel A record (registrar 側で apex に A、Vercel dashboard 表示の IP) |
| Cloudflare proxy | 使用していれば **off** (gray cloud) を design で明示 |
| 旧プロジェクト削除タイミング | 新 3 プロジェクト Production 動作確認後、最大 1 週間の rollback 猶予を置いてから削除 |
| docs 全面書き換え | `docs/setup/vercel.md` を本 spec タスクとして含める (Stage 1 の `apps/web` 記述を破棄) |

### 6.3 Carry-Forward Research Items (design 中に解決)

- bulr.net のレジストラ確認 + DNS 編集権限の確認 (ユーザーへ確認)
- Better Auth 1.6.x の dynamic baseURL API がそのままで Preview 動的解決を吸収できるか実装読み確認
- Vercel Blob store の current 状態 (旧プロジェクトに紐づいているか、新規作成か) 確認
- `turbo-ignore` を入れる場合の filter pattern 確認
- Cloudflare 経由なら proxy off + SSL/TLS Full (strict) 設定確認

### 6.4 デザインで触らない領域 (引き続き out of scope)

- Magic Link メールテンプレのアプリ別分離 (Wave 2 `candidate-auth-onboarding`)
- 監視・分析統合 (Sentry / PostHog / Helicone)
- Cron Job 内部実装 (本 spec はスケジュール定義のみ確認)
- DB スキーマ変更、テストフレームワーク導入

---

## 7. Resolved Decisions (2026-05-26, gap analysis 完了時にユーザー確定)

| 判断項目 | 確定内容 |
|---|---|
| レジストラ (DNS) | **Cloudflare** (proxy off / gray cloud、SSL/TLS は Full strict) |
| BUSINESS_BASE_URL Preview 戦略 | **(b) Production 固定** (`https://bz.bulr.net`)。Preview admin → Preview business の動的解決は本 spec で導入せず、Wave 2 で helper 化を検討する余地あり |

design phase ではこの 2 つを前提に DNS 手順 / 環境変数登録手順 / Preview 動作の項を確定させる。

> **次のステップ**: `/kiro-spec-design multi-app-deployment` に進む。
