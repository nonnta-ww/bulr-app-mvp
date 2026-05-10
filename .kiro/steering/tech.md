# Technology Stack

## アーキテクチャ概要

```
受験者の Browser
  └── Next.js 16 App Router (apps/web)
        ├── Anthropic Claude API (Sonnet 4.6)  ← AI 問診エンジン
        └── Neon Postgres (Drizzle ORM)        ← データ
```

Stage 1 はモノレポ（Turborepo + pnpm workspaces）に **apps/web 単一アプリ**。受験者向け UI・管理画面・API Routes・問診ロジックを 1 つに同居させ、Vercel に単一プロジェクトでデプロイ。

外部サービスは最小:

| サービス | 役割 | Stage 1 で必須か |
|---|---|---|
| Anthropic Claude API | AI 問診（Sonnet 4.6） | 必須 |
| Neon Postgres | サーバーレス DB（dev / prod ブランチ分離） | 必須 |
| Resend | Magic Link 配信 | 必須 |
| Vercel | ホスティング + プレビュー環境 | 必須 |

**Stage 2 で追加するもの**: Cloudflare R2、PostHog、Sentry、Helicone、BetterStack。Stage 1 では Vercel 標準ダッシュボード + 手動ログ確認で十分。

## 技術スタック

### フロントエンド + バックエンド

| 層 | 技術 |
|---|---|
| Framework | Next.js 16 (App Router、Turbopack stable、React Compiler) |
| UI | React 19 |
| Styling | Tailwind CSS 4 + shadcn/ui ベース |
| AI Streaming | Vercel AI SDK 6 (`useChat`, `streamText`, `ToolLoopAgent`) |
| LLM Client | Anthropic SDK (Claude Sonnet 4.6) |
| Type Safety | TypeScript (strict mode、no `any`) |
| Validation | Zod (スキーマ検証 + Tool Use 定義) |

### データベース

| 層 | 技術 |
|---|---|
| DB | Neon Postgres (サーバーレス、dev / prod ブランチ) |
| ORM | Drizzle ORM 0.45.x stable |
| Migration | drizzle-kit (generate → push for dev、migrate for prod) |

**Stage 1 で導入しないもの**: pgvector（セマンティック検索は Stage 2 以降）

### 認証

| 層 | 技術 |
|---|---|
| Auth | Better Auth 1.6.x |
| 受験者 | Magic Link (パスワードレス、有効期限 15 分、使い切り) |
| 管理画面 | Basic 認証 + `ADMIN_ALLOWED_EMAILS` 許可リスト |
| Email | Resend |

**Stage 2 で追加**: Google OAuth、SSO、ワークスペース別認証

### 国際化 (i18n)

**Stage 1 では導入しない**。日本語のみで運用。ベトナム人受験者には英語または日本語で受けてもらう前提。

Stage 2 で next-intl 4 を導入。

### インフラ

| 層 | 技術 |
|---|---|
| Hosting | Vercel (Hobby プラン、apps/web 単一プロジェクト) |
| Domain | プロトタイプ用仮ドメイン or bulr.net |

Stage 2 で apps/admin を分離し `admin.bulr.net` サブドメインに切り替え。

### 監視・分析

**Stage 1 は Vercel 標準ダッシュボード + 手動ログ確認のみ**。受験者 70 人規模では本格的な監視は不要。LLM コストは Anthropic Console で直接確認。

Stage 2 で Sentry / PostHog / Helicone を本格導入。

## AI 問診設計

### 設計原則

1. **LLM にはツール経由でしか DB を引かせない** — ハルシネーション防止、状況パターンの取得・回答の永続化を全てツール経由で
2. **SSE ストリーミング** — Vercel AI SDK が完全ラップ
3. **構造化された状況パターンに基づく** — LLM はパターンを順次提示し、4 段階深掘りで回答を引き出す
4. **回答は構造化保存** — 各パターンの回答は `assessment_answer` レコードとして保存。後で LLM 評価と手動評価の両方を実施

### LLM ツール一覧

```typescript
const tools = {
  selectNextPattern,    // 次に質問する状況パターンを選択（受験プロファイルに応じて優先順位付け）
  recordAnswer,         // 回答を構造化して保存（段階別）
  evaluateAnswer,       // 回答の到達段階・5 次元スコアを評価
  generateFollowUp,     // 詰まり判定 + 別パターンへの移行
  finalizeSession,      // 30〜40 分または規定パターン数到達で完了処理
};
```

