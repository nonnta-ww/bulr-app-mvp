# Technology Stack

## アーキテクチャ概要

```
面接官の Browser
  - MediaRecorder API（音声録音）
  - 状態A（録音中）/ 状態B（3候補選択）
        │
        ▼
Next.js 16 App Router (apps/web)
  ├── /api/interview/turns/next        面接ターン処理
  ├── /api/interview/finalize          セッション終了
  ├── /api/cron/audio-purge            音声削除 Cron
        │
        ├── Anthropic Claude API (Sonnet 4.6)  ← LLM 分析・候補生成
        ├── OpenAI Whisper API                 ← 音声文字起こし
        ├── Vercel Blob                        ← 音声30日保存
        └── Neon Postgres (Drizzle ORM)        ← データ
```

Stage 1 はモノレポ（Turborepo + pnpm workspaces）に **apps/web 単一アプリ**。受験者向け UI ではなく **面接官向け UI**・管理画面・API Routes・LLM 関数を 1 つに同居させ、Vercel に単一プロジェクトでデプロイ。

外部サービスは最小:

| サービス             | 役割                                       | Stage 1 で必須か |
| -------------------- | ------------------------------------------ | ---------------- |
| Anthropic Claude API | LLM 分析・質問候補生成（Sonnet 4.6）       | 必須             |
| OpenAI Whisper API   | 音声文字起こし                             | 必須             |
| Vercel Blob          | 音声ファイル保存（30 日自動削除）          | 必須             |
| Neon Postgres        | サーバーレス DB（dev / prod ブランチ分離） | 必須             |
| Resend               | Magic Link 配信                            | 必須             |
| Vercel               | ホスティング + プレビュー環境 + Cron       | 必須             |

**Stage 2 で追加するもの**: Cloudflare R2（Vercel Blob から移行する場合）、PostHog、Sentry、Helicone、BetterStack、Deepgram（話者分離 API）。Stage 1 では Vercel 標準ダッシュボード + 手動ログ確認で十分。

## 技術スタック

### フロントエンド + バックエンド

| 層             | 技術                                                      |
| -------------- | --------------------------------------------------------- |
| Framework      | Next.js 16 (App Router、Turbopack stable、React Compiler) |
| UI             | React 19                                                  |
| Styling        | Tailwind CSS 4 + shadcn/ui ベース                         |
| AI 構造化出力  | Vercel AI SDK 6 (`generateObject`)                        |
| LLM Client     | Anthropic SDK (Claude Sonnet 4.6)                         |
| 音声文字起こし | OpenAI SDK (Whisper)                                      |
| 録音           | ブラウザ標準 MediaRecorder API                            |
| Type Safety    | TypeScript (strict mode、no `any`)                        |
| Validation     | Zod (スキーマ検証 + LLM 出力検証)                         |

**Stage 1 で使わないもの**: `useChat` / `streamText`（v1 用、v2 ではチャット UI を持たない）、Vercel AI SDK の Tool Use ループ（サーバー側オーケストレーションで決定論的に呼ぶ）

### データベース

| 層        | 技術                                                    |
| --------- | ------------------------------------------------------- |
| DB        | Neon Postgres (サーバーレス、dev / prod ブランチ)       |
| ORM       | Drizzle ORM 0.45.x stable                               |
| Migration | drizzle-kit (generate → push for dev、migrate for prod) |

**Stage 1 で導入しないもの**: pgvector（セマンティック検索は Stage 2 以降）

### ストレージ

| 層   | 技術                                                               |
| ---- | ------------------------------------------------------------------ |
| 音声 | Vercel Blob                                                        |
| 削除 | Vercel Cron（毎日 1 回、`audio_expires_at <= now()` の音声を削除） |

### 認証

| 層       | 技術                                                       |
| -------- | ---------------------------------------------------------- |
| Auth     | Better Auth 1.6.x                                          |
| 面接官   | Magic Link (パスワードレス、有効期限 15 分、使い切り)      |
| 管理画面 | `ADMIN_ALLOWED_EMAILS` 許可メール検査 (`requireAdmin()`)   |
| Email    | Resend                                                     |

