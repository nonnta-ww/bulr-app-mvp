# Brief: admin-review-panel

## Problem

Stage 1 の検証ゴールは「ベトナム人 20-30 + 日本人 10-20 の面接結果と既知実力評価および面接官独自判断との一致度確認」（`product.md`、`roadmap.md`）。これを達成するには創業者が **全セッションを確認 + 5 次元の手動スコアを付与 + LLM 評価との突合 + データエクスポート** ができる必要がある。`evaluation-rubric.md` の二重評価スキームのうち、`manual_evaluation` を入力する UI が存在しないと検証作業が完結しない。

v2 移行に伴い、本 spec の役割は **大幅に縮小**。v1 では「ヒートマップ閲覧 + 手動評価」だったが、v2 ではヒートマップ閲覧は **assessment-engine の面接官向けレポート** に移管され、本 spec は **創業者の検証作業ツール（手動評価 + 突合 + エクスポート）** に集中する。

## Current State

- `monorepo-foundation` で apps/web スケルトンあり
- `authentication` で `requireAdmin`、`adminAction`、proxy.ts の Basic 認証チェック、`/admin/login` ログインページ、smoke test ページ `/admin/_health/`（assessment-engine spec で削除済み）あり
- `assessment-engine` で `candidate` / `interview_session` / `question_proposal` / `interview_turn` / `pattern_coverage` / `session_report` テーブルと、LLM 評価が `pattern_coverage.llm_evaluation` JSONB に保存される実装あり、面接官向けレポート（ヒートマップ + サマリー）も実装済み
- 管理画面の機能ページ（`/admin/sessions/`）未実装
- `pattern_coverage.manual_evaluation` JSONB を書き込む手段なし
- `packages/db/src/queries/admin/` サブディレクトリ未作成

## Desired Outcome

- 創業者は `/admin/login` で Basic 認証通過 + 許可メールで `/admin/sessions` にアクセス可能
- `/admin/sessions` で全セッション一覧（候補者名、面接官メール、status、開始/終了時刻、ターン数、平均スコア、レビューステータス）を見られる
- フィルタ（レビューステータス: 未レビュー / 一部レビュー / レビュー済み、status: in_progress/completed/abandoned）+ ソート（開始時刻 / 候補者名 / 平均スコア）が動く
- `/admin/sessions/[id]` でセッション詳細（候補者情報、面接官情報、interview_turn 時系列、各 pattern_coverage の集約 + LLM 評価 + 手動評価入力フォーム + LLM/手動の差分ハイライト）を見られる
- 各 `pattern_coverage` レコードに対し 5 次元の手動スコア（authenticity 0-3 / judgment 0-3 / scope 1-5 / meta_cognition 0-3 / ai_literacy 0-3）+ notes を入力・保存できる
- LLM 評価と手動評価が並列表示され、差分が一目で分かる
- セッション一覧で「未レビュー / レビュー中 / レビュー済み」のフィルタができる
- セッションごとに CSV / JSON エクスポートが可能（採用推奨は含まない、5 次元スコアと観察事実のみ）

## Approach

apps/web 同居の `/admin/*` 配下に、最小機能の検証ツールを構築。Stage 2 で apps/admin 分離する前提で、コンポーネントは `apps/web/app/admin/_components/` に閉じて配置（apps/web の他コードから切り離しやすく、Next.js App Router の private folder 規約 `_` を活用）。

- **認証**: `authentication` spec で確立した二段認証（proxy.ts Basic 認証 + Server Component の `requireAdmin`）を使う
- **UI**: shadcn/ui ベースのテーブル + フォーム。デザインは最小限、機能性優先。Tailwind 4
- **データフェッチ**: Server Component で Drizzle 直接読み取り（`requireAdmin` を必ず先に呼ぶ）
- **手動評価入力**: Server Action（`adminAction` ラッパー）で `pattern_coverage.manual_evaluation` JSONB に upsert。reviewer フィールドに `requireAdmin` で取得した `user.email` を **サーバー側で固定**（フォーム入力からは取得しない、信頼境界）、`reviewed_at` に timestamp
- **LLM vs 手動の並列表示**: 1 行で「LLM スコア / 手動スコア / 差分」を 5 次元ずつ表示、差分が 0 でない行を `bg-yellow-50` でハイライト
- **CSV/JSON エクスポート**: `papaparse` 等のライブラリは使わず、`escapeCsvField()` 純関数 + UTF-8 BOM + CRLF で Excel 互換、JSON は単純な JSON.stringify
- **ヒートマップ閲覧**: 本 spec では作らない（assessment-engine の面接官向けレポートを使う、admin から面接官向けレポート画面に直接アクセスするリンクのみ提供）
- **集約クエリ**: `packages/db/src/queries/admin/` 配下に新規作成、3 階層バレルチェーン（`admin/index.ts` → `queries/index.ts` → `db/index.ts`）