各ツールは Drizzle ORM でサーバーサイドから DB アクセス。クロージャでセッション情報を束縛し、AI が他人のセッションを操作できない構造にする。

### 4 段階深掘りの責務

| 段階 | 何を引き出すか | LLM の振る舞い |
|---|---|---|
| 第 1 段 | 経験有無 + 一文の状況描写 | yes/no と短い再現性確認 |
| 第 2 段 | 真贋（時系列・固有性・関係者） | 「最初に何を見たか」「捨てた仮説」を時系列で確認 |
| 第 3 段 | 判断力（選択肢・トレードオフ） | 複数の代替案・判断軸・コスト評価を引き出す |
| 第 4 段 | メタ認知 + AI 活用観点 | 「規模が違えば」「AI 前提なら」で再判断を問う |

詳細は `assessment-design.md` と `evaluation-rubric.md` を参照。

### 会話メモリ管理

| 種別 | 実装 |
|---|---|
| 短期記憶 | `useChat` hook の messages 配列。直近 20-30 ターンを API に送信（深掘りの文脈を保つため） |
| 長期記憶 | `assessment_answer` テーブルに段階別回答を構造化保存 |

### 使用しないもの

LangChain / LangGraph、MCP サーバー、独自ベクトル DB、Redis キャッシュ。Stage 1 では Vercel AI SDK + 直接 Drizzle で完結。

## 認証設計

- Better Auth 管理テーブル (`user`, `session`, `account`, `verification`) には独自カラムを追加しない
- bulr 固有データ（受験プロファイル等）は別テーブルで 1:1 参照
- HttpOnly + Secure + SameSite=Lax cookies、CSRF トークン
- Magic Link は使い切り、有効期限 15 分
- proxy.ts (Next.js 16 で middleware.ts から rename) だけに依存しない多層防御 (CVE-2025-29927 の教訓)
- 管理画面は Basic 認証 + `ADMIN_ALLOWED_EMAILS` 環境変数の許可リスト二重チェック

詳細は `security.md` を参照。

## 開発標準

- TypeScript strict mode、no `any`
- ESLint + Prettier
- Conventional Commits (`feat:`, `fix:`, `chore:` 等)
- ファイル名 kebab-case、コンポーネント PascalCase、関数・変数 camelCase、DB テーブル/カラム snake_case
- Node.js 22 LTS or 24 LTS（Node.js 20 は 2026-04-30 で EOL）
- pnpm 10+

## 開発コマンド

```bash
pnpm dev                    # Turbo: web (3000) を起動
pnpm build                  # 全パッケージビルド
pnpm lint                   # ESLint
pnpm typecheck              # 型チェック
pnpm drizzle-kit generate   # DB migration ファイル生成
pnpm drizzle-kit push       # 開発 DB に反映（dev branch）
pnpm drizzle-kit migrate    # 本番 DB に履歴を残して反映
```

## 環境変数（Stage 1）

```
# 共通
DATABASE_URL                  # Neon Postgres（dev / prod 別ブランチ）
BETTER_AUTH_SECRET            # Auth 暗号化キー
BETTER_AUTH_URL               # 認証コールバック URL
RESEND_API_KEY                # Magic Link 配信
NEXT_PUBLIC_APP_URL           # アプリのベース URL

# LLM
ANTHROPIC_API_KEY             # Claude API

# 管理画面
ADMIN_ALLOWED_EMAILS          # 管理者メール許可リスト (CSV)
ADMIN_BASIC_AUTH_USER         # Basic 認証ユーザー名
ADMIN_BASIC_AUTH_PASSWORD     # Basic 認証パスワード
```

**Stage 2 で追加される環境変数**: Cloudflare R2、PostHog、Sentry、Helicone 関連

## デプロイ構成

```
Vercel プロジェクト 1: bulr-web
  Root Directory: apps/web  →  bulr.net (Stage 1 は仮ドメイン)

PR 時に Vercel が自動でプレビュー環境を作成。
main マージで本番デプロイ自動実行。
```

Stage 2 で apps/admin を別プロジェクトに分離し、admin.bulr.net サブドメインに切り替え。

## コスト目安（Stage 1）

```
Vercel Hobby:               $0
Neon Free:                  $0
Resend Free:                $0 (100 通/日まで)
Anthropic Claude API:       $50-150 (70 セッション × 30-40 分 × Sonnet 4.6)
Domain:                     ~$1.5/月
─────────────────────────────────────
合計:                       約 $50-150/月
```

70 セッション全期間で見ても、最大数百ドルで収まる。
