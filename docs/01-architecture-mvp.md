# 01. アーキテクチャ - MVP検証フェーズ (Stage 1)

> **このドキュメントの位置づけ**
> 3ヶ月のプロトタイプ検証フェーズ（Stage 1）における実装範囲を定義する。
> 長期構成（Stage 2以降）は別ドキュメント `01-architecture-full.md` を参照。
> Stage 1 のゴールは「**面接アシスタント型で実務判断力が見抜けるか**」の検証であり、
> 本番品質のインフラを揃えることではない。
>
> **関連ドキュメント**
>
> - 戦略・コンセプト全体：`bulr-handoff.md`
> - プロダクト体験詳細：`bulr-product-direction.md`
> - 状況パターン定義：`02-questionnaire-patterns.md`
> - 4 段階深掘り設計：`03-probe-logic.md`

## Stage 1 の検証ゴール

**「バックエンドエンジニア向けの面接アシスタントを作り、創業者および協力面接官5-10人が、ベトナム人20-30人 + 日本人10-20人の面接で実際に使い、問診パターンに基づく面接結果と、面接官の独自判断との一致度を確認する」**

このゴールに不要なものは、Stage 1 では作らない。

## 全体構成

```
┌─────────────────────────────────────────────────────┐
│  面接官の Browser                                    │
│  - Next.js Frontend (React)                          │
│  - MediaRecorder API（音声録音）                     │
│  - 状態A（録音中）/ 状態B（3候補選択）               │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────────┐
│  apps/web (Vercel) - bulr.net (or 仮ドメイン)        │
│  - Next.js App Router                                │
│  - API Routes:                                       │
│    /api/interview/turns/next   面接ターン処理        │
│    /api/interview/finalize     セッション終了        │
│    /api/auth/*                 Better Auth           │
│  - 面接官向け UI (/interviews)                       │
│  - 創業者向け管理画面 (/admin) ※ADMIN_ALLOWED_EMAILS 検査 │
└────┬───────────────┬───────────────┬────────────────┘
     │               │               │
     ▼               ▼               ▼
┌──────────┐  ┌──────────┐  ┌──────────────────────┐
│ Anthropic│  │ OpenAI   │  │ Neon Postgres        │
│ Claude   │  │ Whisper  │  │  (via Vercel Storage)│
│ Sonnet   │  │ API      │  └──────────────────────┘
│ 4.6      │  └──────────┘
└──────────┘
                              ┌──────────────────────┐
                              │ Vercel Blob          │
                              │ 音声30日保存         │
                              │ + Vercel Cron 削除   │
                              └──────────────────────┘

外部サービス (Stage 1 では最小):
  - Resend: マジックリンク配信のみ（面接官向け）
```

**Stage 1 で導入しないもの**

- Cloudflare R2（Vercel Blob で十分）
- PostHog（受験者数が少なすぎて分析不要）
- Sentry（手動でログ確認で十分）
- Helicone（LLMコストはダッシュボードで直接見る）
- BetterStack（プロトタイプに死活監視不要）
- リアルタイム文字起こし、話者分離 API、先読み質問生成

これらは Stage 2 で追加する。

## 技術スタック

### フロントエンド + バックエンド

| 層             | 技術                               | 役割                        |
| -------------- | ---------------------------------- | --------------------------- |
| Framework      | Next.js 16 (App Router)            | フロント+API両対応          |
| UI             | React 19                           | UIライブラリ                |
| Styling        | Tailwind CSS 4                     | ユーティリティCSS           |
| UI Components  | shadcn/ui ベース                   | 必要最小限のコンポーネント  |
| AI 構造化出力  | Vercel AI SDK 6 (`generateObject`) | Zod スキーマ準拠の LLM 出力 |
| LLM Client     | Anthropic SDK                      | Claude Sonnet 4.6           |
| 音声文字起こし | OpenAI SDK                         | Whisper API ラッパー        |
| 録音           | ブラウザ標準 MediaRecorder API     | 音声キャプチャ              |
| Type Safety    | TypeScript                         | 全層で使用                  |
| Validation     | Zod                                | スキーマ検証、LLM 出力検証  |

**Stage 1 で使わないもの**：`useChat` / `streamText`（v1 はチャット UI 前提だったが v2 は使わない）、Tool Use ループ（サーバー側オーケストレーションで決定論的に呼ぶ）

### データベース

