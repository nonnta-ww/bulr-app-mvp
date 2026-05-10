# Implementation Tasks: admin-review-panel

> 実装順序: G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8。
> `(P)` は同一グループ内で並列実行可能、`_Boundary:_` は責務境界、`_Depends:_` は完了必須の前提タスク、`_Req:_` は requirements.md 上の要件 ID。
> 全ファイルパスは `bulr-app-mvp/` ルートからの相対 (実装時は絶対パス指定)。
> 前提: `authentication` / `assessment-pattern-seed` / `assessment-engine` 完了済み (`requireAdmin` / `adminAction` / `assessment_session` / `assessment_answer` / `chat_message` / `assessment_pattern` / `react-markdown` 利用可)。

## G1. 集約クエリ in packages/db

### 1.1 `session-list-query.ts` 作成 (P)
_Boundary: sessionListQuery_
_Req: 2.1, 2.2, 2.3, 8.1, 8.2_

- `packages/db/src/queries/admin/session-list-query.ts` を新規作成
- `SessionListFilters` / `SessionListRow` 型を export
- `sessionListQuery(filters)` 関数: `assessment_session` LEFT JOIN `user` (email) + 相関サブクエリで `assessment_answer` の件数 + `manual_evaluation IS NULL` 件数 + LLM 5 次元スコア平均を 1 SQL で集計
- レビューステータス計算: SQL CASE 式で `null_count = total` → `未レビュー`、`null_count = 0 && total > 0` → `レビュー済み`、`0 < null_count < total` → `一部レビュー`、`total = 0` → `回答なし`
- フィルタ適用: `reviewStatus` / `status` を WHERE 句に追加 (Drizzle の `and(...)`)
- ソート: `sortBy` (`startedAt` / `email` / `avgScore`) と `sortOrder` (`asc` / `desc`) を ORDER BY に反映
- `llm_evaluation` JSONB の値抽出は Drizzle の `sql` テンプレート + `(llm_evaluation->>'authenticity')::int` 等
- 完了状態: `import { sessionListQuery } from '@bulr/db/queries/admin'` 相当が型解決し、テスト DB に対する単発呼び出しで 70 セッション規模のレスポンスが 1 SQL で返る

### 1.2 `session-detail-query.ts` 作成 (P)
_Boundary: sessionDetailQuery_
_Req: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 8.3_

- `packages/db/src/queries/admin/session-detail-query.ts` を新規作成
- `SessionDetail` 型を export: `{ session, user, messages, answers (with pattern), reviewStatus }`
- `sessionDetailQuery(sessionId)` 関数: 3 クエリ (session+user JOIN / messages WHERE session_id ORDER BY sequence / answers JOIN patterns) を `Promise.all` で並列取得
- session 不在なら null を返す
- `reviewStatus` を answers から計算 (1.1 と同じロジック、1 関数に切り出してもよい)
- 完了状態: `sessionDetailQuery(uuid)` で全データが構造化オブジェクトとして返り、不在 sessionId で null を返す

### 1.3 `heatmap-aggregate-query.ts` 作成 (P)
_Boundary: heatmapAggregateQuery_
_Req: 6.1, 6.2, 6.4, 6.5, 6.6, 8.4_

- `packages/db/src/queries/admin/heatmap-aggregate-query.ts` を新規作成
- `HeatmapAggregate` 型を export
- `heatmapAggregateQuery(sessionId)` 関数: 3 SQL を `Promise.all`
  1. カテゴリ別平均: `SELECT pattern.category, AVG((llm_evaluation->>'authenticity')::int)::numeric, ..., COUNT(*) FROM assessment_answer JOIN assessment_pattern ON assessment_answer.pattern_id = assessment_pattern.id WHERE session_id = ? AND llm_evaluation IS NOT NULL GROUP BY pattern.category`
  2. 射程分布: `SELECT (llm_evaluation->>'scope')::int AS scope, COUNT(*) ... GROUP BY scope`
  3. AI リテラシー分布: 同様に `ai_literacy` で