**Stage 2 で追加**: Google OAuth、SSO、ワークスペース別認証

候補者は bulr に直接ログインしない。候補者情報は面接官が新規セッション作成時に入力。

### 国際化 (i18n)

**Stage 1 では導入しない**。日本語のみで運用。ベトナム人候補者の面接は、面接官が現地語または英語/日本語で実施し、Whisper の文字起こしも面接時の言語で保存される。LLM プロンプトは日本語ベース。

Stage 2 で next-intl 4 を導入。

### インフラ

| 層      | 技術                                             |
| ------- | ------------------------------------------------ |
| Hosting | Vercel (Hobby プラン、apps/web 単一プロジェクト) |
| Domain  | プロトタイプ用仮ドメイン or bulr.net             |
| Cron    | Vercel Cron (vercel.json で定義)                 |

Stage 2 で apps/admin を分離し `admin.bulr.net` サブドメインに切り替え。

### 監視・分析

**Stage 1 は Vercel 標準ダッシュボード + 手動ログ確認のみ**。受験者 70 人規模では本格的な監視は不要。LLM コストは Anthropic Console と OpenAI Console で直接確認。

Stage 2 で Sentry / PostHog / Helicone を本格導入。

## 面接アシスタント設計

### 設計原則

1. **面接官が主役、AI は黒子** — 面接官の発言を最小限に抑える支援ツール
2. **LLM にはツール経由でしか DB を引かせない** — ハルシネーション防止、サーバー側オーケストレーションで LLM を順次呼ぶ
3. **構造化出力（generateObject + Zod）中心** — LLM 出力は Zod スキーマで検証、DB 書き込み前に再検証
4. **状態A/B の 2 状態 UI** — 面接官の認知負荷を最小化
5. **フリー質問の許容** — 57 パターンに該当しない質問も `pattern_id=null` で記録、評価集約に含めず session_report に総評反映

### サーバー内部関数（決定論的、LLM 呼び出しなし）

| 関数                      | 役割                                            |
| ------------------------- | ----------------------------------------------- |
| `transcribeAudio(blob)`   | OpenAI Whisper API ラッパー                     |
| `uploadToBlob(blob, key)` | Vercel Blob アップロード、`audio_key` を返す    |
| `purgeExpiredAudio()`     | Vercel Cron から呼ばれる削除ジョブ（毎日 1 回） |

### LLM 関数一覧（generateObject + Zod 構造化出力）

```typescript
// packages/ai/src/functions/
const llm = {
  analyzeTurn, // このターンで観察できた 5 次元シグナル + 到達段階推定 + nearest_patterns
  splitInterviewerCandidate, // 「自分で次を聞く」用、文脈から質問+回答を分離
  proposeNextQuestions, // 3 候補生成（深掘り / メタ認知 / 次パターン）
  aggregatePatternCoverage, // パターン完了時、複数ターンを統合して 5 次元最終スコア + level_reached + stuck_type
  generateSessionReport, // 面接終了時、ヒートマップ JSON + サマリーテキスト生成
};
```

各関数は Zod スキーマで構造化出力を保証。LLM 出力は DB 書き込み前に再検証。

### 1 ターンの処理フロー（POST /api/interview/turns/next）

```
1. multipart/form-data で audio blob 受信
2. uploadToBlob(blob) → audio_key, audio_expires_at = now + 30days
3. transcribeAudio(blob) → transcript（生テキスト）
4. (manual ターンなら) splitInterviewerCandidate(transcript) → { interviewer_text, candidate_text }
5. analyzeTurn(transcript, current_pattern, history) → llm_analysis
   ├ pattern_match_confidence: exact / inferred_high / inferred_low / off_pattern
   └ off_pattern なら nearest_patterns + off_pattern_summary を含む
6. interview_turn を DB insert
7. パターン完了判定:
   - 完了 → aggregatePatternCoverage → pattern_coverage upsert
   - 継続 → なにもしない
8. proposeNextQuestions(session_state) → question_proposal を DB insert
9. レスポンス: { turn, coverage?, proposal }
```

