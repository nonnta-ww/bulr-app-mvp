# Brief: admin-review-panel

## Problem

Stage 1 の検証ゴールは「ベトナム人 50 + 日本人 20 の問診結果と既知実力評価の相関確認」（`product.md`、`roadmap.md`）。これを達成するには創業者が **全回答を確認 + 5 次元の手動スコアを付与 + LLM 評価との突合** ができる必要がある。`evaluation-rubric.md` の二重評価スキームのうち、`manual_evaluation` を入力する UI が存在しないと検証作業が完結しない。

## Current State

- `monorepo-foundation` で apps/web スケルトンあり
- `authentication` で `requireAdmin`、`adminAction`、proxy.ts の Basic 認証チェック、`/admin/login` ログインページあり
- `assessment-engine` で `assessment_session` / `assessment_answer` / `chat_message` テーブルと、LLM 評価が `llm_evaluation` JSONB に保存される実装あり
- 管理画面の機能ページ（`/admin/sessions/`）未実装
- `manual_evaluation` JSONB を書き込む手段なし

## Desired Outcome

- 創業者は `/admin/login` で Basic 認証通過 + 許可メールで `/admin/sessions` にアクセス可能
- `/admin/sessions` で全セッション一覧（受験者メール、status、開始/終了時刻、回答数、平均スコア）を見られる
- `/admin/sessions/[id]` でセッション詳細（受験プロファイル、全 chat_message 時系列、各パターンの 4 段階回答 + LLM 評価 + 手動評価入力フォーム）を見られる
- 各 `assessment_answer` レコードに対し 5 次元の手動スコア（authenticity / judgment / scope / meta_cognition / ai_literacy）+ notes を入力・保存できる
- LLM 評価と手動評価が並列表示され、差分が一目で分かる
- 簡易ヒートマップ（カテゴリ別平均スコア + 射程分布 + AI リテラシー分布）がセッション詳細に表示される
- セッション一覧で「未レビュー / レビュー中 / レビュー済み」のフィルタができる

## Approach

apps/web 同居の `/admin/*` 配下に、最小機能の管理画面を構築。Stage 2 で apps/admin 分離する前提で、コンポーネントは `apps/web/app/admin/_components/` に閉じて配置（apps/web の他コードから切り離しやすく）。

- **認証**: `authentication` spec で確立した二段認証（proxy.ts Basic 認証 + Server Component の `requireAdmin`）を使う
- **UI**: shadcn/ui ベースのテーブル + フォーム。デザインは最小限、機能性優先。Tailwind 4
- **データフェッチ**: Server Component で Drizzle 直接読み取り（`requireAdmin` を必ず先に呼ぶ）
- **手動評価入力**: Server Action（`adminAction` ラッパー）で `assessment_answer.manual_evaluation` JSONB に upsert。reviewer フィールドに `requireAdmin` で取得した `user.email` を記録、`reviewed_at` に timestamp
- **簡易ヒートマップ**: カテゴリ別平均スコアを集計クエリで取得し、横棒グラフ（CSS のみで実装、Chart ライブラリは Stage 2）
- **LLM vs 手動の並列表示**: 1 行で「LLM スコア / 手動スコア / 差分」を 5 次元ずつ表示

## Scope

- **In**:
  - `/admin/sessions` 一覧ページ（`apps/web/app/admin/sessions/page.tsx`）: 全セッション一覧、ソート（開始時刻 / 受験者メール / 平均スコア）、フィルタ（未レビュー / レビュー中 / レビュー済み / status）
  - `/admin/sessions/[id]` 詳細ページ（`apps/web/app/admin/sessions/[id]/page.tsx`）: 受験プロファイル表示 + chat_message 時系列表示（user / assistant / tool_calls）+ 各 assessment_answer の 4 段階回答 + LLM 評価 + 手動評価入力フォーム
  - 手動評価入力フォーム: 1 パターンあたり 5 次元のスコア（authenticity / judgment / scope / meta_cognition / ai_literacy）整数入力 + notes テキスト + 「保存」ボタン
  - Server Action（`adminAction` ラッパー）で `assessment_answer.manual_evaluation` upsert
  - LLM 評価 vs 手動評価の並列表示（差分ハイライト）
  - 簡易ヒートマップ: カテゴリ別（D / T / P / S / O / A）の平均 5 次元スコア + 受験パターン数の横棒グラフ
  - 受験プロファイル表示（経験年数 / 扱った言語 / 関わったシステム種別）
  - セッションメタ情報表示（status、開始/終了時刻、所要時間、メッセージ数、回答パターン数）
  - レビューステータスの判定: `assessment_answer.manual_evaluation IS NULL` の数で 未レビュー / 一部レビュー / レビュー済み を判定
  - データエクスポート: セッション詳細を CSV または JSON でダウンロードできるボタン（Stage 1 末で創業者が分析する素材として使う、簡易実装）
  - Zod 入力検証（手動スコアの整数値域）
  - `requireAdmin` を全ページの最初に呼ぶ（多層認証の徹底）