- 6 カテゴリ × 5 次元、scope 1-5、ai_literacy 0-3 のキーすべてを 0 / null で初期化してから DB 結果で上書き (presence guarantee)
- 完了状態: `heatmapAggregateQuery(uuid)` が 6 カテゴリ + 5 scope + 4 literacy のキーをすべて含む構造化オブジェクトを返す

### 1.4 `session-export-query.ts` 作成 (P)
_Boundary: sessionExportQuery_
_Req: 7.4, 7.6, 8.5_

- `packages/db/src/queries/admin/session-export-query.ts` を新規作成
- `SessionExportData` 型を export
- `sessionExportQuery(sessionId)` 関数: session + user + messages + answers JOIN patterns を取得 (1.2 とほぼ同じ、`reviewStatus` 不要)
- 内部で `sessionDetailQuery` を呼んで reviewStatus を捨てる実装でもよい
- session 不在なら null
- 完了状態: `sessionExportQuery(uuid)` が `{ session, user, messages, answers }` を返す

### 1.5 `queries/admin/index.ts` バレル + `queries/` サブディレクトリ初期化
_Boundary: AdminQueriesBarrel_
_Depends: 1.1, 1.2, 1.3, 1.4_
_Req: 8.1, 8.6_

> 本タスクは `packages/db/src/queries/` サブディレクトリを最初に導入する責務を持つ（先行 spec はいずれも `queries/` を作成していない）。3 階層のバレル接続をすべて本タスクで完結させる。

- `packages/db/src/queries/admin/index.ts` を新規作成
- `export * from './session-list-query'; export * from './session-detail-query'; export * from './heatmap-aggregate-query'; export * from './session-export-query';`
- `packages/db/src/queries/index.ts` を新規作成（先行 spec で未作成のため必ず作成）し、`export * from './admin/index';` を含める
- `packages/db/src/index.ts` バレルに `export * from './queries/index';` を追加し、`@bulr/db` 直下からも全 admin クエリを参照可能にする
- 完了状態: `import { sessionListQuery, sessionDetailQuery, heatmapAggregateQuery, sessionExportQuery } from '@bulr/db'` および `from '@bulr/db/queries/admin'` の双方が型解決し、`pnpm --filter @bulr/db typecheck` が成功

## G2. セッション一覧ページ + フィルタ + ソート

### 2.1 `_components/session-list-table.tsx` 作成 (P)
_Boundary: SessionListTable_
_Depends: 1.1_
_Req: 2.1, 2.2, 2.7, 2.8_

- `apps/web/app/admin/_components/session-list-table.tsx` を新規作成 (Server Component)
- props: `rows: SessionListRow[]` (型は `@bulr/db` から re-export または同型を再宣言)
- shadcn/ui の `<Table>` を使い、カラム: 受験者メール / status / 開始時刻 / 終了時刻 / メッセージ数 / 回答数 / 平均スコア / レビューステータス / 詳細リンク
- 日付フォーマット: `Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' })`
- レビューステータスはバッジ表示 (Tailwind: `未レビュー` 赤、`一部レビュー` 黄、`レビュー済み` 緑、`回答なし` 灰)
- `rows.length === 0` なら「まだ受験セッションがありません」を表示
- 完了状態: 任意の `rows` props を渡して JSX が render、rows 0 件で空メッセージ表示

### 2.2 `_components/session-list-filters.tsx` 作成 (P)
_Boundary: SessionListFilters_
_Req: 2.4, 2.5, 2.6_

- `apps/web/app/admin/_components/session-list-filters.tsx` を新規作成 (Client Component, `'use client'`)
- props: `initial: { reviewStatus?, status?, sortBy, sortOrder }`
- shadcn/ui の `<Select>` で 「レビューステータス」「status」のドロップダウン
- `useRouter` + `useSearchParams` で URL クエリパラメータ更新 (`router.push(`?${new URLSearchParams({...}).toString()}`)`)
- 完了状態: ドロップダウン選択で URL が更新され、ページが再読込される

