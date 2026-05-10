# Requirements Document: admin-review-panel

## Project Description

bulr Stage 1 の検証ゴールは「ベトナム人 50 + 日本人 20 の問診結果と既知実力評価の相関確認」である。これを達成するには、創業者が **70 セッションすべての回答を確認 + 5 次元の手動スコアを付与 + LLM 評価との突合 + 集約データのオフライン分析素材として書き出し** ができる必要がある。`evaluation-rubric.md` の二重評価スキームのうち、本スペックは `manual_evaluation` JSONB を入力する管理画面 UI と、LLM 評価との並列表示・簡易ヒートマップ・データエクスポートを提供する。

本スペックは `apps/web` 同居の `/admin/sessions/` 配下に最小機能の管理画面を構築する。Stage 2 で `apps/admin` への分離を予定しているため、コンポーネントは `apps/web/app/admin/_components/` に閉じて配置し、apps/web の他コードから参照させない（ディレクトリごと apps/admin に移動可能な構造）。認証は `authentication` spec で確立した二段認証（`proxy.ts` Basic 認証 + Server Component の `requireAdmin` + Server Action の `adminAction`）を必ず多層で通す。データは `assessment-engine` spec が定義した `assessment_session` / `assessment_answer` / `chat_message` の 3 テーブルから読み取る（スキーマ変更権は持たない、契約として受け取る）。

完成後、創業者は `/admin/sessions` で全 70 セッションを一覧 → `/admin/sessions/[id]` で各セッションの受験プロファイル + 対話履歴 + パターン別 4 段階回答 + LLM 評価を確認 → 各 `assessment_answer` に対し 5 次元手動スコアを入力・保存 → カテゴリ別ヒートマップで全体傾向を把握 → CSV/JSON でデータをエクスポートして Excel / Python pandas で相関分析、というワークフローを完結できる。本スペックは Stage 1 末端の spec であり、後続 spec は持たない。

## Boundary Context

- **In scope**:
  - `/admin/sessions` 一覧ページ（apps/web/app/admin/sessions/page.tsx）: 全セッション一覧、フィルタ（レビューステータス + status）、ソート（開始時刻 / 受験者メール / 平均スコア）
  - `/admin/sessions/[id]` 詳細ページ（apps/web/app/admin/sessions/[id]/page.tsx）: 受験プロファイル + chat_message 時系列 + パターン別 assessment_answer（4 段階回答 + LLM 評価 + 手動評価フォーム）
  - 手動評価入力フォーム（5 次元整数 + notes）と Server Action（`adminAction` ラッパー）による `assessment_answer.manual_evaluation` JSONB upsert
  - LLM 評価 vs 手動評価の並列表示（差分ハイライト）
  - 簡易ヒートマップ（カテゴリ D/T/P/S/O/A の 5 次元平均、射程分布、AI リテラシー分布、CSS のみで横棒グラフ実装）
  - データエクスポート（CSV / JSON、`/admin/sessions/[id]/export?format=csv|json`）
  - レビューステータス判定ロジック（assessment_answer.manual_evaluation の NULL 数集計）
  - 集約クエリ（packages/db/src/queries/admin/）
  - `requireAdmin` を全管理画面ページの最初に呼ぶ多層認証
  - Zod 入力検証（手動スコアの整数値域）
  - `authentication` spec が一時的に作成した `/admin/_health/` smoke test ページの撤去
- **Out of scope**:
  - apps/admin への分離（Stage 2）
  - フル機能のヒートマップ可視化（D3.js / Recharts、Stage 2）
  - 受験者管理（招待・削除・停止、Stage 2）
  - パターン管理 UI（Stage 2、Stage 1 は TypeScript ファイル編集 + シード再実行）
  - LLM 評価の手動再実行（Stage 2）
  - レビュー履歴・監査ログ（Stage 2）
  - 複数管理者の権限分離（Stage 1 は ADMIN_ALLOWED_EMAILS でフラットに許可）
  - リアルタイム通知（Stage 2）
  - 統計ダッシュボード（受験率・完走率トレンド、Stage 2）
  - 自動 E2E テスト（Playwright、Stage 2）