| 層        | 技術                        | 役割                 |
| --------- | --------------------------- | -------------------- |
| DB        | Neon Postgres               | サーバーレスPostgres |
| ORM       | Drizzle ORM (0.45.x stable) | 型安全なクエリ       |
| Migration | drizzle-kit                 | スキーマ管理         |

**Stage 1 で導入しないもの**：pgvector（セマンティック検索は Stage 2 で必要になったら追加）

### ストレージ

| 層   | 技術        | 役割                                         |
| ---- | ----------- | -------------------------------------------- |
| 音声 | Vercel Blob | 面接音声を30日保存                           |
| 削除 | Vercel Cron | 毎日 1 回、`audio_expires_at` 経過音声を削除 |

### 認証

| 層       | 技術                              | 役割                         |
| -------- | --------------------------------- | ---------------------------- |
| Auth     | Better Auth (1.6.x)               | OSS認証ライブラリ            |
| Method   | Magic Link のみ                   | パスワードレス（面接官向け） |
| Email    | Resend                            | マジックリンク配信           |
| 管理画面 | ADMIN_ALLOWED_EMAILS              | 許可メール検査（`requireAdmin()`） |

**Stage 1 で導入しないもの**：Google OAuth、SSO、ワークスペース別認証。Stage 1 の認証要件は「面接官を識別する」だけなので、マジックリンクで十分。創業者の管理画面は `ADMIN_ALLOWED_EMAILS` 許可メールリスト検査のみ。

候補者は bulr に直接ログインしない（v2 哲学）。候補者情報は面接官が新規セッション作成時に入力。

### 国際化

**Stage 1 では導入しない**。日本語のみで運用。ベトナム人候補者の面接は、面接官が現地語または英語/日本語で実施し、Whisper の文字起こしも面接時の言語で保存される。LLM プロンプトは日本語ベース。i18n は Stage 2 で next-intl を導入。

### インフラ

| 層      | 技術                   | 役割                        |
| ------- | ---------------------- | --------------------------- |
| Hosting | Vercel (Hobby プラン)  | フロント + API ホスティング |
| Domain  | 仮ドメイン or bulr.net | プロトタイプ用              |
| Cron    | Vercel Cron            | 音声削除ジョブ              |

**Stage 1 では Vercel プロジェクトは1つ**。apps/web 内の `/admin` ルートで管理画面を提供する。Stage 2 で apps/admin を分離する。

### 監視・分析

**Stage 1 では Vercel の標準ダッシュボード + 手動ログ確認のみ**。受験者70人規模では本格的な監視は不要。重大な問題は手動で気づける範囲。

## モノレポ構成

### Stage 1 の最小モノレポ構造

```
bulr/
├── apps/
│   └── web/                        # 面接官向け + 管理画面（同一アプリ）
│       ├── app/
│       │   ├── (interviewer)/      # 面接官向けルート
│       │   │   ├── interviews/
│       │   │   │   ├── page.tsx          # セッション一覧
│       │   │   │   ├── new/              # 新規セッション作成（候補者情報入力）
│       │   │   │   ├── [sessionId]/      # 面接中（状態A/B）
│       │   │   │   └── [sessionId]/report/  # 面接後レポート（面接官向け）
│       │   │   └── sign-in/        # マジックリンクサインイン
│       │   ├── admin/              # 管理画面（ADMIN_ALLOWED_EMAILS 許可メール検査）
│       │   │   ├── sessions/       # 全セッション一覧
│       │   │   ├── sessions/[id]/  # セッション詳細・手動評価
│       │   │   └── login/          # 管理者ログイン
│       │   ├── api/
│       │   │   ├── interview/
│       │   │   │   ├── turns/next/       # 面接ターン処理（録音→Whisper→分析→候補生成）
│       │   │   │   └── finalize/         # セッション終了処理
│       │   │   ├── auth/                 # マジックリンク認証
│       │   │   ├── admin/                # 管理 API
│       │   │   └── cron/audio-purge/     # 音声削除 Cron
│       │   ├── layout.tsx
│       │   └── page.tsx            # ランディング（ベータの説明）
│       ├── components/
│       └── lib/
│
├── packages/
│   ├── db/                         # Drizzle schema + queries
│   ├── types/                      # 共通型定義
│   ├── lib/                        # 共通ユーティリティ
│   └── ai/                         # LLM 関数 + Whisper クライアント + プロンプト
│
├── docs/
│   ├── consent/                    # 同意文（ja-v1.md 等、バージョン管理）
│   └── (handoff / product-direction / patterns / probe-logic / architecture)
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
ランディング:
  /                              ベータの説明

面接官向け:
  /sign-in                       マジックリンクサインイン
  /interviews                    自分のセッション一覧
  /interviews/new                新規セッション作成（候補者情報入力）
  /interviews/[sessionId]        面接中（状態A 録音中 / 状態B 候補選択）
  /interviews/[sessionId]/report 面接後レポート（ヒートマップ + サマリー）

管理画面（ADMIN_ALLOWED_EMAILS 許可メール検査）:
  /admin/sessions                全受験セッション一覧
  /admin/sessions/[id]           セッション詳細（手動評価入力 + CSV/JSON エクスポート）
  /admin/login                   管理者ログイン

API:
  /api/interview/turns/next      面接ターン処理（multipart/form-data audio + 状態更新）
  /api/interview/finalize        セッション終了 + ヒートマップ/サマリー生成
  /api/auth/*                    Better Auth エンドポイント
  /api/admin/*                   管理 API
  /api/cron/audio-purge          Vercel Cron からの音声削除（30 日経過分）
```