### 2.3 `sessions/page.tsx` 作成
_Boundary: SessionListPage_
_Depends: 1.1, 1.5, 2.1, 2.2_
_Req: 1.1, 1.2, 2.1, 2.9, 12.3_

- `apps/web/app/admin/sessions/page.tsx` を新規作成 (Server Component)
- 最初に `await requireAdmin()` を呼ぶ
- `searchParams` (Next.js 16 では `Promise<...>`) を await して Zod 検証 (`reviewStatus` / `status` / `sortBy` / `sortOrder`)
- `sessionListQuery(filters)` 呼び出し
- `<SessionListFilters initial={...} />` と `<SessionListTable rows={...} />` を render
- ページネーションなし (Stage 1 は 70 件以下を全件取得)
- 完了状態: ローカル `pnpm dev` で `/admin/sessions` にアクセスし、Basic 認証 + Magic Link 通過後にテーブルとフィルタが表示される

## G3. セッション詳細ページ (プロファイル + 対話履歴 + 回答カード)

### 3.1 `_components/profile-display.tsx` 作成 (P)
_Boundary: ProfileDisplay_
_Req: 3.3_

- `apps/web/app/admin/_components/profile-display.tsx` を新規作成 (Server Component)
- props: `profileInput: unknown`
- `import type { ProfileInput } from '@bulr/types/profile';` で正準型を取り込み、内部で軽量型ガード or zod safeParse で `Partial<ProfileInput>` (`{ yearsOfExperience?: number, languages?: Language[], systemTypes?: SystemType[] }`) を取り出す（フィールド名は `systemTypes`、`systems` ではない点に注意）
- 欠落時は各フィールドを `-` 表示
- 完了状態: `profileInput = {}` でも壊れず、`-` 表示で render。`@bulr/types/profile` の正準型と整合

### 3.2 `_components/chat-message-timeline.tsx` 作成 (P)
_Boundary: ChatMessageTimeline_
_Req: 3.4, 3.5, 3.6_

- `apps/web/app/admin/_components/chat-message-timeline.tsx` を新規作成 (Server Component)
- props: `messages: ChatMessage[]` (sequence 昇順想定)
- `role='user'`: 右寄せ青背景、テキスト表示
- `role='assistant'`: 左寄せ灰背景、`<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({...props}) => <a {...props} target='_blank' rel='noopener noreferrer' /> }}>{content}</ReactMarkdown>`
- `role='tool'`: 左寄せ緑バッジ + `<pre>{JSON.stringify(toolCalls, null, 2)}</pre>`
- 各メッセージに `created_at` を小さく表示
- `overflow-y-auto` でスクロール可能
- 完了状態: 200 メッセージの mock データで render が崩れない

### 3.3 `_components/eval-comparison.tsx` 作成 (P)
_Boundary: EvalComparison_
_Req: 4.5_

- `apps/web/app/admin/_components/eval-comparison.tsx` を新規作成 (Server Component)
- props: `llm: LlmEvaluation | null; manual: ManualEvaluation | null`
- 5 次元 (authenticity / judgment / scope / meta_cognition / ai_literacy) を 1 行 3 列 (LLM / 手動 / 差分) で表示
- 差分 = `manual - llm`、絶対値が `0` でない次元の行に Tailwind `bg-yellow-50` を適用
- どちらかが null なら「LLM 未評価」または「手動未評価」表示
- 完了状態: llm/manual 両方 / 片方 / 両方 null の 4 ケースで render

### 3.4 `_components/manual-eval-form.tsx` 作成
_Boundary: ManualEvalForm_
_Depends: 4.1 (G4)_
_Req: 5.1, 5.2, 5.5, 5.6, 12.1, 12.2_

