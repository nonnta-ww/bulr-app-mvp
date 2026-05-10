# 01. アーキテクチャ - MVP検証フェーズ (Stage 1)

> **このドキュメントの位置づけ**
> 3ヶ月のプロトタイプ検証フェーズ（Stage 1）における実装範囲を定義する。
> 長期構成（Stage 2以降）は別ドキュメント `01-architecture-full.md` を参照。
> Stage 1 のゴールは「対話型問診で実務判断力が見抜けるか」の検証であり、
> 本番品質のインフラを揃えることではない。

## Stage 1 の検証ゴール

**「バックエンドエンジニア向けの対話型問診を作り、ベトナム人50人 + 日本人20人に受けてもらい、問診結果と実際の実力（既知の評価）を比較して、相関があることを確認する」**

このゴールに不要なものは、Stage 1 では作らない。

## 全体構成

```
┌─────────────────────────────────────────────────────┐
│  受験者の Browser                                    │
│  - Next.js Frontend (React)                          │
│  - Vercel AI SDK (useChat hook)                      │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS / SSE Streaming
                   ▼
┌─────────────────────────────────────────────────────┐
│  apps/web (Vercel) - bulr.net (or 仮ドメイン)        │
│  - Next.js App Router                                │
│  - API Routes (/api/chat, /api/auth, /api/admin)     │
│  - 受験者向け UI (/assessments)                      │
│  - 創業者向け管理画面 (/admin) ※Basic 認証のみ       │
└────┬───────────────────┬────────────────────────────┘
     │                   │
     ▼                   ▼
┌─────────────┐   ┌─────────────────────────────────┐
│ Anthropic   │   │ Neon Postgres                   │
│ Claude API  │   │  (via Vercel Storage)           │
│ (Sonnet 4.6)│   │                                 │
└─────────────┘   └─────────────────────────────────┘

外部サービス (Stage 1 では最小):
  - Resend: マジックリンク配信のみ
```

**Stage 1 で導入しないもの**
- Cloudflare R2（画像ストレージ不要）
- PostHog（受験者数が少なすぎて分析不要）
- Sentry（手動でログ確認で十分）
- Helicone（LLMコストはダッシュボードで直接見る）
- BetterStack（プロトタイプに死活監視不要）

これらは Stage 2 で追加する。

## 技術スタック

### フロントエンド + バックエンド

| 層 | 技術 | 役割 |
|---|---|---|
| Framework | Next.js 16 (App Router) | フロント+API両対応 |
| UI | React 19 | UIライブラリ |
| Styling | Tailwind CSS 4 | ユーティリティCSS |
| UI Components | shadcn/ui ベース | 必要最小限のコンポーネント |
| AI Streaming | Vercel AI SDK 6 | useChat hook、streamText |
| LLM Client | Anthropic SDK | Claude API |
| Type Safety | TypeScript | 全層で使用 |
| Validation | Zod | スキーマ検証、Tool Use |

### データベース

| 層 | 技術 | 役割 |
|---|---|---|
| DB | Neon Postgres | サーバーレスPostgres |
| ORM | Drizzle ORM (0.45.x stable) | 型安全なクエリ |
| Migration | drizzle-kit | スキーマ管理 |

**Stage 1 で導入しないもの**：pgvector（セマンティック検索は Stage 2 で必要になったら追加）

### 認証

| 層 | 技術 | 役割 |
|---|---|---|
| Auth | Better Auth (1.6.x) | OSS認証ライブラリ |
| Method | Magic Link のみ | パスワードレス |
| Email | Resend | マジックリンク配信 |

**Stage 1 で導入しないもの**：Google OAuth、SSO、ワークスペース別認証。Stage 1 の認証要件は「受験者を識別する」だけなので、マジックリンクで十分。創業者の管理画面は Basic 認証（環境変数で管理者メールを許可リスト化）。

### 国際化

**Stage 1 では導入しない**。日本語のみで運用。ベトナム人受験者には英語または日本語で受けてもらう（要受験者ペルソナ確認）。i18n は Stage 2 で next-intl を導入。

### インフラ