- **Adjacent expectations**:
  - `authentication` spec が `requireAdmin` / `adminAction` / proxy.ts Basic 認証 / `/admin/login` を提供済みであること。本スペックは利用するのみで再実装しない
  - `assessment-engine` spec が `assessment_session` / `assessment_answer` / `chat_message` テーブルと `llm_evaluation` JSONB（`{ authenticity, judgment, scope, meta_cognition, ai_literacy, notes, evaluated_at }`）を提供済みであること
  - `assessment-pattern-seed` spec が `assessment_pattern.code`（`D-01` 等）と `category`（`D` / `T` / `P` / `S` / `O` / `A`）を提供済みであること
  - 本スペックは `assessment_answer.manual_evaluation` カラムへの書き込みのみを行い、スキーマ変更は行わない（assessment-engine の所有物）

## Requirements

### Requirement 1: 管理画面アクセスと多層認証

**Objective:** 創業者として、管理画面の全ページに対し proxy.ts の Basic 認証 + Server Component の `requireAdmin` の二段が独立に効いてほしい。これにより、CVE-2025-29927 のような proxy バイパス脆弱性が将来発生しても、認可境界が突破されない。

#### Acceptance Criteria

1.1. WHEN 未認証または `ADMIN_ALLOWED_EMAILS` に含まれないユーザーが `/admin/sessions` または `/admin/sessions/[id]` にアクセスした場合、THE システム SHALL `requireAdmin()` で `AuthError('UNAUTHORIZED')` または `AuthError('FORBIDDEN')` を投げ、`/admin/login` にリダイレクトまたは 403 ページを表示する。

1.2. THE システム SHALL `/admin/sessions` および `/admin/sessions/[id]` および `/admin/sessions/[id]/export` のすべての Server Component / Route Handler の最初に `await requireAdmin()` を呼ぶ。proxy.ts の Basic 認証通過のみに認可を依存しない（多層防御）。

1.3. THE システム SHALL 管理画面の Server Action（手動評価保存）を `adminAction` ラッパー経由でのみ呼び出し可能にする。素の `async function` で Server Action を書かない。

1.4. WHEN `/admin/sessions/[id]/export` に直接 URL アクセスした場合、THE システム SHALL `requireAdmin()` を通過しない限り 401/403 を返し、CSV/JSON データを生成しない。

1.5. THE システム SHALL `requireAdmin()` で取得した管理者の `user.email` を `manual_evaluation.reviewer` フィールドに記録する。リクエストヘッダーやフォーム入力から取得しない。

### Requirement 2: セッション一覧ページ

**Objective:** 創業者として、全 70 セッションを 1 画面で俯瞰し、受験者を識別 + 進捗 + レビュー状況を一目で把握したい。これにより、レビュー作業の優先順位付けと進捗管理ができる。

#### Acceptance Criteria

2.1. WHEN 管理者が `/admin/sessions` にアクセスした場合、THE システム SHALL すべての `assessment_session` レコードを一覧表示する（初期表示は `started_at` 降順）。

2.2. THE セッション一覧テーブル SHALL 各行に以下のカラムを表示する: 受験者メール（user テーブルから JOIN）、status（`in_progress` / `completed` / `abandoned`）、`started_at`（YYYY-MM-DD HH:mm）、`completed_at`（同形式、NULL なら `-`）、メッセージ数（`message_count`）、回答数（`level_reached >= 1` の assessment_answer 件数）、平均 LLM スコア（5 次元の平均をさらに横断平均、NULL なら `-`）、レビューステータス（`未レビュー` / `一部レビュー` / `レビュー済み`）、詳細ページへのリンク。

2.3. THE システム SHALL レビューステータスを以下の規則で判定する: 該当セッションの `assessment_answer` のうち `manual_evaluation IS NULL` の件数を `n`、合計を `t` とし、`n == t` なら `未レビュー`、`0 < n < t` なら `一部レビュー`、`n == 0 && t > 0` なら `レビュー済み`、`t == 0` なら `回答なし` を表示する。