- `apps/web/app/admin/_components/manual-eval-form.tsx` を新規作成 (Client Component, `'use client'`)
- props: `assessmentAnswerId: string; initial?: ManualEvaluation`
- `<form>` 内に 5 つの number input (min/max/step=1) + textarea (maxLength=2000) + 保存ボタン
- `useTransition` で送信中状態管理、isPending 中はボタン disabled
- `onSubmit`: `updateManualEvaluation` Server Action を呼び出し、結果が `{ ok: false, fieldErrors }` ならフィールドエラー表示、`{ ok: true }` なら「保存しました」インライン表示
- DB エラー時 (`{ ok: false, error: 'db_error' }`) は「保存に失敗しました。もう一度お試しください」表示、入力値保持
- 完了状態: 単独で render し、未入力で送信時のクライアント側 HTML5 validation が効く

### 3.5 `_components/answer-card.tsx` 作成
_Boundary: AnswerCard_
_Depends: 3.3, 3.4_
_Req: 4.1, 4.2, 4.3, 4.4_

- `apps/web/app/admin/_components/answer-card.tsx` を新規作成 (Server Component)
- props: `answer: AssessmentAnswer & { pattern: AssessmentPattern }`
- 上部: パターンコード (`D-01` 等) + カテゴリバッジ + パターンタイトル + level_reached + stuck_type (NULL なら非表示)
- 中央: 4 段階回答 `level_1_answer` 〜 `level_4_answer` を縦に表示、各段階タイトル付き、`whitespace-pre-wrap` で改行保持、`max-h-64 overflow-y-auto` でスクロール
- 下部: `<EvalComparison llm={answer.llmEvaluation} manual={answer.manualEvaluation} />`
- 最下部: `<ManualEvalForm assessmentAnswerId={answer.id} initial={answer.manualEvaluation} />`
- カードは Tailwind の border + padding + rounded で囲む
- 完了状態: 1 つの answer + pattern を渡して全要素が表示される

### 3.6 `sessions/[id]/page.tsx` 作成
_Boundary: SessionDetailPage_
_Depends: 1.2, 1.3, 1.5, 3.1, 3.2, 3.5, 5.1 (G5)_
_Req: 1.1, 1.2, 3.1, 3.2, 3.7, 4.1, 6.1, 12.4_

- `apps/web/app/admin/sessions/[id]/page.tsx` を新規作成 (Server Component)
- 最初に `await requireAdmin()` を呼ぶ
- `params` を await、`id` を `z.string().uuid()` 検証、不正なら `notFound()`
- `Promise.all` で `sessionDetailQuery(id)` + `heatmapAggregateQuery(id)` を並列取得
- detail null なら `notFound()`
- メタ情報ヘッダー (受験者メール、status バッジ、開始/終了時刻、所要時間、メッセージ数、回答パターン数、レビューステータス) をインラインで render
- `<ProfileDisplay />` + `<ExportButtons sessionId={id} />` (内部に小さな関数として page.tsx 内に定義) + `<Heatmap data={...} />` + `<ChatMessageTimeline messages={...} />` + `answers.map(a => <AnswerCard ... />)` の順で render
- 完了状態: ローカルで任意セッションの `/admin/sessions/[id]` にアクセスし、全セクションが表示される

## G4. 手動評価 Server Action

### 4.1 `_actions/schemas.ts` + `update-manual-evaluation.ts` 作成
_Boundary: UpdateManualEvaluationAction_
_Depends: 1.5_
_Req: 5.3, 5.4, 5.7, 5.8, 11.1, 11.6, 12.1_