| 層 | 技術 | 役割 |
|---|---|---|
| Hosting | Vercel (Hobby プラン) | フロント + API ホスティング |
| Domain | 仮ドメイン or bulr.net | プロトタイプ用 |

**Stage 1 では Vercel プロジェクトは1つ**。apps/web 内の `/admin` ルートで管理画面を提供する。Stage 2 で apps/admin を分離する。

### 監視・分析

**Stage 1 では Vercel の標準ダッシュボード + 手動ログ確認のみ**。受験者70人規模では本格的な監視は不要。重大な問題は手動で気づける範囲。

## モノレポ構成

### Stage 1 の最小モノレポ構造

```
bulr/
├── apps/
│   └── web/                        # 受験者向け + 管理画面（同一アプリ）
│       ├── app/
│       │   ├── (assessment)/       # 受験者向けルート
│       │   │   ├── assessments/
│       │   │   │   ├── start/      # 問診開始
│       │   │   │   └── [sessionId]/  # 進行中の問診
│       │   │   └── done/           # 完了画面
│       │   ├── admin/              # 管理画面（Basic 認証）
│       │   │   ├── sessions/       # 受験セッション一覧
│       │   │   ├── sessions/[id]/  # セッション詳細・回答確認
│       │   │   └── login/          # 管理者ログイン
│       │   ├── api/
│       │   │   ├── chat/           # 問診の対話 API
│       │   │   ├── auth/           # マジックリンク認証
│       │   │   ├── admin/          # 管理 API
│       │   │   └── sessions/       # セッション CRUD
│       │   ├── layout.tsx
│       │   └── page.tsx            # シンプルな受験開始ページ
│       ├── components/
│       ├── lib/
│       └── package.json
│
├── packages/
│   ├── db/                         # Drizzle schema + queries
│   ├── types/                      # 共通型定義
│   ├── lib/                        # 共通ユーティリティ
│   └── ai/                         # 問診プロンプト、ツール、評価ロジック
│
├── docs/
│   ├── specs/                      # 仕様ドキュメント
│   └── interview-patterns/         # 問診パターン集（重要）
│
├── scripts/                        # 開発スクリプト、データシード
│
├── .github/workflows/              # CI/CD（最小限）
│
├── package.json                    # ルート
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

### Stage 1 で作らないパッケージ

- **packages/auth** → 当面 apps/web 内に Better Auth 設定を直書き。Stage 2 で apps/admin と共有する時に切り出す。
- **packages/ui** → 当面 apps/web 内のコンポーネントで十分。再利用が出てから切り出す。
- **packages/i18n** → Stage 1 は日本語のみ。

### モノレポツール

- **Turborepo**: ビルドキャッシュ、タスク並列実行
- **pnpm workspaces**: パッケージ管理

## URL設計

### Stage 1（プロトタイプ）

```
受験者向け:
  /                              ランディング（ベータの説明）
  /assessments/start             問診開始（メール入力 → マジックリンク）
  /assessments/[sessionId]       進行中の問診（対話型 UI）
  /assessments/done              完了画面

管理画面（Basic 認証 + 許可メールチェック）:
  /admin/sessions                受験セッション一覧
  /admin/sessions/[id]           セッション詳細（回答全文 + 評価）
  /admin/login                   管理者ログイン

