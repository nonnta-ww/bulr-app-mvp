# Roadmap

> 本ファイルは Kiro spec 依存関係トラッキング用のロードマップ。プロダクト全体のロードマップは `product.md` を参照。
> このファイルは `/kiro-spec-batch` が読む dependency-order list として機能する。

## Overview

bulr Stage 1 MVP プロトタイプ：**対話型問診で実務判断力を可視化** するシステムを 0 から構築する。3 ヶ月で「バックエンドエンジニア向けの対話型問診をベトナム人 50 + 日本人 20 に受けてもらい、既知の実力評価との相関を確認する」検証ゴールを達成するために必要な、最小機能の実装ロードマップ。

`/kiro-discovery` (2026-05-10) の判定:
- **greenfield**: 既存実装ゼロ。リポジトリは Initial commit + docs/ + .kiro/steering/ のみ
- **steering 完備**: product / tech / structure / security / assessment-design / evaluation-rubric の 6 ファイルで spec 作成時の上位規約を固定済み
- **参照プロジェクト**: `dishxdish-app-mvp` が同一の技術スタック（Next.js 16 + Vercel AI SDK 6 + Claude Sonnet 4.6 + Neon + Drizzle + Better Auth Magic Link + Turborepo + pnpm）で稼働中。viability は参照プロジェクトで実証済み

## Approach Decision

- **Chosen**: Path D（multi-spec decomposition）— 基盤 → インフラ → 認証 → データ → 中核機能 → 管理画面 の 6 spec で水平分割
- **Why**:
  - greenfield のため全領域が新規。各 spec の境界が明確（基盤 / インフラ / 認証 / データ / AI / 管理画面）
  - 依存関係が線形に近く（DAG が単純）、`/kiro-spec-batch` の波形並列実行に適する
  - 各 spec は 5〜15 タスク程度に収まる規模感で、レビューゲートを挟みやすい
  - dishxdish の spec 構成（monorepo-foundation / multi-env-infrastructure / authentication / content-seed-minimal / ai-chat / llm-observability の 6 spec）を参考に、bulr 用に再設計
- **Rejected alternatives**:
  - **5 spec に統合（assessment-pattern-seed を assessment-engine に内包）**: シードと AI ロジックは関心が異なり、シード変更時に AI spec の review が巻き込まれる。境界を保つ方が継続的なパターン磨き込みに有利
  - **7 spec に分割（admin を answer-storage-schema + review-ui に分割）**: Stage 1 の管理画面は最小機能で 5〜8 タスク規模、分割するとタスク不平衡。Stage 2 で apps/admin 分離時に再分割する方が自然
  - **vertical slice（最初に end-to-end の 1 パターンだけ動かす spec）**: greenfield かつ全パッケージ未作成のため、horizontal layer（基盤から積み上げ）の方が依存関係明示と並列レビューに適する

## Scope

- **In**:
  - Turborepo + pnpm + Next.js 16 + apps/web 単一アプリの最小モノレポ
  - Vercel + Neon dev/prod ブランチ + Resend のインフラ
  - Better Auth Magic Link（受験者）+ Basic 認証 + 許可メール二重チェック（管理画面）
  - 57 状況パターン × 4 段階質問テンプレの DB シード
  - Vercel AI SDK 6 + Claude Sonnet 4.6 + Tool Use 5 種による対話型問診エンジン
  - 受験プロファイル入力 → 30〜40 分セッション → 構造化回答保存 → 完了処理
  - 創業者向け管理画面（apps/web 同居、回答全文確認 + 5 次元手動スコア + 簡易ヒートマップ）
- **Out**:
  - apps/admin 分離（Stage 2）
  - packages/{auth, ui, i18n} 切り出し（Stage 2）
  - 多言語対応（next-intl、Stage 2）
  - 観測スタック（PostHog / Sentry / Helicone、Stage 2）
  - フル機能のヒートマップ可視化 UI（Stage 2）
  - 企業向けダッシュボード、求人管理、応募管理（Stage 2 以降）
  - 複数職種対応（フロントエンド / SRE / PdM、Stage 2）
  - 課金・マネタイズ機能（Year 2 以降）
  - パーティ編成シミュレーション（Year 3）

## Constraints