## Scope

- **In**:
  - `/admin/sessions` 一覧ページ（`apps/web/app/admin/sessions/page.tsx`）: 全セッション一覧、ソート（開始時刻 / 候補者名 / 平均スコア）、フィルタ（レビューステータス / status）
  - `/admin/sessions/[id]` 詳細ページ（`apps/web/app/admin/sessions/[id]/page.tsx`）: 候補者情報表示 + 面接官情報表示 + interview_turn 時系列表示（質問テキスト / 文字起こし / pattern_match_confidence / off_pattern_summary）+ 各 pattern_coverage の 5 次元 LLM 評価 + 手動評価入力フォーム + 面接後レポートへのリンク
  - 手動評価入力フォーム: 1 パターンあたり 5 次元のスコア（authenticity 0-3 / judgment 0-3 / scope 1-5 / meta_cognition 0-3 / ai_literacy 0-3）整数入力 + notes テキスト + 「保存」ボタン
  - Server Action（`adminAction` ラッパー）で `pattern_coverage.manual_evaluation` upsert（reviewer はサーバー側で固定）
  - LLM 評価 vs 手動評価の並列表示（差分ハイライト、`bg-yellow-50` で非ゼロ差分を強調）
  - 候補者情報表示（name / applied_role / background_summary / email?）
  - 面接官情報表示（display_name / role_in_org）
  - セッションメタ情報表示（status、開始/終了時刻、所要時間、ターン数、coverage 数、フリー質問数）
  - レビューステータスの判定: `pattern_coverage.manual_evaluation IS NULL` の数で 未レビュー / 一部レビュー / レビュー済み を判定
  - CSV エクスポート: `apps/web/app/admin/sessions/[id]/export/route.ts` で `?format=csv` を受け、1 行 = 1 pattern_coverage の形式で全フィールドフラット化（session_id, candidate_name, interviewer_email, pattern_code, level_reached, llm/manual 5 次元、notes、reviewer、reviewed_at）。UTF-8 BOM + CRLF で Excel 互換
  - JSON エクスポート: 同 route で `?format=json` を受け、structured JSON を返す
  - 集約クエリ: `packages/db/src/queries/admin/sessionListQuery.ts`（一覧、レビューステータス計算）、`sessionDetailQuery.ts`（詳細、joins）。`packages/db/src/queries/index.ts` を新規作成し `export * from './admin/index'`、`packages/db/src/index.ts` のバレルに `export * from './queries/index'` を追加
  - Zod 入力検証（手動スコアの整数値域：authenticity/judgment/meta_cognition/ai_literacy は 0-3、scope は 1-5、notes は 5000 文字）
  - `requireAdmin` を全ページの最初に呼ぶ（多層認証の徹底）
  - smoke test ページ `apps/web/app/admin/_health/` の削除（assessment-engine spec で既に削除済みの場合はスキップ、両 spec の調整は cross-spec review で確認）

- **Out**:
  - apps/admin への分離（Stage 2）
  - フル機能のヒートマップ可視化（D3.js / Recharts 等、Stage 2）。Stage 1 のヒートマップは assessment-engine の面接官向けレポートで CSS 横棒で実装済み
  - 受験者管理（招待・削除・停止、Stage 2）
  - 候補者削除フロー（Stage 3、企業側機能として実装）
  - パターン管理 UI（Stage 2、Stage 1 は TypeScript ファイル編集 + シード再実行で運用）
  - フリー質問の新パターン昇格 UI（Stage 2、Stage 1 では DB 直接閲覧で対応）
  - LLM 評価の手動再実行（Stage 2）
  - レビュー履歴・監査ログ（Stage 2）
  - 複数管理者の権限分離（Stage 1 は ADMIN_ALLOWED_EMAILS でフラットに許可）
  - リアルタイム通知（受験完了通知等、Stage 2）
  - 統計ダッシュボード（受験率・完走率トレンド等、Stage 2）

## Boundary Candidates

- 管理画面ページ（`apps/web/app/admin/sessions/`）
- 管理画面専用コンポーネント（`apps/web/app/admin/_components/`、Next.js private folder 規約で URL ルーティング対象外）
- 手動評価入力 Server Action（`apps/web/app/admin/_actions/update-manual-evaluation.ts`）
- 集約クエリ（`packages/db/src/queries/admin/`）
- データエクスポート route（`apps/web/app/admin/sessions/[id]/export/route.ts`）
- CSV/JSON 整形ヘルパー（`apps/web/app/admin/_lib/csv-export.ts`）

## Out of Boundary