- **Out**:
  - apps/admin への分離（Stage 2）
  - フル機能のヒートマップ可視化（D3.js 等、Stage 2）
  - 受験者管理（招待・削除・停止、Stage 2）
  - パターン管理 UI（Stage 2、Stage 1 は TypeScript ファイル編集 + シード再実行で運用）
  - LLM 評価の手動再実行（Stage 2）
  - レビュー履歴・監査ログ（Stage 2）
  - 複数管理者の権限分離（Stage 1 は ADMIN_ALLOWED_EMAILS でフラットに許可）
  - リアルタイム通知（受験完了通知等、Stage 2）
  - 統計ダッシュボード（受験率・完走率トレンド等、Stage 2）

## Boundary Candidates

- 管理画面ページ（`apps/web/app/admin/sessions/`）
- 管理画面専用コンポーネント（`apps/web/app/admin/_components/`）
- 手動評価入力 Server Action（`apps/web/app/admin/_actions/update-manual-evaluation.ts`）
- 集約クエリ（`packages/db/src/queries/admin/`）
- データエクスポート（CSV / JSON 生成ロジック、`apps/web/app/admin/sessions/[id]/export/route.ts`）

## Out of Boundary

- 受験者向け UI（assessment-engine spec）
- LLM Tool 実装（assessment-engine spec）
- 認証ヘルパー実装（authentication spec、本 spec は使うのみ）
- パターン編集（Stage 2）
- セッション削除・停止機能（Stage 2、Stage 1 は手動 SQL で対応）
- 通知システム（Stage 2）

## Upstream / Downstream

- **Upstream**:
  - `monorepo-foundation`（apps/web、packages/db）
  - `multi-env-infrastructure`（DB 接続）
  - `authentication`（`requireAdmin`、`adminAction`、proxy.ts Basic 認証、`/admin/login`）
  - `assessment-engine`（`assessment_session`、`assessment_answer`、`chat_message` テーブルと LLM 評価データ）
- **Downstream**: なし（Stage 1 末端の spec、Stage 2 で fuller admin / apps/admin 分離）

## Existing Spec Touchpoints

- **Extends**: なし
- **Adjacent**:
  - `assessment-engine`: 本 spec が読み取る 3 テーブル（`assessment_session`、`assessment_answer`、`chat_message`）のスキーマと、`assessment_answer.llm_evaluation` JSONB のフォーマットに密接依存。スキーマ変更時は両 spec の review を巻き込む
  - `authentication`: `requireAdmin`、`adminAction`、`/admin/login` を本 spec が前提とする

## Constraints

- **`security.md` 準拠**:
  - 全管理画面ページで `requireAdmin` を最初に呼ぶ
  - Server Action は `adminAction` ラッパー必須
  - manual_evaluation の入力は Zod で検証（整数値域、notes 文字数）
  - 個人情報（受験者メール）は管理画面でのみ表示、ログには出さない
  - データエクスポートは `requireAdmin` を通過した上で生成、URL 直接アクセスを許さない
- **`evaluation-rubric.md` 準拠**:
  - 5 次元スコア整数値域（authenticity 0-3 / judgment 0-3 / scope 1-5 / meta_cognition 0-3 / ai_literacy 0-3）
  - manual_evaluation JSONB に reviewer（user.email）と reviewed_at を記録
  - LLM 評価との突合表示が検証作業の核心
- **`structure.md` 準拠**:
  - apps/web 同居（Stage 1）
  - `apps/web/app/admin/_components/` で管理画面専用コンポーネントを閉じて配置（Stage 2 で apps/admin 分離時にディレクトリごと移動可能）
  - kebab-case ファイル、PascalCase コンポーネント
- **`tech.md` 準拠**:
  - shadcn/ui ベース、Tailwind 4
  - Server Component でデータフェッチ、Client Component は最小限（フォーム入力部分のみ）
- **UI デザイン**: 最小限、機能性優先。グラフライブラリは使わず CSS のみで横棒グラフ実装（Stage 2 で Recharts / D3 等を導入）
- **データエクスポート**: CSV と JSON の両方をサポート。Stage 1 末で創業者が Excel / Python pandas で相関分析する素材として使う
- **パフォーマンス**: 70 セッション × 平均 8 パターン = 560 レコード規模。集約クエリは Stage 1 では SQL で素直に書き、最適化は Stage 2 以降
- **テスト戦略**: Stage 1 は手動レビューのみ（自動テストなし）。Server Action の Zod 検証だけ単体テスト