### 開発・プレビュー

```
開発:
  http://localhost:3020          apps/web

ステージング:
  Vercel Preview URL（PR ごとに自動生成）
```

## 面接アシスタント アーキテクチャ

### 設計原則

1. **面接官が主役、AI は黒子**
   - 面接官の発言を最小限に抑える支援ツール
   - 「自分で次を聞く」が常に選択肢として存在
   - LLM の提案は3候補に絞り、面接官に選ばせる

2. **構造化された問診パターンに基づく**
   - 創業者が設計した57の状況パターン（`docs/02-questionnaire-patterns.md`）
   - 各パターンに4段階の深掘り質問テンプレート（`docs/03-probe-logic.md`）
   - LLM はパターンに沿って質問候補を生成

3. **回答は構造化保存**
   - 各ターンを `interview_turn` に保存（音声 + 文字起こし + ターン分析）
   - パターン完了時に `pattern_coverage` で集約（5次元最終スコア）
   - フリー質問（規定外）は `pattern_id=null` で保存、評価集約に含めず session_report に反映

4. **サーバーオーケストレーション**
   - LLM の Tool Use ループは使わない
   - サーバー側で決定論的に LLM を順次呼ぶ（generateObject 中心）

### 使用しないもの

- ❌ Vercel AI SDK の `useChat` / `streamText`（v1 用、v2 では不要）
- ❌ LangChain / LangGraph
- ❌ MCP サーバー
- ❌ 独自ベクトルDB（Stage 1 では不要）
- ❌ Redis キャッシュ（Stage 1 では不要）

### 関数構成

**サーバー内部関数（決定論的、LLM 呼び出しなし）**

- `transcribeAudio(blob)` — OpenAI Whisper API ラッパー
- `uploadToBlob(blob, key)` — Vercel Blob アップロード
- `purgeExpiredAudio()` — Vercel Cron から呼ばれる削除ジョブ

**LLM 関数（generateObject + Zod スキーマ）**

```typescript
// packages/ai/src/functions/
const llm = {
  analyzeTurn, // このターンで観察できた 5 次元シグナル + 到達段階推定
  splitInterviewerCandidate, // 「自分で次を聞く」用、文脈から質問+回答を分離
  proposeNextQuestions, // 3 候補生成（深掘り / メタ認知 / 次パターン）
  aggregatePatternCoverage, // パターン完了時、複数ターンを統合して5次元最終スコア + level_reached + stuck_type
  generateSessionReport, // 面接終了時、ヒートマップ JSON + サマリーテキスト生成
};
```

各関数は Zod スキーマで構造化出力を保証。LLM 出力は DB 書き込み前に再検証。

### システムプロンプト構造

```
1. 役割定義（経験豊富な面接官の判断を支援する黒子）
2. 4 段階深掘り構造（経験有無 → 真贋 → 判断力 → メタ認知）
3. 評価軸の説明（広さ × 深さ × 意思決定の射程、5 次元スコア）
4. 詰まり判定ルール（4 種：not_experienced / shallow / single_option / rigid）
5. AI 横断軸の差し込み（各パターン第 4 段最後）
6. 自然対話の振る舞い指針（オープンクエスチョン優先、続きを促す）
7. プロンプトインジェクション対策（システム指示の上書き禁止）
8. 出力言語（日本語）
9. プロファイル動的注入（候補者の応募職種・経歴）
```

### 面接の状態遷移