- `tech.md` 準拠: Next.js 16 (App Router、Turbopack stable、React Compiler)、Vercel AI SDK 6 (`useChat`, `streamText`, `ToolLoopAgent`)、Anthropic Claude Sonnet 4.6、Drizzle ORM 0.45.x stable、Better Auth 1.6.x、Node.js 22 LTS+、pnpm 10+
- `security.md` 準拠: 多層認証（proxy.ts + Server Component + Server Action + API Route）、Zod 入力検証、Drizzle 自動パラメータ化、ツールスコープ束縛（createTools(ctx)）、maxSteps=10、レート制限、シークレット環境変数分離
- `assessment-design.md` 準拠: 4 段階深掘り構造、6 カテゴリ × 57 パターン、AI 横断軸、詰まり判定 4 種、自然対話の振る舞い指針
- `evaluation-rubric.md` 準拠: 5 次元スコア（authenticity 0-3 / judgment 0-3 / scope 1-5 / meta_cognition 0-3 / ai_literacy 0-3）、LLM 自動評価 + 手動評価の二重スキーム
- `structure.md` 準拠: apps/web 同居 + packages/{db, types, lib, ai}、kebab-case ファイル / PascalCase コンポーネント / snake_case DB
- 検証ゴール 3 ヶ月: ベトナム人 50 + 日本人 20 受験、既知実力評価との相関確認
- コスト目安: 全期間で最大数百ドル（Vercel Hobby + Neon Free + Anthropic Claude API のみ）

## Boundary Strategy

- **Why this split**:
  - `monorepo-foundation` は **モノレポ初期化** のみが関心。ビルド・型チェックが通ればゴール
  - `multi-env-infrastructure` は **デプロイ環境** のみが関心。Vercel + Neon ブランチ + Resend 統合
  - `authentication` は **誰がアクセスできるか** のみが関心。受験者 Magic Link + 管理者 Basic 認証
  - `assessment-pattern-seed` は **問診の素材投入** のみが関心。Markdown → DB 変換とシードスクリプト
  - `assessment-engine` は **対話型問診の中核機能** が関心。UI + LLM + 5 ツール + 状態機械 + 評価
  - `admin-review-panel` は **創業者の検証作業支援** が関心。回答確認 + 手動スコア + 簡易集約
- **Shared seams to watch**:
  - `assessment_session` / `assessment_answer` / `chat_message` のスキーマは `assessment-engine` で定義し、`admin-review-panel` で参照する。スキーマ変更時は両 spec の review を巻き込む
  - `packages/ai` の Tool 定義と `packages/db` の query 関数の整合 — `assessment-pattern-seed` がスキーマと初期データ、`assessment-engine` が読み取りパターンを決める
  - 認証ヘルパー（requireUser / requireAdmin / requireSessionOwnership）は `authentication` で定義し、`assessment-engine` と `admin-review-panel` で利用される
  - 環境変数規約は `multi-env-infrastructure` で `.env.example` を確立し、後続 spec が追記していく形

## Specs (dependency order)

- [ ] monorepo-foundation — Turborepo + pnpm + Next.js 16 + apps/web + packages/{db,types,lib,ai} の最小骨組み（pnpm dev / typecheck / lint が通る状態）。Dependencies: none
- [ ] multi-env-infrastructure — Vercel プロジェクト + Neon dev/prod ブランチ + Resend 統合 + .env.example + Vercel Preview 自動デプロイ。Dependencies: monorepo-foundation
- [ ] authentication — Better Auth Magic Link（受験者）+ Basic 認証 + 許可メール二重チェック（管理画面）+ 多層認証ガード + Server Action ラッパー + user_profile テーブル。Dependencies: multi-env-infrastructure
- [ ] assessment-pattern-seed — assessment_pattern スキーマ + 57 パターン × 4 段階質問テンプレの TypeScript シードデータ + シードスクリプト。Dependencies: monorepo-foundation
- [ ] assessment-engine — assessment_session / assessment_answer / chat_message スキーマ + Vercel AI SDK + Claude Tool Use 5 種 + 4 段階深掘り状態機械 + 受験プロファイル入力 + チャット UI + ストリーミング + 詰まり判定 + 完了処理 + レート制限。Dependencies: authentication, assessment-pattern-seed
- [ ] admin-review-panel — apps/web/admin/ 配下の Basic 認証 + セッション一覧・詳細 + 回答全文表示 + 5 次元手動スコア入力 + LLM 評価との並列表示 + 簡易ヒートマップ。Dependencies: assessment-engine
