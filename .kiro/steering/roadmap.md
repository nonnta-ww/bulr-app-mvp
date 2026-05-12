# Roadmap

> 本ファイルは Kiro spec 依存関係トラッキング用のロードマップ。プロダクト全体のロードマップは `product.md` を参照。
> このファイルは `/kiro-spec-batch` が読む dependency-order list として機能する。

## Overview

bulr Stage 1 MVP プロトタイプ：**面接アシスタント型で実務判断力を可視化** するシステムを 0 から構築する。3 ヶ月で「バックエンドエンジニア向けの面接アシスタントを作り、創業者および協力面接官 5-10 人が、ベトナム人 20-30 人 + 日本人 10-20 人の面接で実際に使い、問診パターンに基づく面接結果と、面接官の独自判断との一致度を確認する」検証ゴールを達成するために必要な、最小機能の実装ロードマップ。

`/kiro-discovery` の判定（v2 移行後）:
- **greenfield**: 既存実装ゼロ。リポジトリは bootstrap commit + docs/ + .kiro/steering/ のみ
- **steering 完備**: product / tech / structure / security / assessment-design / evaluation-rubric の 7 ファイル（roadmap 含む）で spec 作成時の上位規約を固定済み
- **参照プロジェクト**: `dishxdish-app-mvp` が部分的に同一の技術スタック（Next.js 16 + Vercel AI SDK 6 + Claude Sonnet 4.6 + Neon + Drizzle + Better Auth Magic Link + Turborepo + pnpm）で稼働中。viability は参照プロジェクトで実証済み。bulr 固有の追加要素は OpenAI Whisper + Vercel Blob + 状態A/B UI + 5 LLM 関数

## Approach Decision

- **Chosen**: Path D（multi-spec decomposition）— 基盤 → インフラ → 認証 → データ → 中核機能 → 管理画面 の 6 spec で水平分割
- **Why**:
  - greenfield のため全領域が新規。各 spec の境界が明確（基盤 / インフラ / 認証 / データ / 面接エンジン / 管理画面）
  - 依存関係が線形に近く（DAG が単純）、`/kiro-spec-batch` の波形並列実行に適する
  - 各 spec は 5〜35 タスク程度に収まる規模感で、レビューゲートを挟みやすい
  - v1 の spec 構成（同一 6 spec）の境界をそのまま流用、内容のみを v2 用に書き直す
- **Rejected alternatives**:
  - **5 spec に統合（assessment-pattern-seed を assessment-engine に内包）**: シードと面接エンジンは関心が異なり、シード変更時に engine spec の review が巻き込まれる
  - **7 spec に分割（admin を answer-storage-schema + review-ui に分割）**: Stage 1 の管理画面は最小機能で 5〜8 タスク規模、分割するとタスク不平衡
  - **vertical slice（最初に end-to-end の 1 ターンだけ動かす spec）**: greenfield かつ全パッケージ未作成のため、horizontal layer の方が依存関係明示と並列レビューに適する

## Scope

- **In**:
  - Turborepo + pnpm + Next.js 16 + apps/web 単一アプリの最小モノレポ
  - Vercel + Neon dev/prod ブランチ + Resend + Vercel Blob + Vercel Cron のインフラ
  - Better Auth Magic Link（面接官）+ Basic 認証 + 許可メール二重チェック（管理画面）
  - 57 状況パターン × 4 段階質問テンプレの DB シード
  - 面接アシスタント型 UI（状態A 録音中 / 状態B 候補選択）
  - MediaRecorder + Vercel Blob + OpenAI Whisper + 5 LLM 関数（generateObject + Zod）による面接ターン処理
  - 音声30日自動削除（Vercel Cron）
  - 候補者情報入力 → 面接 → 終了 → 面接後レポート（面接官向け、ヒートマップ + サマリー）
  - 創業者向け管理画面（apps/web 同居、回答全文確認 + 5 次元手動スコア + LLM 評価突合 + CSV/JSON エクスポート）
- **Out**:
  - apps/admin 分離（Stage 2）
  - packages/{auth, ui, i18n} 切り出し（Stage 2）
  - 多言語対応（next-intl、Stage 2）
  - 観測スタック（PostHog / Sentry / Helicone、Stage 2）
  - リアルタイム文字起こし、話者分離 API、先読み質問生成（Stage 2）
  - フル機能のヒートマップ可視化 UI（Stage 2、Stage 1 は CSS 横棒の簡易版）
  - 候補者向け UI（Stage 3）
  - 企業向けダッシュボード、求人管理、応募管理（Stage 2 以降）
  - 複数職種対応（フロントエンド / SRE / PdM、Stage 2）
  - 課金・マネタイズ機能（Year 2 以降）
  - パーティ編成シミュレーション（Year 3）
  - 削除請求 UI（Stage 3、企業側機能として実装）

## Constraints