### 4 段階深掘りの責務

| 段階    | 何を引き出すか                 | LLM の振る舞い                                   |
| ------- | ------------------------------ | ------------------------------------------------ |
| 第 1 段 | 経験有無 + 一文の状況描写      | yes/no と短い再現性確認                          |
| 第 2 段 | 真贋（時系列・固有性・関係者） | 「最初に何を見たか」「捨てた仮説」を時系列で確認 |
| 第 3 段 | 判断力（選択肢・トレードオフ） | 複数の代替案・判断軸・コスト評価を引き出す       |
| 第 4 段 | メタ認知 + AI 活用観点         | 「規模が違えば」「AI 前提なら」で再判断を問う    |

詳細は `assessment-design.md` と `evaluation-rubric.md` を参照。

### 会話メモリ管理

| 種別                             | 実装                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 短期記憶（直近ターンの文脈）     | DB から直近 5-10 ターンの transcript + llm_analysis を読み込み、proposeNextQuestions / analyzeTurn のプロンプトに注入 |
| 長期記憶（パターン別の到達状況） | pattern_coverage テーブルから現セッションの coverage を読み込み、「どのパターンが完了か / 未着手か」を LLM に伝える   |

### 使用しないもの

LangChain / LangGraph、MCP サーバー、独自ベクトル DB、Redis キャッシュ、`useChat` / `streamText`（v1 用、v2 では使わない）

## 認証設計

- Better Auth 管理テーブル (`user`, `session`, `account`, `verification`) には独自カラムを追加しない
- bulr 固有データ（面接官プロファイル等）は別テーブルで 1:1 参照
- HttpOnly + Secure + SameSite=Lax cookies、CSRF トークン
- Magic Link は使い切り、有効期限 15 分
- proxy.ts (Next.js 16 で middleware.ts から rename) だけに依存しない多層防御 (CVE-2025-29927 の教訓)
- 管理画面は `ADMIN_ALLOWED_EMAILS` 環境変数の許可リスト検査（Server Component の `requireAdmin()` で独立に判定）

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
OPENAI_API_KEY                # Whisper API

# ストレージ
BLOB_READ_WRITE_TOKEN         # Vercel Blob

# Cron
CRON_SECRET                   # Vercel Cron 認証用

# 管理画面
ADMIN_ALLOWED_EMAILS          # 管理者メール許可リスト (CSV)
```

**Stage 2 で追加される環境変数**: Cloudflare R2、PostHog、Sentry、Helicone、Deepgram 関連

## デプロイ構成

```
Vercel プロジェクト 1: bulr-web
  Root Directory: apps/web  →  bulr.net (Stage 1 は仮ドメイン)

vercel.json:
  - cron: /api/cron/audio-purge を毎日 03:00 JST に実行

PR 時に Vercel が自動でプレビュー環境を作成。
main マージで本番デプロイ自動実行。
```

Stage 2 で apps/admin を別プロジェクトに分離し、admin.bulr.net サブドメインに切り替え。

## コスト目安（Stage 1）

```
Vercel Hobby:               $0
Neon Free:                  $0
Resend Free:                $0 (100 通/日まで)
Vercel Blob:                $0 (1GB/月まで無料、Stage 1 規模なら無料枠内)
Anthropic Claude API:       $50-150 (70 セッション × 30-40 分 × 平均 12 ターン × Sonnet 4.6)
OpenAI Whisper API:         $20-50  (70 セッション × 平均 30 分音声 × $0.006/min)
Domain:                     ~$1.5/月
─────────────────────────────────────
合計:                       約 $70-200/月
```

70 セッション全期間で見ても、最大数百ドルで収まる。