2.4. WHEN 管理者がフィルタコントロールで「レビューステータス」を選択した場合、THE システム SHALL `未レビュー` / `一部レビュー` / `レビュー済み` / `回答なし` / `すべて` のいずれかで一覧をフィルタする（URL クエリパラメータで状態を保持）。

2.5. WHEN 管理者がフィルタコントロールで「status」を選択した場合、THE システム SHALL `in_progress` / `completed` / `abandoned` / `すべて` のいずれかで一覧をフィルタする（URL クエリパラメータで状態を保持）。

2.6. WHEN 管理者がソートカラム（`started_at` / 受験者メール / 平均スコア）をクリックした場合、THE システム SHALL 昇順 / 降順を切り替えて再表示する（URL クエリパラメータで状態を保持）。

2.7. THE システム SHALL 一覧取得を packages/db/src/queries/admin/ 配下の集約クエリ関数（`sessionListQuery`）に集約し、N+1 を避けるため LEFT JOIN または相関サブクエリで件数集約を 1 クエリ化する。

2.8. WHEN セッション一覧が 0 件の場合、THE システム SHALL 「まだ受験セッションがありません」と表示する。

2.9. THE システム SHALL ページネーション機能を持たない（Stage 1 は最大 70 件、全件取得で十分）。

### Requirement 3: セッション詳細ページ — 受験プロファイル + 対話履歴

**Objective:** 創業者として、セッション詳細ページで受験者の入力プロファイルとセッション中の対話履歴全体を時系列で確認したい。これにより、AI が何を聞き出したかと回答の文脈を把握できる。

#### Acceptance Criteria

3.1. WHEN 管理者が `/admin/sessions/[id]` にアクセスした場合、THE システム SHALL `requireAdmin()` 通過後に、対象セッションの `assessment_session` レコードを取得し、404 でなければ詳細を表示する。

3.2. THE セッション詳細ページ SHALL 上部にメタ情報セクションを表示する: 受験者メール、status バッジ、`started_at` / `completed_at`、所要時間（completed_at - started_at の分単位、未完了なら `-`）、メッセージ数、回答パターン数（`level_reached >= 1`）、レビューステータス。

3.3. THE セッション詳細ページ SHALL 受験プロファイルセクションを表示する: `profile_input` JSONB から経験年数 / 扱った言語（複数）/ 関わったシステム種別（複数）を整形して表示。JSONB がキー欠落していてもフィールドごとに `-` 表示で堅牢に処理する。

3.4. THE セッション詳細ページ SHALL 対話履歴セクションを表示する: `chat_message` を `sequence` 昇順で全件取得し、`role` ごとに視覚的区別（user は右寄せ青、assistant は左寄せ灰、tool は左寄せ緑バッジ + JSONB 内容を整形表示）した時系列タイムラインで表示する。

3.5. THE 対話履歴 SHALL `role='assistant'` メッセージの Markdown を React のデフォルトエスケープで安全に表示する（`react-markdown` 等の信頼できるレンダラを使い、`dangerouslySetInnerHTML` を使わない）。

3.6. THE 対話履歴 SHALL `role='tool'` メッセージで `tool_calls` JSONB を「ツール名 + 引数 + 結果」のラベル付き JSON として表示する。

3.7. WHEN 対象セッション ID が存在しない場合、THE システム SHALL Next.js の `notFound()` で 404 ページを返す。

### Requirement 4: セッション詳細ページ — パターン別回答カードと LLM 評価表示

**Objective:** 創業者として、各パターンの 4 段階回答と LLM 評価を 1 つのカード単位で確認したい。これにより、回答全文と LLM スコアを横並びで見ながら手動評価を入力できる。

#### Acceptance Criteria

4.1. THE セッション詳細ページ SHALL `assessment_answer` を `pattern_id` 昇順で全件取得し（`assessment_pattern` を JOIN して `code` / `category` / `title` を含める）、各パターンに対し 1 枚のカード（`AnswerCard`）を表示する。

4.2. THE 各 AnswerCard SHALL 以下を表示する: パターンコード（`D-01` 等）、カテゴリバッジ（D/T/P/S/O/A）、パターンタイトル、`level_reached`（0-4）、`stuck_type`（NULL なら非表示、それ以外は `not_experienced` / `shallow` / `single_option` / `rigid` のラベル）、4 段階の回答テキスト（`level_1_answer` 〜 `level_4_answer`、NULL なら `-`、改行と長文を保ってスクロール可能）。