```
[ セッション作成 ]
   - 面接官が候補者情報入力
   - planned_pattern_codes を生成（候補者経歴に基づく優先順位）
   - status='in_progress'、started_at 記録
       ↓
[ 状態A（録音中）]
   - 質問テキスト表示（LLM 候補①/②/③ または manual の場合は空）
   - MediaRecorder で録音開始
   - 進捗インジケータ表示（パターン数 / 経過時間）
   - 操作: [次の質問へ] のみ
       ↓
[ POST /api/interview/turns/next ]
   1. multipart/form-data で audio blob 受信
   2. uploadToBlob → audio_key 取得
   3. transcribeAudio(blob) → transcript
   4. (manual の場合) splitInterviewerCandidate(transcript) → { interviewer_text, candidate_text }
   5. analyzeTurn(transcript, current_pattern, history) → llm_analysis
   6. interview_turn を DB insert
   7. パターン完了判定 → 完了なら aggregatePatternCoverage → pattern_coverage upsert
   8. proposeNextQuestions(session_state) → question_proposal を DB insert
   9. レスポンス: { turn, coverage?, proposal }
       ↓
[ 状態B（3 候補表示）]
   - 直前ターンの文字起こし表示（折り畳み）
   - 評価サマリー表示（このターンで観察できたこと）
   - 3 候補表示（候補1: 深掘り / 候補2: メタ認知 / 候補3: 次パターン）
   - 操作: [①] [②] [③] [自分で次を聞く]
       ↓
[ ① / ② / ③ 選択 ]
   - question_text を状態A に表示
   - 録音開始
   - 状態A へ戻る
       OR
[ 自分で次を聞く ]
   - 即録音開始（質問は表示なし）
   - 面接官が自分で質問
   - 状態A へ戻る
       ↓
[ ループ終了条件 ]
   - planned_pattern_codes を一通りカバー、または
   - 経過時間が 40 分到達、または
   - 面接官が「面接終了」ボタン押下
       ↓
[ POST /api/interview/finalize ]
   - 残り pattern_coverage を集計
   - generateSessionReport → session_report 作成
   - status='completed'、completed_at 記録
       ↓
[ 面接後レポート画面（面接官向け）]
   - ヒートマップ表示
   - サマリーテキスト表示（5 次元別所感 + カテゴリ別カバレッジ + フリー質問総評）
   - 「セッション一覧へ戻る」「再閲覧可能」
```

### 会話メモリ管理

```
短期記憶（直近ターンの文脈）:
  - DB から直近 5-10 ターンの transcript + llm_analysis を読み込み、
    proposeNextQuestions / analyzeTurn のプロンプトに注入

長期記憶（パターン別の到達状況）:
  - pattern_coverage テーブルから現セッションの coverage を読み込み
  - 「このパターンはまだ深掘りしてない、こっちは完了」という状況を LLM に伝える
```

## データモデル（Stage 1 最小構成）

### Better Auth 管理テーブル

- `user` (面接官)
- `session`, `account`, `verification`

### bulr 固有テーブル

```
candidate                      # 候補者マスタ（Stage 3 人材紹介の伸長余地）
  - id, name, applied_role, background_summary, email?,
  - created_at, updated_at

interview_session              # 1 面接 = 1 candidate × 1 interviewer
  - id, interviewer_id (=user.id), candidate_id (FK→candidate),
  - status enum [draft/in_progress/completed/abandoned],
  - role text (Stage 1: 'backend'),
  - planned_pattern_codes text[],
  - consent_obtained_at, consent_version (default 'ja-v1'),
  - started_at, completed_at

assessment_pattern             # パターンマスタ（02-questionnaire-patterns.md と 03-probe-logic.md をシード）
  - id, code (e.g., 'D-01'), category enum,
  - title, description,
  - level_1_intro, level_2_focus, level_3_focus, level_4_focus,
  - signals text[], ai_perspective,
  - is_active boolean

question_proposal              # 各ターン前の3候補ログ
  - id, session_id (FK), prepared_for_turn_no,
  - candidate_1_text, candidate_1_intent (deep_dive/meta/next_pattern),
  - candidate_2_text, candidate_2_intent,
  - candidate_3_text, candidate_3_intent,
  - selected_index (1/2/3/null=manual),
  - generated_at

interview_turn                 # 1 ターン = 1 質問 + 1 回答（または manual）
  - id, session_id (FK), sequence_no,
  - pattern_id (FK→assessment_pattern, nullable=フリー質問),
  - proposal_id (FK→question_proposal, nullable=manual),
  - question_source enum [llm_candidate_1/2/3, manual],
  - question_text,
  - audio_key (Vercel Blob key, nullable),
  - audio_expires_at timestamp,        # 30日後
  - transcript JSONB { interviewer, candidate },
  - llm_analysis JSONB,                # 5次元シグナル + 到達段階推定 + nearest_patterns
  - pattern_match_confidence enum [exact/inferred_high/inferred_low/off_pattern],
  - off_pattern_summary text?,         # フリー質問の要約（pattern_id=null の場合）
  - duration_ms, created_at

pattern_coverage               # 1 session × 1 pattern の集約
  - id, session_id, pattern_id (UNIQUE together),
  - level_reached (0-4), stuck_type enum (nullable),
  - llm_evaluation JSONB,              # 5次元最終スコア
  - manual_evaluation JSONB,           # admin-review-panel が書き込み
  - turn_ids text[],
  - finalized_at

session_report                 # 面接終了時に生成
  - id, session_id (UNIQUE),
  - heatmap_data JSONB,                # カテゴリ別平均スコア + 射程分布 + AI リテラシー分布
  - summary_text,                      # 5次元別所感 + カテゴリ別カバレッジ + フリー質問総評
  - generated_at
```

