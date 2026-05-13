# Project Structure

## 組織方針

- **Stage 1 はモノレポ + 単一アプリ**：apps/web 1 つに面接官 UI・管理画面・API・LLM 関数を同居
- **Server-First**：データフェッチ・DB アクセスは Server Component / Server Action / API Route で完結。クライアント境界を最小化
- **packages 切り出しは「2 アプリ以上で共有する瞬間」まで遅延**：Stage 1 で apps/admin を切り出す予定がないため、UI / auth / i18n は apps/web 内に直書き
- **DB スキーマの単一の真実は packages/db**：他パッケージ・アプリは必ず packages/db 経由で参照
- **LLM 関数の単一の真実は packages/ai**：Tool ではなく純関数 + Zod スキーマで構造化出力

## モノレポ ディレクトリ構造（Stage 1）

```
bulr-app-mvp/
├── apps/
│   └── web/                                # 面接官 + 管理画面同居 (bulr.net)
│       ├── app/
│       │   ├── (interviewer)/              # 面接官向けルート
│       │   │   ├── interviews/
│       │   │   │   ├── page.tsx                  # セッション一覧
│       │   │   │   ├── new/page.tsx              # 新規セッション作成
│       │   │   │   ├── [sessionId]/page.tsx      # 面接中（状態A 録音中 / 状態B 候補選択）
│       │   │   │   └── [sessionId]/report/page.tsx  # 面接後レポート（面接官向け）
│       │   │   └── sign-in/page.tsx        # マジックリンクサインイン
│       │   ├── admin/                      # 管理画面（Basic 認証 + 許可メール二重チェック）
│       │   │   ├── sessions/page.tsx       # 全セッション一覧
│       │   │   ├── sessions/[id]/page.tsx  # セッション詳細（手動評価入力 + CSV/JSON）
│       │   │   ├── sessions/[id]/export/route.ts  # CSV/JSON エクスポート
│       │   │   └── login/page.tsx
│       │   ├── api/
│       │   │   ├── interview/
│       │   │   │   ├── turns/next/route.ts       # 1 ターン処理（録音→Whisper→分析→候補生成）
│       │   │   │   └── finalize/route.ts         # セッション終了 + ヒートマップ生成
│       │   │   ├── auth/[...all]/route.ts        # Better Auth
│       │   │   ├── admin/                        # 管理 API
│       │   │   └── cron/audio-purge/route.ts     # Vercel Cron 音声削除
│       │   ├── layout.tsx
│       │   └── page.tsx                    # ランディング（ベータの説明）
│       ├── components/                     # apps/web 専用コンポーネント
│       └── lib/                            # apps/web 専用ユーティリティ
│           ├── auth/                       # Better Auth 設定（packages/auth は Stage 2）
│           ├── email/                      # Resend + 同意文テンプレ
│           ├── audio/                      # MediaRecorder + Vercel Blob クライアント
│           ├── guards.ts                   # requireUser / requireAdmin / requireSessionOwnership
│           └── safe-action.ts              # authedAction / adminAction ラッパー
│
├── packages/
│   ├── db/                                 # Drizzle スキーマ + クエリ関数（DB スキーマの唯一の真実）
│   │   └── src/
│   │       ├── schema/
│   │       │   ├── candidate.ts
│   │       │   ├── interview-session.ts
│   │       │   ├── question-proposal.ts
│   │       │   ├── interview-turn.ts
│   │       │   ├── pattern-coverage.ts
│   │       │   ├── session-report.ts
│   │       │   ├── assessment-pattern.ts
│   │       │   ├── user-profile.ts         # Better Auth user の bulr 固有データ
│   │       │   ├── rate-limit.ts           # Magic Link + API レート制限
│   │       │   └── index.ts                # バレル
│   │       ├── queries/
│   │       │   ├── admin/                  # admin-review-panel が使う集約クエリ
│   │       │   └── index.ts
│   │       ├── client.ts                   # Drizzle client 初期化
│   │       └── index.ts                    # ルートバレル
│   ├── types/                              # 共通型定義
│   │   └── src/
│   │       ├── profile.ts                  # InterviewerProfile, CandidateProfile 等
│   │       ├── evaluation.ts               # LlmEvaluation, ManualEvaluation, HeatmapData 等
│   │       └── index.ts
│   ├── lib/                                # 共通ユーティリティ
│   └── ai/                                 # LLM 関数 + Whisper クライアント + プロンプト
│       └── src/
│           ├── functions/                  # 5 LLM 関数（純関数 + Zod 構造化出力）
│           │   ├── analyze-turn.ts
│           │   ├── split-interviewer-candidate.ts
│           │   ├── propose-next-questions.ts
│           │   ├── aggregate-pattern-coverage.ts
│           │   └── generate-session-report.ts
│           ├── prompts/
│           │   └── system-prompt.ts        # buildSystemPrompt(ctx) 純関数
│           ├── whisper/
│           │   └── transcribe.ts           # transcribeAudio ラッパー
│           ├── client.ts                   # Anthropic Claude モデル定義
│           └── index.ts
│
├── docs/                                   # プロダクト仕様・問診設計ドキュメント
│   ├── consent/                            # 同意文（ja-v1.md 等、バージョン管理）
│   └── (handoff / product-direction / patterns / probe-logic / architecture)
│
├── scripts/                                # 開発スクリプト、データシード（57 パターン投入等）
│
├── .github/workflows/                      # CI/CD（Stage 1 は最小限：型チェック・lint）
│
├── pnpm-workspace.yaml
├── turbo.json
├── vercel.json                             # Vercel Cron 定義
└── tsconfig.base.json
```