4.3. THE 各 AnswerCard SHALL LLM 評価セクションを含む: `llm_evaluation` JSONB から 5 次元スコア（authenticity / judgment / scope / meta_cognition / ai_literacy）を整数値で表示し、`notes` を整形表示し、`evaluated_at` をタイムスタンプ表示する。`llm_evaluation IS NULL` なら「LLM 未評価」と表示。

4.4. THE 各 AnswerCard SHALL 手動評価セクションを含む: 既存の `manual_evaluation` JSONB があれば 5 次元スコア + notes + reviewer + reviewed_at を表示。なければ空のフォーム初期値で入力 UI を表示する。

4.5. WHEN 同一カードに `llm_evaluation` と `manual_evaluation` の両方が存在する場合、THE システム SHALL 5 次元それぞれを「LLM スコア / 手動スコア / 差分（数値）」の 3 列形式で並列表示し、差分が `0` でない次元はハイライト（背景色変更）する。

### Requirement 5: 手動評価入力フォーム

**Objective:** 創業者として、各 `assessment_answer` に対し 5 次元の整数スコア + notes を入力し、保存ボタンで永続化したい。これにより、手動評価を効率的に蓄積できる。

#### Acceptance Criteria

5.1. THE 手動評価フォーム（`ManualEvalForm`）SHALL Client Component として実装し、以下の入力フィールドを持つ: `authenticity`（整数 0-3、number input）、`judgment`（整数 0-3）、`scope`（整数 1-5）、`meta_cognition`（整数 0-3）、`ai_literacy`（整数 0-3）、`notes`（textarea、最大 2000 文字）。

5.2. WHEN 既存の `manual_evaluation` JSONB が存在する場合、THE フォーム SHALL 各フィールドの初期値として既存値をプリフィルする。存在しない場合、各スコアは未選択（プレースホルダ表示）、notes は空文字。

5.3. WHEN 管理者が「保存」ボタンをクリックした場合、THE システム SHALL `updateManualEvaluation` Server Action を呼び出し、入力値を Zod スキーマで検証する（5 次元スコアは整数値域、`scope` は 1-5、その他は 0-3、notes は最大 2000 文字）。

5.4. WHEN Zod 検証が成功した場合、THE システム SHALL `assessment_answer.manual_evaluation` JSONB を以下の構造で upsert する: `{ authenticity, judgment, scope, meta_cognition, ai_literacy, notes, reviewer, reviewed_at }`。`reviewer` は `requireAdmin()` で取得した `user.email`、`reviewed_at` は ISO 8601 タイムスタンプ。

5.5. WHEN Zod 検証が失敗した場合、THE システム SHALL フィールドごとのエラーメッセージをフォームに表示し、DB を更新しない。

5.6. WHEN 保存が成功した場合、THE システム SHALL ページを再読込し（または Server Action の `revalidatePath` 経由で）、保存済みの `manual_evaluation` を含む状態を再表示し、「保存しました」のトースト/インライン表示を提示する。

5.7. THE `updateManualEvaluation` Server Action SHALL `adminAction` ラッパー経由で実行され、未認証アクセスでは `AuthError` を投げる。

5.8. THE Server Action SHALL 入力 `assessment_answer.id` の所有性チェックは行わない（`requireAdmin` 通過者は全 answer を編集できる、Stage 1 はフラット権限）が、対象 ID が DB に存在しなければ 404 相当のエラーを返す。

### Requirement 6: 簡易ヒートマップ表示

**Objective:** 創業者として、各セッション詳細ページにそのセッションのカテゴリ別平均スコアと分布を可視化したい。これにより、受験者の強み弱みを俯瞰できる。

#### Acceptance Criteria

6.1. THE セッション詳細ページ SHALL ヒートマップセクション（`Heatmap`）を含み、以下 3 つの集約結果を表示する: カテゴリ別平均スコア / 射程分布 / AI リテラシー分布。