### Stage 1 で作らないテーブル

- `workspace`, `workspace_user`（マルチテナント不要）
- `application`, `offer`, `match`, `referral_fee`（人材紹介は Stage 3）
- `skill_heatmap`（パターン集約とは別の集計テーブル、Stage 2）

## 同意・プライバシー方針

### Stage 1 の同意フロー

- 面接官が事前メールで候補者に説明、口頭/メール返信で OK 取得
- セッション作成時に `consent_obtained_at` を自動付与（暗黙的に「面接官が事前取得済み」とみなす）
- 同意文は `docs/consent/ja-v1.md` に格納、`consent_version` でバージョン管理
- UI 上のチェックボックスは Stage 1 では設けない（Stage 2 で再考）

### 音声データの取り扱い

- Vercel Blob に保存、`audio_expires_at = created_at + 30 days`
- Vercel Cron が毎日 1 回、`audio_expires_at <= now()` の音声を物理削除
- 削除時に `interview_turn.audio_key` を null クリア

### 候補者からの削除請求

- bulr のデータオーナーは企業側（面接官）
- 候補者からの削除請求は企業側機能で対応（Stage 3 以降）
- Stage 1 では bulr 側に削除フローを設けない

## セキュリティ方針（最小限）

### 認証

- HttpOnly + Secure + SameSite=Lax cookies
- Magic Link は使い切り、有効期限15分
- 管理画面は `ADMIN_ALLOWED_EMAILS` 許可メールリスト検査（`requireAdmin()` を Server Component で独立に呼ぶ）

### データ

- 全 DB アクセスはサーバーサイドのみ
- 面接官データは `interviewer_id` でスコープ
- 候補者データは `interview_session.interviewer_id` 経由でスコープ
- 個人情報は最小化（candidate.name, email のみ、メールは optional）

### LLM

- システムプロンプトの保護（ユーザー入力でオーバーライド不可）
- 1 ターン当たりの transcript 文字数上限（5000 文字）
- LLM 出力は DB 書き込み前に Zod 検証
- レート制限（面接官あたり 1 日 5 セッション、API 1 分 30 リクエスト）

### 音声

- Vercel Blob のアクセスはサーバーサイドのみ（署名付き URL は使わない）
- 音声 URL を transcript レスポンスに含めない（クライアント漏洩防止）

### 通信

- HTTPS 強制（Vercel デフォルト）

## コスト試算（Stage 1）

```
Vercel Hobby:                  $0
Neon Free:                     $0
Resend Free:                   $0 (100通/日まで、十分)
Vercel Blob:                   $0 (1GB/月まで無料、Stage 1 規模なら無料枠内)
Anthropic Claude API:          約 $50-150
  - 70セッション × 30-40分 × 平均 12 ターン × Claude Sonnet 4.6
OpenAI Whisper API:            約 $20-50
  - 70セッション × 平均 30 分音声 × $0.006/min
Domain (bulr.net):             約 $1.5/月
─────────────────────────────────────
合計:                          約 $70-200/月
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
OPENAI_API_KEY=                   # Whisper API

# ストレージ
BLOB_READ_WRITE_TOKEN=            # Vercel Blob

# Cron
CRON_SECRET=                      # Vercel Cron 認証用

# 管理画面
ADMIN_ALLOWED_EMAILS=             # 管理者メール許可リスト (CSV)
```