API:
  /api/chat                      問診の対話 API（SSE ストリーミング）
  /api/auth/*                    Better Auth エンドポイント
  /api/admin/*                   管理 API
  /api/sessions/*                セッション CRUD
```

### 開発・プレビュー

```
開発:
  http://localhost:3000          apps/web

ステージング:
  Vercel Preview URL（PR ごとに自動生成）
```

## AI 問診アーキテクチャ

### 設計原則

1. **対話型で深掘りする**
   - 4段階の深掘り構造（経験有無 → 真贋確認 → 判断力 → メタ認知）
   - LLM が文脈に応じて質問を生成

2. **構造化された問診パターンに基づく**
   - 創業者が設計した40-60の状況パターン
   - LLM はパターンを順次提示し、回答を引き出す

3. **回答は構造化保存**
   - 各パターンへの回答は別レコードとして保存
   - 後から手動評価とLLM評価の両方を実施

4. **ストリーミングで応答**
   - SSE で文字単位ストリーム
   - Vercel AI SDK でラップ

### 使用しないもの

- ❌ LangChain / LangGraph: Vercel AI SDK で十分
- ❌ MCP サーバー: 自社プロダクトには不要
- ❌ 独自ベクトルDB: Stage 1 では不要
- ❌ Redis キャッシュ: Stage 1 では不要

### LLMツール (Tools)

```typescript
const tools = {
  selectNextPattern,       // 次に質問する状況パターンを選択
  recordAnswer,            // 回答を構造化して保存
  evaluateAnswer,          // 回答の深さを評価（4段階のどこまで答えたか）
  generateFollowUp,        // 深掘り質問を生成
  finalizeSession,         // 問診完了処理
};
```

各ツールは Drizzle ORM で DB アクセスする。

### システムプロンプト構造

```
1. ロール定義（エンジニアの実務判断力を評価する面接官）
2. 問診の進め方（4段階の深掘り構造）
3. 評価軸の説明（広さ × 深さ × 意思決定の射程）
4. ツール使用ルール（必ずツール経由でDBに書く）
5. 受験者への態度（プレッシャーを与えず、経験を引き出す）
6. 出力スタイル（一度に一つの質問、自然な対話）
7. 受験者固有のコンテキスト（経験年数、選択した職種など）
```

### 問診のフロー

```
1. 受験開始
   - 経験年数、扱った言語、関わったシステム種別などをフォームで入力
   - assessment_session を作成

2. パターン選択
   - LLM が selectNextPattern ツールで次に聞くパターンを決定
   - 受験者の経験プロファイルに合わせて優先順位付け

3. 4段階の深掘り
   - 第1段：経験有無の確認
   - 第2段：症状や状況の具体化
   - 第3段：判断と選択肢
   - 第4段：メタ認知（別の選択肢、規模が違ったら）

4. 回答の評価
   - 各段階の回答を recordAnswer で保存
   - 各パターン終了時に evaluateAnswer で到達段階を記録

5. 次のパターンへ
   - 30〜40分または40-60パターンの一定割合をカバーで終了
   - finalizeSession で完了処理
```

### 会話メモリ管理

```
短期記憶（会話履歴）:
  - useChat hook の messages 配列
  - 直近20-30ターンを API に送る（深掘りの文脈を保つため）

長期記憶（構造化された回答）:
  - assessment_answer テーブルに各パターンの回答を保存
  - パターンごとに 4段階の到達度を記録
  - 後で創業者が手動評価する際の素材になる
```

## データモデル（Stage 1 最小構成）

```
user
  - id, email, name, created_at

assessment_session
  - id, user_id, status (in_progress / completed / abandoned)
  - role (backend のみ Stage 1)
  - profile_input (JSONB: 経験年数、扱った言語など)
  - started_at, completed_at

assessment_pattern
  - id, code, category, title, description
  - level_1_question, level_2_prompt, level_3_prompt, level_4_prompt
  - 創業者が手動でシードする40-60件

assessment_answer
  - id, session_id, pattern_id
  - level_reached (1-4)
  - level_1_answer, level_2_answer, level_3_answer, level_4_answer
  - llm_evaluation (JSONB: LLM による評価)
  - manual_evaluation (JSONB: 創業者の手動評価、後から付与)
  - created_at

chat_message
  - id, session_id, role (user / assistant), content
  - tool_calls (JSONB)
  - created_at
```

**Stage 1 で作らないテーブル**
- workspace（マルチテナント不要）
- workspace_user（マルチテナント不要）
- job（求人管理は Stage 2 以降）
- application（応募管理は Stage 2 以降）
- skill_heatmap（ヒートマップ可視化は Stage 2 以降）

## セキュリティ方針（最小限）

### 認証

- HttpOnly + Secure + SameSite=Lax cookies
- Magic Link は使い切り、有効期限15分
- 管理画面は Basic 認証 + 許可メールリスト（環境変数）

### データ

- 全 DB アクセスはサーバーサイドのみ
- 受験者データは user_id でスコープ
- 個人情報は最小化（メール、名前のみ）

### LLM

- システムプロンプトの保護（ユーザー入力でオーバーライド不可）
- レート制限（受験者: 1日1セッション、API: 1分20リクエスト）
- ツール呼び出し回数上限（maxSteps: 10）

### 通信

- HTTPS 強制（Vercel デフォルト）

## コスト試算（Stage 1）

```
Vercel Hobby:               $0
Neon Free:                  $0
Resend Free:                $0 (100通/日まで、十分)
Anthropic Claude API:       約 $50-150
  - 70セッション × 30-40分 × Claude Sonnet 4.6
Domain (bulr.net):          約 $1.5/月
─────────────────────────────────────
合計:                       約 $50-150/月
```

70セッション全期間で見ても、最大数百ドルで収まる。

## 環境変数（Stage 1）

```
# 共通
DATABASE_URL=                     # Neon Postgres
BETTER_AUTH_SECRET=               # Auth 暗号化キー
BETTER_AUTH_URL=                  # 認証コールバックURL
RESEND_API_KEY=                   # マジックリンク配信
NEXT_PUBLIC_APP_URL=              # アプリのベースURL

# LLM
ANTHROPIC_API_KEY=                # Claude API

# 管理画面
ADMIN_ALLOWED_EMAILS=             # 管理者メール許可リスト (CSV)
ADMIN_BASIC_AUTH_USER=            # Basic 認証ユーザー名
ADMIN_BASIC_AUTH_PASSWORD=        # Basic 認証パスワード
```

**Stage 2 で追加される環境変数**
- PostHog 関連
- Sentry 関連
- Helicone 関連
- Cloudflare R2 関連

## デプロイフロー（Stage 1）

```
1. ローカル開発
   $ pnpm dev (Turbo: web を起動)

2. Pull Request
   → Vercel が自動でプレビュー環境を作成
   → CI で型チェック・lint 実行（テストは Stage 1 では最小限）

3. main にマージ
   → 本番デプロイ自動実行
```

CI/CD は最小限。本格的なテスト整備は Stage 2 以降。

## 開発体験

### 推奨開発環境

- Node.js 22 LTS
- pnpm 10+
- VS Code (with extensions: ESLint, Prettier, Tailwind, Drizzle)
- Claude Code

### コーディング規約

- TypeScript strict mode
- ESLint + Prettier
- Conventional Commits (feat:, fix:, etc.)
- ファイル名は kebab-case
- コンポーネントは PascalCase
- 関数・変数は camelCase

## Stage 2 への移行計画（参考）

3ヶ月の検証で「いける」と判断したら、以下の順序で移行する。

### Stage 2 で追加するもの

1. **apps/admin の分離**
   - 管理画面を別 Next.js アプリに切り出し
   - admin.bulr.net サブドメインに切り替え
   - packages/auth に Better Auth 設定を切り出し

2. **packages/ui の切り出し**
   - 共通 UI コンポーネントを apps/web から抽出

3. **監視・分析の本格導入**
   - Sentry でエラー追跡
   - PostHog でユーザー行動分析
   - Helicone で LLM コスト監視

4. **Cloudflare R2**
   - 受験者のアップロード（CV、ポートフォリオなど）

5. **i18n 導入**
   - next-intl で日本語・英語対応

6. **マルチテナント機能**
   - ワークスペース、求人管理、応募管理
   - bz.bulr.net サブドメイン

7. **追加職種**
   - フロントエンド、SRE/インフラ、PdM

## 重要な原則

### Stage 1 でやらないことを明確に

- ❌ ヒートマップ可視化 UI
- ❌ 企業向けダッシュボード
- ❌ パーティ編成シミュレーション
- ❌ 課金システム
- ❌ 複数職種対応
- ❌ マネタイズ機能
- ❌ ブランディング・本格デザイン
- ❌ 企業ワークスペース機能
- ❌ 求人・応募管理

### Stage 1 で集中すること

- ✅ 対話型問診の対話品質
- ✅ 問診パターン40-60件の設計（Week 1-2）
- ✅ 4段階深掘りの LLM プロンプト
- ✅ 受験者が30-40分問診を完走できる UX
- ✅ 創業者が回答を確認・評価できる管理画面
- ✅ ベトナム人50人 + 日本人20人のデータ収集
- ✅ 問診結果と既知の実力評価の相関分析