6.2. THE カテゴリ別平均スコア SHALL `assessment_answer` を `assessment_pattern.category` で GROUP BY し、各カテゴリ（D / T / P / S / O / A）について 5 次元（authenticity / judgment / scope / meta_cognition / ai_literacy）それぞれの平均値（小数第 1 位まで）を計算し、`llm_evaluation` ベースで集計する。`manual_evaluation` がある場合は別系列として併記する（オプション、Stage 1 では LLM 集計のみ必須）。

6.3. THE カテゴリ別平均スコア SHALL CSS のみで横棒グラフとして表示する（Recharts / D3 等のチャートライブラリは使わない）。各バーは Tailwind のユーティリティクラスで `width: ${value/maxValue * 100}%` を計算し背景色で表現。

6.4. THE 射程分布 SHALL `llm_evaluation.scope` の値（1-5）について、それぞれの件数をヒストグラムとして表示する（CSS 横棒）。

6.5. THE AI リテラシー分布 SHALL `llm_evaluation.ai_literacy` の値（0-3）について、それぞれの件数をヒストグラムとして表示する（CSS 横棒）。

6.6. WHEN セッション内に `llm_evaluation IS NOT NULL` の `assessment_answer` が 0 件の場合、THE ヒートマップ SHALL 「集計可能なデータがありません」と表示する。

6.7. THE ヒートマップ集約 SHALL packages/db/src/queries/admin/ の `heatmapAggregateQuery` 関数に集約し、Server Component が呼び出して結果を `Heatmap` Client Component（または Server Component）に props で渡す。

### Requirement 7: データエクスポート（CSV / JSON）

**Objective:** 創業者として、各セッションの全データを CSV または JSON でダウンロードしたい。これにより、Excel / Python pandas で LLM 評価と手動評価の相関分析をオフラインで実施できる。

#### Acceptance Criteria

7.1. WHEN 管理者がセッション詳細ページの「CSV ダウンロード」ボタンをクリックした場合、THE システム SHALL `/admin/sessions/[id]/export?format=csv` を新規タブで開き、適切な `Content-Type: text/csv; charset=utf-8` と `Content-Disposition: attachment; filename="session-{id}.csv"` ヘッダーで CSV を返す。

7.2. WHEN 管理者がセッション詳細ページの「JSON ダウンロード」ボタンをクリックした場合、THE システム SHALL `/admin/sessions/[id]/export?format=json` を新規タブで開き、`Content-Type: application/json; charset=utf-8` と `Content-Disposition: attachment; filename="session-{id}.json"` で JSON を返す。

7.3. THE エクスポート Route Handler SHALL `apps/web/app/admin/sessions/[id]/export/route.ts` に配置し、最初に `await requireAdmin()` を呼ぶ。通過しなければ 401/403 を返し、データ生成を行わない。

7.4. THE CSV 形式 SHALL 1 行 1 `assessment_answer` で、以下のカラムをフラットに展開する: `session_id`、`examinee_email`、`session_status`、`session_started_at`、`session_completed_at`、`pattern_code`、`pattern_category`、`pattern_title`、`level_reached`、`stuck_type`、`level_1_answer` 〜 `level_4_answer`、`llm_authenticity`、`llm_judgment`、`llm_scope`、`llm_meta_cognition`、`llm_ai_literacy`、`llm_notes`、`llm_evaluated_at`、`manual_authenticity`、`manual_judgment`、`manual_scope`、`manual_meta_cognition`、`manual_ai_literacy`、`manual_notes`、`manual_reviewer`、`manual_reviewed_at`。

7.5. THE CSV 出力 SHALL UTF-8 BOM 付き、改行は CRLF、ダブルクォート + 内部ダブルクォートのエスケープ（`""`）を含み、Excel で文字化けせずに開ける形式とする。

7.6. THE JSON 形式 SHALL 1 セッション 1 オブジェクトで、`session`（メタ情報 + プロファイル）、`messages`（chat_message 配列、sequence 昇順）、`answers`（assessment_answer 配列、JOIN した pattern 情報を含む、llm_evaluation / manual_evaluation を JSONB 構造そのまま）の 3 トップレベルキーを持つ構造で返す。