**Stage 2 で追加される環境変数**

- PostHog 関連
- Sentry 関連
- Helicone 関連
- Cloudflare R2 関連（Vercel Blob から移行する場合）
- Deepgram 関連（話者分離 API）

## デプロイフロー（Stage 1）

```
1. ローカル開発
   $ pnpm dev (Turbo: web を起動)

2. Pull Request
   → Vercel が自動でプレビュー環境を作成
   → CI で型チェック・lint 実行（テストは Stage 1 では最小限）

3. main にマージ
   → 本番デプロイ自動実行

4. 音声削除 Cron
   vercel.json で定義: 毎日 03:00 JST に /api/cron/audio-purge 実行
```

CI/CD は最小限。本格的なテスト整備は Stage 2 以降。

## 開発体験

### 推奨開発環境

- Node.js 22 LTS
- pnpm 10+
- VS Code (with extensions: ESLint, Prettier, Tailwind, Drizzle)
- Claude Code
- Whisper API のローカルテストには `OPENAI_API_KEY` 必須

### コーディング規約

- TypeScript strict mode
- ESLint + Prettier
- Conventional Commits (feat:, fix:, etc.)
- ファイル名は kebab-case
- コンポーネントは PascalCase
- 関数・変数は camelCase
- DB テーブル/カラムは snake_case

## Stage 2 への移行計画（参考）

3ヶ月の検証で「いける」と判断したら、以下の順序で移行する。

### Stage 2 で追加するもの

1. **リアルタイム文字起こし**
   - チャンク単位ストリーミング
   - 録音中に状態B の準備が並行進行（待ち時間削減）

2. **話者分離 API（Deepgram など）**
   - プロンプトベースの分離から、専用 API での確実な分離へ

3. **先読みでの質問生成**
   - 状態A 中に次の状態B 候補を先読み

4. **apps/admin の分離**
   - 管理画面を別 Next.js アプリに切り出し
   - admin.bulr.net サブドメインに切り替え
   - packages/auth に Better Auth 設定を切り出し

5. **packages/ui の切り出し**
   - 共通 UI コンポーネントを apps/web から抽出

6. **監視・分析の本格導入**
   - Sentry でエラー追跡
   - PostHog でユーザー行動分析
   - Helicone で LLM コスト監視

7. **i18n 導入**
   - next-intl で日本語・英語対応

8. **マルチテナント機能**
   - ワークスペース、求人管理、応募管理
   - bz.bulr.net サブドメイン

9. **追加職種**
   - フロントエンド、SRE/インフラ、PdM

10. **候補者向け UI（Stage 3）**
    - 候補者直接対話型を追加機能として（v2 で保留した方式）
    - bulr の中核は引き続き面接アシスタント型

## 重要な原則

### Stage 1 でやらないことを明確に

- ❌ ヒートマップの本格的な可視化（Stage 1 は CSS 横棒で簡易版）
- ❌ 企業向けダッシュボード
- ❌ パーティ編成シミュレーション
- ❌ 課金システム
- ❌ 複数職種対応
- ❌ マネタイズ機能
- ❌ ブランディング・本格デザイン
- ❌ 企業ワークスペース機能
- ❌ 求人・応募管理
- ❌ 候補者向け UI
- ❌ リアルタイム文字起こし
- ❌ 話者分離 API
- ❌ 先読み質問生成

### Stage 1 で集中すること

- ✅ 状態A/B の 2 状態 UI（面接官の認知負荷最小化）
- ✅ 録音 → Whisper → LLM 分析 → 3 候補生成のサーバーオーケストレーション
- ✅ 5 LLM 関数の構造化出力（generateObject + Zod）
- ✅ 問診パターン57件の活用（既存 seed をそのまま使う）
- ✅ 4段階深掘り + 詰まり判定 + AI 横断軸
- ✅ フリー質問（規定外）の許容と評価集約からの除外
- ✅ 面接後レポート（面接官向けヒートマップ + サマリー）
- ✅ 創業者の手動評価（admin で 5 次元スコア + CSV/JSON エクスポート）
- ✅ 音声30日自動削除
- ✅ ベトナム人20-30 + 日本人10-20 の面接データ収集
- ✅ 面接結果と面接官独自判断の一致度確認