### Stage 1 で作らないパッケージ（Stage 2 以降）

- `packages/auth` — Better Auth 設定。Stage 1 は apps/web/lib/auth/ に直書き、apps/admin 分離時に切り出し
- `packages/ui` — 共通 UI コンポーネント。Stage 1 は apps/web/components/ で十分
- `packages/i18n` — 国際化。Stage 1 は日本語のみで不要

切り出し基準: **「2 アプリ以上で参照する瞬間」**。3 回現れたら共通化、を判断軸とする。

## ルートグループのパターン

- `(interviewer)/` — 面接官向けメインフロー。Magic Link 認証必須
- `admin/` — 創業者向け管理画面。Basic 認証 + `ADMIN_ALLOWED_EMAILS` の二重チェック

## App Router のコード分離原則

- **Server Components**: データフェッチ・DB アクセス（Drizzle）・認証ガード（requireUser / requireAdmin）
- **Client Components** (`'use client'`): MediaRecorder の制御・状態A/B の遷移・録音ボタン
- **API Routes** (`app/api/`): 面接ターン処理（Whisper + LLM 呼び出し）・認証コールバック・Vercel Cron

データは Server Component で取得して props で渡す。クライアント境界は録音 UI と状態管理に限定。

## 命名規則

- **ファイル**: kebab-case (`interview-session.ts`, `analyze-turn.ts`)
- **コンポーネント**: PascalCase (`RecordingState`, `QuestionProposalCard`)
- **関数・変数**: camelCase (`analyzeTurn`, `currentSession`)
- **DB テーブル**: snake_case (`interview_session`, `pattern_coverage`)
- **DB カラム**: snake_case (`level_reached`, `created_at`, `audio_expires_at`)
- **状況パターン ID**: `<カテゴリ>-<連番>` (`D-01`, `T-12`, `A-06`)。カテゴリ = D / T / P / S / O / A
- **URL スラッグ**: 英語 kebab-case
- **enum 値**: snake_case (`'in_progress'`, `'not_experienced'`, `'inferred_high'`)
- **JSONB 値の型**: snake_case を許容（`LlmEvaluation`, `ManualEvaluation`, `LlmAnalysis`, `HeatmapData` 等の TypeScript インターフェース内のプロパティ名）。CSV カラム名や DB カラム名と一致させ、変換コストを削減するための意図的な carve-out。Drizzle の row プロパティ自体（`coverage.llmEvaluation`, `coverage.levelReached` 等）は通常通り camelCase

## インポートパターン

```typescript
// パッケージ参照（workspace）
import { db } from '@bulr/db';
import { sessionListQuery } from '@bulr/db/queries/admin'; // サブパス export
import { analyzeTurn } from '@bulr/ai';
import type { LlmEvaluation } from '@bulr/types/evaluation';
import type { ProfileInput } from '@bulr/types/profile';

// Next.js 絶対パス
import { RecordingState } from '@/components/recording-state';

// ローカル相対
import { formatDuration } from './utils';
```

## URL 設計（Stage 1）

```
ランディング:
  /                              ベータの説明

面接官向け:
  /sign-in                       マジックリンクサインイン
  /interviews                    自分のセッション一覧
  /interviews/new                新規セッション作成（候補者情報入力）
  /interviews/[sessionId]        面接中（状態A 録音中 / 状態B 候補選択）
  /interviews/[sessionId]/report 面接後レポート（ヒートマップ + サマリー）

管理画面（Basic 認証 + 許可メール二重チェック）:
  /admin/sessions                全受験セッション一覧
  /admin/sessions/[id]           セッション詳細（手動評価入力）
  /admin/sessions/[id]/export    CSV/JSON エクスポート
  /admin/login                   管理者ログイン

API:
  /api/interview/turns/next      面接ターン処理（multipart/form-data audio）
  /api/interview/finalize        セッション終了 + ヒートマップ生成
  /api/auth/*                    Better Auth エンドポイント
  /api/admin/*                   管理 API
  /api/cron/audio-purge          Vercel Cron からの音声削除（30 日経過分）
```

## データモデル

### 設計原則