7.7. WHEN 対象セッション ID が存在しない場合、THE システム SHALL 404 を返し、本文に `{ "error": "session not found" }` または `Session not found` を返す。

7.8. WHEN `format` クエリパラメータが `csv` / `json` 以外の場合、THE システム SHALL 400 を返し、本文に `{ "error": "format must be csv or json" }` を返す。

### Requirement 8: 集約クエリのモジュール化

**Objective:** 後続スペックの実装者および本スペックの保守者として、管理画面の DB アクセスが `packages/db/src/queries/admin/` に集約されてほしい。これにより、`apps/web` の Server Component / Route Handler は薄く保たれ、Stage 2 で `apps/admin` 分離時にクエリをそのまま再利用できる。

#### Acceptance Criteria

8.1. THE システム SHALL `packages/db/src/queries/admin/` ディレクトリを作成し、以下の関数を実装する: `sessionListQuery(filters: { reviewStatus?, status?, sortBy?, sortOrder? })`、`sessionDetailQuery(sessionId: string)`、`heatmapAggregateQuery(sessionId: string)`、`sessionExportQuery(sessionId: string)`。

8.2. THE `sessionListQuery` SHALL `assessment_session` + `user`（メール取得用）+ `assessment_answer`（件数集計用、相関サブクエリまたは LEFT JOIN GROUP BY）+ `llm_evaluation` 平均（同様）を 1 クエリで取得する。N+1 を避ける。

8.3. THE `sessionDetailQuery` SHALL `assessment_session` + `user` + `assessment_answer`（`assessment_pattern` JOIN 込み）+ `chat_message` を取得する（複数クエリでもよい、トランザクション不要）。戻り値は `{ session, messages, answers }` の構造化オブジェクト。

8.4. THE `heatmapAggregateQuery` SHALL カテゴリ別平均（GROUP BY pattern.category）と、scope / ai_literacy の分布（GROUP BY 値）を SQL の集約関数で取得する。`llm_evaluation` JSONB の値抽出には Drizzle の `sql` テンプレート + `jsonb` 演算子（`->'authenticity'` 等）を使う。

8.5. THE `sessionExportQuery` SHALL CSV / JSON 出力に必要な全データ（session + user メール + answers + pattern + messages）を取得する。`sessionDetailQuery` と統合してもよいが、出力フィールドが異なる場合は別関数とする。

8.6. THE 各クエリ関数 SHALL 戻り値型を TypeScript で明示し、`apps/web` 側から型安全に参照できる。

8.7. THE 各クエリ関数 SHALL `'server-only'` import 不要（packages/db は元々サーバー専用）だが、`apps/web` 側の Server Component / Route Handler でのみ呼び出すこと。

### Requirement 9: コンポーネントの閉じた配置（Stage 2 移行容易性）

**Objective:** Stage 2 で `apps/admin` を分離する実装者として、管理画面コンポーネントが apps/web の他コードから参照されていない閉じた構造になっていてほしい。これにより、`apps/web/app/admin/` ディレクトリごと apps/admin に移動するだけで分離が完了する。

#### Acceptance Criteria

9.1. THE システム SHALL 管理画面専用コンポーネントを `apps/web/app/admin/_components/` 配下に配置する。`apps/web/components/`（apps/web 全体共有）には配置しない。

9.2. THE システム SHALL 管理画面専用 Server Action を `apps/web/app/admin/_actions/` 配下に配置する。`apps/web/lib/actions/`（apps/web 全体共有）には配置しない。

9.3. THE システム SHALL `apps/web/app/admin/_components/` から export されるコンポーネントを `/admin/*` 配下のページからのみ import 可能とし、`apps/web/app/(assessment)/*` および apps/web の他経路からは import しない。

9.4. THE システム SHALL `apps/web/app/admin/_components/` および `apps/web/app/admin/_actions/` 配下のファイル名を kebab-case、export されるコンポーネントを PascalCase で命名する。

9.5. THE 集約クエリは `packages/db/src/queries/admin/` に配置するため、Stage 2 の `apps/admin` から `@bulr/db` バレル経由でそのまま import できる（ファイル移動不要）。

### Requirement 10: 認証 spec の smoke test ページ撤去