- `apps/web/app/admin/_actions/schemas.ts` を新規作成
- `manualEvaluationInputSchema`: `z.object({ assessmentAnswerId: z.string().uuid(), authenticity: z.number().int().min(0).max(3), judgment: z.number().int().min(0).max(3), scope: z.number().int().min(1).max(5), meta_cognition: z.number().int().min(0).max(3), ai_literacy: z.number().int().min(0).max(3), notes: z.string().max(2000) })`
- `exportFormatSchema`: `z.enum(['csv', 'json'])`
- 両 schema を export
- `apps/web/app/admin/_actions/update-manual-evaluation.ts` を新規作成 (`'use server'` 宣言)
- `adminAction(manualEvaluationInputSchema, async ({ assessmentAnswerId, ...scores }, { userId, email }) => { ... })` 形式
- DB 確認: `db.query.assessmentAnswer.findFirst({ where: eq(...id), columns: { id: true, sessionId: true } })`
- 不在なら `{ ok: false, error: 'not_found' as const }`
- 存在すれば `db.update(assessmentAnswer).set({ manualEvaluation: { ...scores, reviewer: email, reviewed_at: new Date().toISOString() }, updatedAt: new Date() }).where(eq(...id))`
- `revalidatePath(`/admin/sessions/${existing.sessionId}`)` で詳細ページキャッシュ無効化
- `{ ok: true as const }` 返却
- 完了状態: 任意の `assessmentAnswerId` で Server Action を呼び、DB の `manual_evaluation` カラムに正しい構造で書き込まれ、reviewer に管理者 email、reviewed_at に ISO 8601 が入る

## G5. ヒートマップ + LLM vs 手動の並列表示

### 5.1 `_components/heatmap.tsx` 作成
_Boundary: Heatmap_
_Depends: 1.3_
_Req: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- `apps/web/app/admin/_components/heatmap.tsx` を新規作成 (Server Component)
- props: `data: HeatmapAggregate`
- セクション 1: カテゴリ別平均
  - 6 カテゴリ × 5 次元の格子 (CSS grid `grid-cols-6` または table)
  - 各セルに数値 (小数第 1 位) + CSS 横棒 (`<div style={{ width: `${(value / maxValue) * 100}%`, height: '8px', background: 'currentColor' }} />`)
  - maxValue: authenticity/judgment/meta_cognition/ai_literacy = 3、scope = 5
  - データ 0 件のカテゴリは `-` 表示
- セクション 2: 射程分布 (scope 1-5 の横棒)
  - 5 行のヒストグラム、各行に値 + 件数 + 横棒
  - maxCount は 5 行の最大件数
- セクション 3: AI リテラシー分布 (ai_literacy 0-3 の横棒)
  - 同様に 4 行のヒストグラム
- 全体で 0 件 (3 セクションすべて空) なら「集計可能なデータがありません」を表示
- グラフライブラリは使わず Tailwind + inline style のみ
- 完了状態: 任意の `data` props で 3 セクションが render、データ 0 件メッセージも切り替わる

> EvalComparison は 3.3 で実装済み (回答カードに含まれる、ヒートマップとは別コンポーネント)。

## G6. CSV / JSON エクスポート Route Handler

### 6.1 `sessions/[id]/export/route.ts` 作成
_Boundary: SessionExportRoute_
_Depends: 1.4, 4.1_
_Req: 1.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 11.3, 11.4, 12.5_