1. **Better Auth テーブルに独自カラムを追加しない** — `user`, `session`, `account`, `verification` は Better Auth 管理。bulr 固有データは `user_profile` 等の別テーブルで 1:1 参照
2. **データオーナーは企業側（面接官）** — `interview_session.interviewer_id` でスコープ、候補者からの削除請求は企業側機能で対応（Stage 3）
3. **音声は 30 日後自動削除、テキストは無期限** — `audio_expires_at` で管理、Vercel Cron が削除
4. **ターン分析 + パターン集約の 2 段構成** — `interview_turn.llm_analysis`（生データ）と `pattern_coverage.llm_evaluation`（集約）を分離
5. **フリー質問（規定外）は `pattern_id=null` で記録** — 評価集約には含めず、`session_report.summary_text` に総評反映
6. **物理削除基本** — 論理削除なし。アカウント削除は Stage 3 で企業側機能として実装

### エンティティ関係（Stage 1 構成）

```
user (Better Auth = 面接官)
  └── user_profile (1:1: 面接官プロファイル)

candidate (候補者マスタ、Stage 3 人材紹介の伸長余地)
  └── interview_session (1:N)

interview_session
  ├── question_proposal (1:N: 各ターン前の3候補ログ)
  ├── interview_turn (1:N: 録音→Whisper→分析の単位)
  ├── pattern_coverage (1:N: パターン × セッションの集約)
  └── session_report (1:1: 面接終了時に生成)

assessment_pattern (マスタ: 57 パターン × 4 段階質問テンプレ、創業者が手動シード)
  └── interview_turn.pattern_id (nullable=フリー質問)
  └── pattern_coverage.pattern_id

rate_limit (Magic Link + API レート制限の共通テーブル)
```

### 主要テーブル概要

| テーブル             | 用途                                                                                                                      | オーナー                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `user_profile`       | bulr 固有面接官設定                                                                                                       | user                     |
| `candidate`          | 候補者マスタ（name, applied_role, background_summary, email?）                                                            | (Stage 3 で人材紹介伸長) |
| `interview_session`  | 面接セッション（interviewer_id, candidate_id, status, role, planned_pattern_codes, consent_obtained_at, consent_version） | user                     |
| `assessment_pattern` | 状況パターンマスタ（code / category / 4 段階質問テンプレ）                                                                | admin（創業者シード）    |
| `question_proposal`  | 各ターン前の3候補ログ（候補1/2/3 + intent + selected_index）                                                              | session                  |
| `interview_turn`     | ターン記録（audio_key + transcript + llm_analysis + pattern_match_confidence）                                            | session                  |
| `pattern_coverage`   | パターン集約（level_reached + stuck_type + llm_evaluation + manual_evaluation）                                           | session                  |
| `session_report`     | 面接後レポート（heatmap_data + summary_text）                                                                             | session                  |
| `rate_limit`         | Magic Link + チャット API のレート制限                                                                                    | (キー: email/ip/userId)  |

### Stage 1 で作らないテーブル（Stage 2 以降）

- `workspace` / `workspace_user`（マルチテナント不要）
- `application` / `offer` / `match` / `referral_fee`（人材紹介は Stage 3）
- `skill_heatmap`（パターン集約から派生する集計テーブル、Stage 2）
- `anon_session`（候補者は bulr に直接ログインしない、匿名セッション概念なし）

### データ保持ポリシー

- **面接データ全般**: 永続保持（検証データとして使うため）。データオーナーは企業側
- **音声ファイル**: `audio_expires_at = created_at + 30 days`、Vercel Cron が毎日 1 回削除
- **アカウント削除（候補者）**: Stage 1 で bulr 側に削除フローなし、Stage 3 で企業側機能として実装
- **アカウント削除（面接官）**: Stage 1 で bulr 側に削除フローなし、Stage 3 で実装

## packages 依存ルール

```
apps/web ─→ packages/{db, types, lib, ai}
packages/ai ─→ packages/{db, types, lib}
packages/db ─→ packages/types
packages/lib ─→ packages/types
packages/types ─→ なし（外部依存も Zod 等は持たない、純粋な TypeScript 型のみ）
```

- 循環参照は禁止
- packages/db が DB スキーマの唯一の真実
- packages/ai が LLM 関数の唯一の真実
- packages/types は純粋な型定義のみ（Zod 等の runtime 依存を持たない）
- Zod スキーマは apps/web/lib/ または packages/lib/ に置く（runtime 依存を許容）

## Stage 2 への移行で起きる構造変化（参考）

3 ヶ月の検証で「いける」と判断したら、以下の順序で構造を変える：

1. **apps/admin の分離** → 管理画面を別 Next.js アプリに切り出し、`admin.bulr.net` サブドメインへ
2. **packages/auth の切り出し** → Better Auth 設定を packages 化、apps/web と apps/admin で共有
3. **packages/ui の切り出し** → 共通 UI コンポーネントを apps/web から抽出
4. **packages/i18n の追加** → next-intl で日本語・英語対応
5. **追加職種** → フロントエンド・SRE/インフラ・PdM 領域の状況パターン追加
6. **マルチテナント機能** → ワークスペース・求人管理・応募管理（bz.bulr.net）
7. **候補者向け UI（Stage 3）** → 候補者直接対話型の追加機能（v1 で保留した方式）