**Objective:** プロジェクト管理者として、`authentication` spec が一時的に作成した `/admin/_health/` smoke test ページが本スペック完了時点で確実に撤去されてほしい。これにより、運用環境に不要な保護ページが残らない。

#### Acceptance Criteria

10.1. THE システム SHALL `apps/web/app/admin/_health/` ディレクトリ（`page.tsx` を含む）を本スペックのタスク完了時に削除する。

10.2. WHEN 削除後に `/admin/_health` にアクセスした場合、THE システム SHALL 404 を返す（ファイル削除により Next.js のルート解決が消える）。

10.3. THE システム SHALL 削除に伴い、`authentication` spec の tasks.md または README に書かれている「admin-review-panel が `/admin/sessions` を実装した時点で `/admin/_health` を削除する」というメモが満たされたことを git ログで追跡可能にする（コミットメッセージで明示）。

### Requirement 11: 入力検証とセキュリティ

**Objective:** 創業者として、手動評価入力およびエクスポート要求について、Zod 入力検証 + Drizzle SQL インジェクション対策 + 多層認証が確実に効いてほしい。これにより、`security.md` に準拠した安全な管理画面が構築される。

#### Acceptance Criteria

11.1. THE 手動評価入力 Server Action SHALL Zod スキーマで全入力を検証する: `assessmentAnswerId: z.string().uuid()`, `authenticity: z.number().int().min(0).max(3)`, `judgment: z.number().int().min(0).max(3)`, `scope: z.number().int().min(1).max(5)`, `meta_cognition: z.number().int().min(0).max(3)`, `ai_literacy: z.number().int().min(0).max(3)`, `notes: z.string().max(2000)`。

11.2. THE システム SHALL すべての DB アクセスを Drizzle ORM 経由で行い、生 SQL の文字列結合は禁止する（`security.md` 準拠）。

11.3. THE エクスポート Route Handler SHALL クエリパラメータ `format` を Zod の `z.enum(['csv', 'json'])` で検証し、不正値は 400 で拒否する。

11.4. THE エクスポート Route Handler SHALL `params.id` を Zod の `z.string().uuid()` で検証し、不正値は 400 で拒否する。

11.5. THE システム SHALL 受験者メール（個人情報）を管理画面でのみ表示し、Vercel ログ（console.log / console.error）には出力しない（`security.md` 準拠）。

11.6. THE システム SHALL `manual_evaluation.reviewer` を必ずサーバー側で `requireAdmin()` 戻り値の `email` から取得し、フォームの hidden input から取得しない（信頼境界の徹底）。

### Requirement 12: 操作性とエラーハンドリング

**Objective:** 創業者として、70 セッション × 平均 8 パターン = 560 レコードを効率的にレビューしたい。これには、エラー時の適切なフィードバックと、保存後の状態反映が必要。

#### Acceptance Criteria

12.1. WHEN 手動評価フォーム保存中に DB エラーが発生した場合、THE システム SHALL 「保存に失敗しました。もう一度お試しください」と表示し、入力値をフォームに保持する。

12.2. WHEN 保存中に同じ Server Action が連続で呼ばれた場合、THE システム SHALL ボタンを `disabled` にして二重送信を防ぐ。

12.3. THE セッション一覧ページ SHALL Server Component で render され、サーバー側で集約クエリを実行してから HTML を返す（Client 側 fetch によるロード待ちを発生させない）。

12.4. THE セッション詳細ページ SHALL Server Component で初期 render し、対話履歴・回答カード・ヒートマップを 1 リクエストで取得して表示する。

12.5. WHEN 管理者がエクスポート要求を行った際にデータが大きすぎる場合（Stage 1 想定上限を超えた場合）、THE システム SHALL ストリーミングではなく単発レスポンスで返す（70 セッション × 数百レコードでは数 MB 以下に収まる想定）。

12.6. THE システム SHALL Stage 1 で自動 E2E テスト（Playwright）を導入しない。検証は管理者が `/admin/sessions` をログイン → 詳細ページ閲覧 → 1 セッションのスコア入力 → CSV エクスポートを手動で実施する手動 smoke test で完結する。