- `apps/web/app/admin/sessions/[id]/export/route.ts` を新規作成
- `export async function GET(request, { params })` のみ実装
- 最初に `await requireAdmin()` を呼ぶ (失敗時は `AuthError` を Next.js が 401/403 に変換、または try/catch で明示)
- `params.id` を `z.string().uuid()` 検証、不正なら 400 + `{ error: 'invalid id' }`
- `URL(request.url).searchParams.get('format')` を `exportFormatSchema` で検証、不正なら 400 + `{ error: 'format must be csv or json' }`
- `sessionExportQuery(id)` 呼び出し、null なら 404 + `{ error: 'session not found' }`
- format = 'csv':
  - 同ファイル内に `escapeCsvField(s)` 純関数: 値に `,` `"` `\r` `\n` を含む場合のみ全体 `"` 囲み + 内部 `"` を `""` にエスケープ
  - 同ファイル内に `buildCsv(data)` 関数: ヘッダー行 + 各 answer 行を `\r\n` 結合
  - CSV カラム (ヘッダー = 各カラム名): `session_id, examinee_email, session_status, session_started_at, session_completed_at, pattern_code, pattern_category, pattern_title, level_reached, stuck_type, level_1_answer, level_2_answer, level_3_answer, level_4_answer, llm_authenticity, llm_judgment, llm_scope, llm_meta_cognition, llm_ai_literacy, llm_notes, llm_evaluated_at, manual_authenticity, manual_judgment, manual_scope, manual_meta_cognition, manual_ai_literacy, manual_notes, manual_reviewer, manual_reviewed_at`
  - `llm_evaluation` / `manual_evaluation` JSONB から各値を取り出し、欠落は空文字
  - レスポンス: `new Response('﻿' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="session-${id}.csv"` } })` (UTF-8 BOM 付き)
- format = 'json':
  - `JSON.stringify({ session, messages, answers }, null, 2)`
  - レスポンス: `new Response(json, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="session-${id}.json"` } })`
- 完了状態: `/admin/sessions/[id]/export?format=csv` で UTF-8 BOM + CRLF の CSV がダウンロードでき、Excel で文字化けせず開ける。`?format=json` で `jq .` 整形可能な JSON が返る。未認証直 URL アクセスは 401/403。`?format=xml` 等の不正値は 400。

## G7. 認証 spec の smoke test ページ撤去

### 7.1 `/admin/_health/` ディレクトリ削除
_Boundary: HealthPageRemoval_
_Req: 10.1, 10.2, 10.3_

- `apps/web/app/admin/_health/page.tsx` を削除
- `apps/web/app/admin/_health/` ディレクトリも削除 (空であれば)
- コミットメッセージに「authentication spec の smoke test page を撤去 (admin-review-panel が `/admin/sessions` を実装済みのため)」を明記
- 削除後 `/admin/_health` URL が 404 を返すことをローカルで確認
- 完了状態: `apps/web/app/admin/` 配下に `_health/` が存在しない、git diff で削除が確認できる

## G8. 検証 (手動 smoke test)

### 8.1 `/admin/sessions` 一覧の手動確認
_Boundary: ManualSmokeList_
_Depends: 2.3_
_Req: 1.1, 1.2, 2.1-2.9, 12.3_

- `pnpm dev` 起動
- ブラウザで `http://localhost:3000/admin/sessions` にアクセス → Basic 認証ダイアログが出ることを確認
- `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` を入力 → 通過
- 未認証なら `/admin/login` にリダイレクト、`ADMIN_ALLOWED_EMAILS` に含まれるメールで Magic Link サインイン
- セッション一覧テーブルが表示され、列 (受験者メール / status / 開始時刻 / 終了時刻 / メッセージ数 / 回答数 / 平均スコア / レビューステータス / 詳細リンク) が見えることを確認
- フィルタドロップダウンで「未レビュー」を選択 → URL に `?reviewStatus=未レビュー` が反映 + テーブルが絞り込まれることを確認
- ソートカラムをクリック → URL の `sortBy` が変わり、表示順が変わることを確認
- セッション 0 件の状態で「まだ受験セッションがありません」が表示されることを確認 (DB を空にして再現)
- `ADMIN_ALLOWED_EMAILS` に含まれないメールでサインインしたユーザーが `/admin/sessions` にアクセス → 403 ページ表示を確認
- 完了状態: 上記 7 ケースが手動で確認でき、すべて期待通りの挙動

### 8.2 `/admin/sessions/[id]` 詳細の手動確認
_Boundary: ManualSmokeDetail_
_Depends: 3.6_
_Req: 1.1, 1.2, 3.1-3.7, 4.1-4.5, 6.1-6.7, 12.4_

- 一覧から任意のセッションをクリック → `/admin/sessions/[id]` に遷移
- メタ情報ヘッダー (受験者メール、status、開始/終了時刻、所要時間、メッセージ数、回答パターン数、レビューステータス) が表示されることを確認
- 受験プロファイルが整形表示されることを確認 (経験年数、言語複数、システム種別複数)
- profile_input が `{}` の壊れたセッションでも `-` 表示で落ちないことを確認 (テストデータで再現)
- 対話履歴タイムラインで user / assistant / tool の視覚区別が効くことを確認、assistant の Markdown が render されることを確認
- 各 AnswerCard でパターンコード + カテゴリバッジ + 4 段階回答 + LLM 評価が表示されることを確認
- ヒートマップで 6 カテゴリ + 射程分布 + AI リテラシー分布が CSS 横棒で表示されることを確認
- LLM 評価のないセッションでヒートマップが「集計可能なデータがありません」表示になることを確認
- 存在しない sessionId (`/admin/sessions/00000000-0000-0000-0000-000000000000`) で 404 ページ表示
- `/admin/sessions/invalid-uuid` で 404 ページ表示 (Zod uuid 検証)
- 完了状態: 上記 9 ケースが手動で確認でき、すべて期待通りの挙動

### 8.3 手動評価入力 + LLM vs 手動表示の手動確認
_Boundary: ManualSmokeManualEval_
_Depends: 3.6, 4.1_
_Req: 4.5, 5.1-5.8, 11.1, 11.6, 12.1, 12.2_

- 詳細ページの 1 つの AnswerCard で、5 次元スコア (authenticity=2, judgment=3, scope=4, meta_cognition=1, ai_literacy=2) + notes "テストレビュー" を入力 → 保存
- 保存中はボタン disabled になることを確認
- 「保存しました」インライン表示が出る + ページが自動再読込される
- 再表示後、EvalComparison で LLM スコア / 手動スコア / 差分が表示され、差分 0 でない次元の行に背景色が付くことを確認
- DB を直接確認: `SELECT manual_evaluation FROM assessment_answer WHERE id = ?` で `{ authenticity: 2, judgment: 3, scope: 4, meta_cognition: 1, ai_literacy: 2, notes: 'テストレビュー', reviewer: '管理者メール', reviewed_at: 'ISO8601' }` が入っていることを確認
- フォームに不正値 (scope=10) を直接 fetch で送信 → Zod 検証で 拒否されることを確認 (DevTools の Network タブで Server Action リクエストの response を見る)
- 同じ answer を再保存 → reviewer / reviewed_at が更新されることを確認
- 完了状態: 上記 6 ケースが手動で確認でき、特に reviewer がフォーム入力ではなくサーバー側 email から取得されていることを DB 値で確認

### 8.4 CSV / JSON エクスポートの手動確認
_Boundary: ManualSmokeExport_
_Depends: 6.1_
_Req: 1.4, 7.1-7.8, 11.3, 11.4_

- 詳細ページの「CSV ダウンロード」ボタンをクリック → 新規タブで `session-{id}.csv` がダウンロードされることを確認
- ダウンロード CSV を Excel (または Numbers / Google Sheets) で開く → 文字化けなく日本語が表示されることを確認 (UTF-8 BOM が効いている)
- CSV のヘッダー行 + 1 セッション分の各 answer が 1 行で展開され、すべての設計上カラムが含まれることを確認
- 「JSON ダウンロード」ボタンをクリック → `session-{id}.json` がダウンロード
- ターミナルで `jq . session-{id}.json` 実行 → `session` / `messages` / `answers` の 3 トップレベルキーが整形表示されることを確認
- 未認証で `/admin/sessions/{id}/export?format=csv` を直 URL アクセス (シークレットウィンドウ) → 401 / 403 で拒否されることを確認
- `/admin/sessions/{id}/export?format=xml` で 400 + `{ error: 'format must be csv or json' }` が返ることを確認
- `/admin/sessions/invalid-uuid/export?format=csv` で 400 + `{ error: 'invalid id' }` が返ることを確認
- 存在しない sessionId で `?format=csv` 要求 → 404 + `{ error: 'session not found' }` が返ることを確認
- 完了状態: 上記 8 ケースが手動で確認でき、Excel で文字化けせず開けるという最終要件も達成