- `tech.md` 準拠: Next.js 16 (App Router、Turbopack stable、React Compiler)、Vercel AI SDK 6 (`generateObject`)、Anthropic Claude Sonnet 4.6、OpenAI Whisper API、Drizzle ORM 0.45.x stable、Better Auth 1.6.x、Node.js 22 LTS+、pnpm 10+、`useChat`/`streamText` は使わない
- `security.md` 準拠: 多層認証（proxy.ts + Server Component + Server Action + API Route）、Zod 入力検証、LLM スコープ束縛、レート制限、音声30日削除、Vercel Cron 認証、CSP（microphone=(self) 含む）
- `assessment-design.md` 準拠: 面接アシスタント型、4 段階深掘り構造、6 カテゴリ × 57 パターン、AI 横断軸、詰まり判定 4 種、フリー質問の許容、自然対話の振る舞い指針、AI は黒子
- `evaluation-rubric.md` 準拠: 2 段評価構成（ターン分析 + パターン集約）、5 次元スコア（authenticity 0-3 / judgment 0-3 / scope 1-5 / meta_cognition 0-3 / ai_literacy 0-3）、LLM 自動評価 + 手動評価の二重スキーム、採用推奨を LLM に出させない
- `structure.md` 準拠: apps/web 同居 + packages/{db, types, lib, ai}、kebab-case ファイル / PascalCase コンポーネント / snake_case DB
- 検証ゴール 3 ヶ月: 面接官 5-10 人がベトナム人 20-30 + 日本人 10-20 を面接、面接結果と面接官独自判断の一致度確認
- コスト目安: 全期間で最大数百ドル（Vercel Hobby + Neon Free + Vercel Blob 無料枠 + Anthropic + OpenAI のみ）

## Boundary Strategy

- **Why this split**:
  - `monorepo-foundation` は **モノレポ初期化** のみが関心。ビルド・型チェックが通ればゴール
  - `multi-env-infrastructure` は **デプロイ環境** のみが関心。Vercel + Neon ブランチ + Resend + Vercel Blob + Vercel Cron 統合
  - `authentication` は **誰がアクセスできるか** のみが関心。面接官 Magic Link + 管理者 Basic 認証
  - `assessment-pattern-seed` は **問診の素材投入** のみが関心。Markdown → DB 変換とシードスクリプト（v1 から流用、変更最小）
  - `assessment-engine` は **面接アシスタント型の中核機能** が関心。録音 + Whisper + 5 LLM 関数 + 状態A/B UI + 面接後レポート
  - `admin-review-panel` は **創業者の検証作業支援** が関心。回答確認 + 手動スコア + CSV/JSON エクスポート
- **Shared seams to watch**:
  - `interview_session` / `interview_turn` / `pattern_coverage` / `session_report` のスキーマは `assessment-engine` で定義し、`admin-review-panel` で参照する
  - `pattern_coverage.llm_evaluation` JSONB の構造は `assessment-engine` が権威定義、`admin-review-panel` が読み取り
  - `pattern_coverage.manual_evaluation` JSONB の構造は `admin-review-panel` が権威定義、`assessment-engine` のスキーマが受け入れ
  - 認証ヘルパー（requireUser / requireAdmin / requireSessionOwnership）は `authentication` で定義し、`assessment-engine` と `admin-review-panel` で利用
  - 環境変数規約は `multi-env-infrastructure` で `.env.example` を確立し、後続 spec が追記
  - `packages/types/src/profile.ts` の `InterviewerProfile` / `CandidateInfo` 型は `assessment-engine` で定義、`admin-review-panel` で利用
  - `packages/db/src/queries/admin/` の集約クエリは `admin-review-panel` が初導入

## Specs (dependency order)

- [ ] monorepo-foundation — Turborepo + pnpm + Next.js 16 + apps/web + packages/{db,types,lib,ai} の最小骨組み（pnpm dev / typecheck / lint が通る状態）。v1 から軽微修正（packages/ai に Whisper / OpenAI SDK の依存追加 slot）。Dependencies: none
- [ ] multi-env-infrastructure — Vercel プロジェクト + Neon dev/prod ブランチ + Resend + Vercel Blob + Vercel Cron + .env.example + Vercel Preview 自動デプロイ。v1 から OPENAI_API_KEY / BLOB_READ_WRITE_TOKEN / CRON_SECRET / vercel.json cron を追加。Dependencies: monorepo-foundation
- [ ] authentication — Better Auth Magic Link（面接官）+ Basic 認証 + 許可メール二重チェック（管理画面）+ 多層認証ガード + Server Action ラッパー + user_profile テーブル（面接官プロファイル）。v1 から user_profile の意味変更（受験者 → 面接官）。Dependencies: multi-env-infrastructure
- [ ] assessment-pattern-seed — assessment_pattern スキーマ + 57 パターン × 4 段階質問テンプレの TypeScript シードデータ + シードスクリプト。v1 からほぼ流用、用途は「LLM 提案候補の素材」に変更。Dependencies: monorepo-foundation, multi-env-infrastructure（spec 生成は monorepo-foundation のみで可能だが、seed 実行による検証は multi-env-infrastructure の DATABASE_URL 整備後）
- [ ] assessment-engine — 面接アシスタント型の中核実装。candidate / interview_session / question_proposal / interview_turn / pattern_coverage / session_report の 6 テーブル + Vercel AI SDK + Claude Sonnet 4.6 + OpenAI Whisper + Vercel Blob + 5 LLM 関数（analyzeTurn / splitInterviewerCandidate / proposeNextQuestions / aggregatePatternCoverage / generateSessionReport）+ 状態A/B UI + 面接後レポート画面（面接官向け）+ Vercel Cron 音声削除 + フリー質問の許容。v1 から全面書き直し。Dependencies: authentication, assessment-pattern-seed
- [ ] admin-review-panel — apps/web/admin/ 配下の Basic 認証 + セッション一覧・詳細 + chat_message 時系列 + 各 pattern_coverage の手動評価入力 + LLM 評価との並列表示 + CSV/JSON エクスポート。v1 から役割縮小（ヒートマップは assessment-engine の面接官向けレポートに移管）。Dependencies: assessment-engine