- 面接官向け UI（assessment-engine spec）
- 面接官向け面接後レポート（assessment-engine spec、本 spec はリンクのみ提供）
- LLM 関数実装（assessment-engine spec）
- Whisper / 録音処理（assessment-engine spec）
- 認証ヘルパー実装（authentication spec、本 spec は使うのみ）
- パターン編集（Stage 2）
- セッション削除・停止機能（Stage 2、Stage 1 は手動 SQL で対応）
- 通知システム（Stage 2）

## Upstream / Downstream

- **Upstream**:
  - `monorepo-foundation`（apps/web、packages/db）
  - `multi-env-infrastructure`（DB 接続）
  - `authentication`（`requireAdmin`、`adminAction`、proxy.ts Basic 認証、`/admin/login`、smoke test ページ）
  - `assessment-engine`（`candidate`、`interview_session`、`interview_turn`、`question_proposal`、`pattern_coverage`、`session_report` テーブルと LLM 評価データ、面接官向けレポート画面へのリンク先）
- **Downstream**: なし（Stage 1 末端の spec、Stage 2 で apps/admin 分離 / フル機能ヒートマップに発展）

## Existing Spec Touchpoints

- **Extends**: なし
- **Adjacent**:
  - `assessment-engine`: 本 spec が読み取る 6 テーブル（candidate / interview_session / question_proposal / interview_turn / pattern_coverage / session_report）のスキーマと、`pattern_coverage.llm_evaluation` JSONB のフォーマットに密接依存。`pattern_coverage.manual_evaluation` JSONB の構造を本 spec が権威定義（`{ authenticity, judgment, scope, meta_cognition, ai_literacy, notes, reviewer, reviewed_at }`）、assessment-engine 側のスキーマは nullable で受ける
  - `authentication`: `requireAdmin`、`adminAction`、`/admin/login` を本 spec が前提とする、smoke test ページ削除を本 spec で完了

## Constraints

- **`security.md` 準拠**:
  - 全管理画面ページで `requireAdmin` を最初に呼ぶ
  - Server Action は `adminAction` ラッパー必須
  - manual_evaluation の入力は Zod で検証（整数値域、notes 文字数）
  - reviewer はサーバー側で `requireAdmin` 戻り値の email を固定使用、フォーム入力からは取得しない（信頼境界）
  - 個人情報（候補者 name / email、面接官 email）は管理画面でのみ表示、ログには出さない
  - データエクスポートは `requireAdmin` を通過した上で生成、URL 直接アクセスを許さない
  - CSV エクスポートに採用推奨を含めない（5 次元スコアと観察事実のみ、`evaluation-rubric.md` の方針）
- **`evaluation-rubric.md` 準拠**:
  - 5 次元スコア整数値域（authenticity 0-3 / judgment 0-3 / scope 1-5 / meta_cognition 0-3 / ai_literacy 0-3）
  - manual_evaluation JSONB に reviewer（user.email）と reviewed_at を記録
  - LLM 評価との突合表示が検証作業の核心
  - 採用推奨を出さない（手動評価でも同じ）
- **`structure.md` 準拠**:
  - apps/web 同居（Stage 1）
  - `apps/web/app/admin/_components/` で管理画面専用コンポーネントを閉じて配置（Stage 2 で apps/admin 分離時にディレクトリごと移動可能、Next.js App Router の private folder 規約を活用）
  - `packages/db/src/queries/admin/` サブディレクトリを本 spec で初導入、3 階層バレルチェーン（admin/index → queries/index → db/index）
  - kebab-case ファイル、PascalCase コンポーネント
- **`tech.md` 準拠**:
  - shadcn/ui ベース、Tailwind 4
  - Server Component でデータフェッチ、Client Component は最小限（フォーム入力部分のみ）
- **UI デザイン**: 最小限、機能性優先。グラフライブラリは使わず（ヒートマップ閲覧は本 spec では作らない、assessment-engine の面接官向けレポートを使う）
- **データエクスポート**: CSV と JSON の両方をサポート。Stage 1 末で創業者が Excel / Python pandas で相関分析する素材として使う。CSV は UTF-8 BOM + CRLF で Excel 互換
- **パフォーマンス**: 70 セッション × 平均 8-12 パターン = 600-900 レコード規模。集約クエリは Stage 1 では SQL で素直に書き、最適化は Stage 2 以降
- **テスト戦略**: Stage 1 は手動レビューのみ（自動テストなし）。Server Action の Zod 検証だけ単体テスト
- **smoke test ページ削除**: assessment-engine spec が `/admin/_health/` を削除する想定だが、cross-spec で実装順が前後する可能性あり。本 spec のタスクで「存在すれば削除」という冪等な処理にする
