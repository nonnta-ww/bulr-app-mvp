# Implementation Plan — admin-review-panel

> 凡例: `(P)` は並列実行可能タスク、`_Boundary:_` は所有コンポーネント、`_Depends:_` は前提タスク。各サブタスクは 1-3 時間で完了し、観察可能な完了状態を持つ。

## G1. 集約クエリの実装と 3 階層バレルチェーン構築（packages/db）

- [x] 1.1 _Lib_ 共通レビューステータス判定純関数を実装する `apps/web/app/admin/_lib/review-status.ts`
  - `computeReviewStatus(pendingCount: number, totalCount: number): 'pending' | 'partial' | 'reviewed'` 純関数
  - `totalCount === 0 || pendingCount === totalCount` → `'pending'`、`0 < pendingCount && pendingCount < totalCount` → `'partial'`、`pendingCount === 0 && totalCount > 0` → `'reviewed'`
  - 完了状態: ファイルが存在し、TypeScript で型エラーなし
  - _Requirements: 1.3, 2.7_
  - _Boundary: ReviewStatus_

- [x] 1.2 (P) _Query_ セッション一覧集約クエリ `packages/db/src/queries/admin/session-list-query.ts` を実装する
  - 引数 `{ reviewStatus, status, sortBy, sortOrder }` を受け、Drizzle ORM のみで `interview_session` を起点に `candidate`、`user`、`pattern_coverage`（COUNT total / COUNT manual_evaluation IS NULL = pending / AVG llm_evaluation 5 次元の平均）、`interview_turn`（COUNT total）を JOIN または `with` 句で集約
  - `status = 'draft'` のセッションは除外
  - `computeReviewStatus(pending, total)` でレビューステータス算出
  - フィルタ（reviewStatus + status）を AND 条件で適用、ソート（sortBy + sortOrder、avg_score NULL は両順序で末尾）
  - 戻り値: `SessionListItem[]`（`{ id, candidate_name, interviewer_email, status, started_at, completed_at, turn_count, avg_score, review_status }`）
  - 完了状態: クエリ関数 export され、Drizzle 型エラーなし、生 SQL 不使用
  - _Requirements: 1.3, 1.5, 1.6, 2.4, 2.7, 3.1-3.7, 9.2, 9.3, 9.6, 9.7_
  - _Depends: 1.1_
  - _Boundary: SessionListQuery_

- [x] 1.3 (P) _Query_ セッション詳細集約クエリ `packages/db/src/queries/admin/session-detail-query.ts` を実装する
  - 引数 `sessionId: string`、Drizzle ORM のみ
  - `interview_session` + `candidate` + `user`（面接官）+ `user_profile` + `interview_turn[]`（sequence_no 昇順）+ `pattern_coverage[]`（pattern_code 昇順）+ 関連 `assessment_pattern` を 1-3 クエリに集約
  - session が存在しなければ `null` を返す
  - 戻り値: `SessionDetail | null`
  - 完了状態: クエリ関数 export され、N+1 がないことを確認（クエリ回数 ≤ 3）
  - _Requirements: 4.5, 4.6, 4.7, 4.9, 9.4, 9.6, 9.7_
  - _Boundary: SessionDetailQuery_

- [x] 1.4 _Barrel_ admin queries サブディレクトリのバレルを作成する `packages/db/src/queries/admin/index.ts`
  - `export * from './session-list-query';` `export * from './session-detail-query';`
  - 完了状態: ファイルが存在し、import からの参照が解決する
  - _Requirements: 9.1, 9.5_
  - _Depends: 1.2, 1.3_
  - _Boundary: AdminBarrel_

- [x] 1.5 _Barrel_ queries バレルに admin サブディレクトリを追加する `packages/db/src/queries/index.ts`
  - 既存の `export * from './interview/index';` を保ったまま、`export * from './admin/index';` を追加
  - 完了状態: `import { sessionListQuery } from '@bulr/db/queries/admin'` と `import { sessionListQuery } from '@bulr/db'`（ルートバレル経由）の両方で解決する
  - _Requirements: 9.5_
  - _Depends: 1.4_
  - _Boundary: QueriesBarrel_

- [x] 1.6 _Barrel_ db ルートバレルに queries を含めることを確認 `packages/db/src/index.ts`（冪等処理）
  - `export * from './queries/index';` が既に存在する場合は変更なし、なければ追加
  - 完了状態: `import { sessionListQuery } from '@bulr/db'` が解決する
  - _Requirements: 9.5_
  - _Depends: 1.5_
  - _Boundary: QueriesBarrel_

## G2. セッション一覧ページ + フィルタ + ソート

- [x] 2.1 (P) _Lib_ 一覧ページの URL クエリパラメータ Zod スキーマと parser を実装する `apps/web/app/admin/_lib/list-query-params.ts`
  - `listQueryParamsSchema = z.object({ reviewStatus: z.enum([...]).default('all'), status: z.enum([...]).default('all'), sortBy: z.enum(['started_at', 'candidate_name', 'avg_score']).default('started_at'), sortOrder: z.enum(['asc', 'desc']).default('desc') })`
  - `parseListQueryParams(searchParams)` 関数: 配列値を最初の要素に正規化 → `safeParse` → 失敗時はデフォルト値で返却（fail secure）
  - `export type ListQueryParams = z.infer<typeof listQueryParamsSchema>`
  - 完了状態: 不正値（`?reviewStatus=invalid`）でデフォルト値が返ることをコメントで明記
  - _Requirements: 2.5, 2.6, 3.5, 3.6_
  - _Boundary: ListQueryParams_

- [x] 2.2 (P) _UI_ セッション一覧テーブル Server Component を実装する `apps/web/app/admin/_components/session-list-table.tsx`
  - props: `{ items: SessionListItem[] }`
  - 列: 候補者名 / 面接官 email / status / 開始時刻 / 終了時刻 / ターン数 / 平均スコア / レビューステータス
  - `started_at` / `completed_at` は ISO 文字列を読みやすい形式（YYYY-MM-DD HH:mm）に整形
  - 平均スコア NULL の場合は「-」、ターン数 0 / coverage 0 でもエラー出さず「-」または「0」
  - 各行に `/admin/sessions/[id]` への Next.js `<Link>` を提供
  - items が 0 件なら「セッションがありません」表示
  - 完了状態: テスト用 mock データで描画、TypeScript 型エラーなし
  - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_
  - _Boundary: SessionListTable_

- [x] 2.3 (P) _UI_ フィルタ + ソート Client Component を実装する `apps/web/app/admin/_components/session-list-filters.tsx`
  - `'use client'` 指定
  - props: `{ current: ListQueryParams }`
  - レビューステータス select（全件 / 未レビュー / 一部レビュー / レビュー済み）+ status select（全件 / in_progress / completed / abandoned）
  - sortBy select（開始時刻 / 候補者名 / 平均スコア）+ sortOrder select（昇順 / 降順）
  - 値変更時に `useRouter().push('/admin/sessions?' + new URLSearchParams({ reviewStatus, status, sortBy, sortOrder }))` で URL 更新
  - 完了状態: フィルタ操作で URL クエリパラメータが更新される
  - _Requirements: 2.1-2.5, 3.1-3.5_
  - _Depends: 2.1_
  - _Boundary: SessionListFilters_

- [x] 2.4 _Page_ セッション一覧ページを実装する `apps/web/app/admin/sessions/page.tsx`
  - `await requireAdmin()` を最初に呼ぶ（多層認証 Layer 2）
  - `searchParams` を `parseListQueryParams` で Zod 検証 + デフォルト値適用
  - `sessionListQuery(params)` を呼び結果を取得
  - `<SessionListFilters current={params} />` を上部、`<SessionListTable items={items} />` を下部に配置
  - 完了状態: `pnpm dev` 起動 → `/admin/sessions` で一覧が描画される、フィルタとソートが機能する
  - _Requirements: 1.1, 1.2, 1.7, 2.3, 2.4, 3.4, 10.1, 13.1, 13.2_
  - _Depends: 1.5, 2.1, 2.2, 2.3_
  - _Boundary: SessionListPage_

## G3. セッション詳細ページ（候補者 + 面接官 + chat timeline + answer cards）

- [x] 3.1 (P) _UI_ 候補者情報表示 Server Component を実装する `apps/web/app/admin/_components/profile-display.tsx`
  - props: `{ candidate: CandidateInfo }`（`@bulr/types/profile` から import）
  - name / applied_role / background_summary を表示、email がある場合のみ追加表示
  - 完了状態: テスト用 mock データで描画、TypeScript 型エラーなし
  - _Requirements: 4.3, 11.5_
  - _Boundary: ProfileDisplay_

- [x] 3.2 (P) _UI_ 面接官情報表示 Server Component を実装する `apps/web/app/admin/_components/interviewer-display.tsx`
  - props: `{ interviewer: { email: string; display_name: string; role_in_org?: string } }`（`InterviewerProfile` 型を `@bulr/types/profile` から import）
  - display_name / role_in_org / email を表示
  - 完了状態: テスト用 mock データで描画
  - _Requirements: 4.4, 11.5_
  - _Boundary: InterviewerDisplay_

- [ ] 3.3 (P) _UI_ interview_turn 時系列表示 Server Component を実装する `apps/web/app/admin/_components/chat-message-timeline.tsx`
  - props: `{ turns: InterviewTurn[] }`（sequence_no 昇順を期待）
  - 各ターンで question_text / question_source / candidate transcript / pattern_match_confidence / off_pattern_summary（off_pattern の場合のみ）/ pattern_id（紐づく場合は assessment_pattern.code も併記）/ duration_ms / created_at を表示
  - 完了状態: テスト用 mock データで描画
  - _Requirements: 4.5, 4.6_
  - _Boundary: ChatMessageTimeline_

- [ ] 3.4 (P) _UI_ 面接官向けレポートへのリンク Server Component を実装する `apps/web/app/admin/_components/report-link.tsx`
  - props: `{ sessionId: string }`
  - `<a href={`/interviews/${sessionId}/report`} target="_blank" rel="noopener noreferrer">` で別タブ遷移
  - 完了状態: テスト用 mock で描画、リンク先 URL が正しい
  - _Requirements: 4.8_
  - _Boundary: ReportLink_

## G4. 手動評価フォーム + Server Action

- [ ] 4.1 _Lib_ 手動評価入力 Zod スキーマを実装する `apps/web/app/admin/_lib/manual-evaluation-schema.ts`
  - `manualEvaluationSchema` 構造（`patternCoverageId`、5 次元整数値域、level_reached、stuck_type、notes 5000 文字）を定義
  - authenticity/judgment/meta_cognition/ai_literacy: 0-3、scope: 1-5、level_reached: 0-4、stuck_type: enum or null、notes: max 5000 chars
  - `export type ManualEvaluationInput = z.infer<typeof manualEvaluationSchema>`
  - 完了状態: スキーマが Server Action と Form の両方から import 可能
  - _Requirements: 5.6, 6.3, 6.11_
  - _Boundary: ManualEvaluationSchema_

- [ ] 4.2 _Action_ 手動評価保存 Server Action を実装する `apps/web/app/admin/_actions/update-manual-evaluation.ts`
  - ファイル先頭に `'use server'` 指定
  - `adminAction(manualEvaluationSchema, async (input, { email, userId }) => { ... })` でラップ（authentication spec の adminAction ctx は flat shape）
  - `reviewer = email` をサーバー側で固定（フォーム入力からは取得しない、信頼境界、ctx から直接）
  - `reviewed_at = new Date().toISOString()`
  - `db.update(patternCoverage).set({ manualEvaluation: ManualEvaluation }).where(eq(patternCoverage.id, input.patternCoverageId)).returning({ sessionId: patternCoverage.sessionId })`
  - 0 rows affected なら `{ ok: false, error: 'NOT_FOUND' }` を返す
  - 成功時 `revalidatePath(`/admin/sessions/${updated[0].sessionId}`)`、`{ ok: true }` を返す
  - 完了状態: Server Action が export され、`adminAction` 経由のみで呼び出し可能、ログに reviewer が記録される
  - _Requirements: 6.1-6.11, 10.4, 13.4_
  - _Depends: 4.1_
  - _Boundary: UpdateManualEvaluationAction_

- [ ] 4.3 _UI_ 手動評価入力フォーム Client Component を実装する `apps/web/app/admin/_components/manual-eval-form.tsx`
  - `'use client'` 指定
  - props: `{ patternCoverageId: string, initial?: ManualEvaluation, llmEvaluation: LlmEvaluation }`
  - フィールド: authenticity / judgment / scope / meta_cognition / ai_literacy（数値 input、初期値は initial があればそれ、なければ llmEvaluation 値）+ notes（textarea、最大 5000 文字、文字数カウンタ）
  - level_reached / stuck_type は LLM 値をプリセット（ManualEvaluation 型の必須フィールドのため）
  - `manualEvaluationSchema` で `onChange` 検証 → ボタン無効化制御、エラーメッセージ表示
  - 送信は `useTransition` でローディング表示、保存中はボタン無効化
  - `updateManualEvaluation(input)` の戻り値に応じて成功/失敗メッセージ表示、入力値保持
  - 採用推奨フィールドを持たない（仕様準拠）
  - 完了状態: フォームから保存して DB の manual_evaluation JSONB に値が記録される、エラー時にメッセージ表示
  - _Requirements: 5.1-5.12_
  - _Depends: 4.1, 4.2_
  - _Boundary: ManualEvalForm_

## G5. LLM vs 手動 並列表示 + 差分ハイライト

- [ ] 5.1 _UI_ LLM vs 手動 並列比較表 Server Component を実装する `apps/web/app/admin/_components/eval-comparison.tsx`
  - props: `{ llm: LlmEvaluation, manual?: ManualEvaluation | null }`
  - 5 次元（authenticity / judgment / scope / meta_cognition / ai_literacy）を行とし、列に「LLM」「手動」「差分」
  - 手動 == null なら「-」表示
  - 差分 = manual[dim] - llm[dim]、差分 != 0 の行に `<tr className="bg-yellow-50">`、差分 == 0 は通常背景
  - LLM notes / 手動 notes / evaluated_at / reviewed_at + reviewer email を比較表の下に表示
  - 採用推奨を表示しない
  - 完了状態: テスト用 mock で描画、差分ハイライトが正しく機能する
  - _Requirements: 7.1-7.8_
  - _Boundary: EvalComparison_

- [ ] 5.2 _UI_ pattern_coverage カード Server Component を実装する `apps/web/app/admin/_components/answer-card.tsx`
  - props: `{ coverage: { pattern: AssessmentPattern, levelReached, stuckType, llmEvaluation, manualEvaluation, ... } }`（Drizzle inference 由来の camelCase プロパティ）
  - パターンコード / levelReached / stuckType（NULL なら「詰まりなし」）を表示
  - `<EvalComparison llm={coverage.llmEvaluation} manual={coverage.manualEvaluation} />`
  - `<ManualEvalForm patternCoverageId={coverage.id} initial={coverage.manualEvaluation} llmEvaluation={coverage.llmEvaluation} />`
  - 完了状態: 単一 coverage の表示確認
  - _Requirements: 4.7_
  - _Depends: 4.3, 5.1_
  - _Boundary: AnswerCard_

- [ ] 5.3 _Page_ セッション詳細ページを実装する `apps/web/app/admin/sessions/[id]/page.tsx`
  - `await requireAdmin()` を最初に呼ぶ（多層認証 Layer 2）
  - params の `id` を Zod 検証（不正なら `notFound()`）
  - `sessionDetailQuery(id)` 結果が null なら `notFound()`
  - 順番に: セクションタイトル / `<ProfileDisplay candidate />` / `<InterviewerDisplay interviewer />` / セッションメタ情報（status / 開始時刻 / 終了時刻 / 所要時間 / ターン数 / coverage 数 / フリー質問数 / planned_pattern_codes / consent_obtained_at / consent_version）/ `<ChatMessageTimeline turns />` / 各 coverage に `<AnswerCard coverage={c} />` / `<ReportLink sessionId={id} />` を描画
  - ヒートマップは表示しない
  - 完了状態: `pnpm dev` 起動 → `/admin/sessions/[id]` で詳細が描画される、面接官向けレポートリンクが機能する
  - _Requirements: 4.1, 4.2, 4.5, 4.8, 4.9, 4.10, 4.11, 10.2, 13.1, 13.2_
  - _Depends: 1.5, 3.1, 3.2, 3.3, 3.4, 5.2_
  - _Boundary: SessionDetailPage_

## G6. CSV / JSON エクスポート endpoint

- [ ] 6.1 (P) _Lib_ CSV 整形純関数を実装する `apps/web/app/admin/_lib/csv-export.ts`
  - `escapeCsvField(value: string | number | null | undefined): string` 純関数（RFC 4180 準拠、ダブルクォート / カンマ / 改行を含む値はダブルクォート囲み + 内部のダブルクォートを `""` にエスケープ、null/undefined は空文字）
  - `buildCsvFromCoverages(detail: SessionDetail): string` 純関数：ヘッダー行 + 各 coverage 1 行を CRLF で join、先頭に UTF-8 BOM (`﻿`) 付与
  - 列定義: session_id, candidate_name, candidate_applied_role, interviewer_email, pattern_code, pattern_category, level_reached, stuck_type, llm_authenticity, llm_judgment, llm_scope, llm_meta_cognition, llm_ai_literacy, llm_notes, llm_evaluated_at, manual_authenticity, manual_judgment, manual_scope, manual_meta_cognition, manual_ai_literacy, manual_notes, reviewer, reviewed_at
  - 採用推奨列を含めない
  - 完了状態: 関数 export、純関数として副作用なし、papaparse 不使用
  - _Requirements: 8.5-8.9, 8.16, 8.17, 13.5_
  - _Boundary: CsvExport_

- [ ] 6.2 (P) _Lib_ JSON 整形純関数を実装する `apps/web/app/admin/_lib/json-export.ts`
  - `buildJsonFromSession(detail: SessionDetail): SessionExportJson` 純関数
  - 出力構造: `{ session: { id, status, started_at, completed_at, planned_pattern_codes, consent_obtained_at, consent_version, ... }, candidate: { name, applied_role, background_summary, email? }, interviewer: { email, display_name, role_in_org }, coverages: [ { pattern_code, pattern_category, level_reached, stuck_type, llm_evaluation, manual_evaluation? }, ... ] }`
  - 未評価の manual_evaluation は null
  - 採用推奨を含めない
  - 完了状態: 関数 export、JSON.stringify で正常な JSON が生成される
  - _Requirements: 8.10, 8.15_
  - _Boundary: JsonExport_

- [ ] 6.3 _Route_ CSV/JSON エクスポート Route Handler を実装する `apps/web/app/admin/sessions/[id]/export/route.ts`
  - `runtime: 'nodejs'` を明示
  - `GET` ハンドラ
  - `await requireAdmin()` を最初に呼ぶ（Layer 2 多層防御、URL 直接アクセス禁止）
  - `params.id` を Zod 検証
  - `?format` を Zod 検証（`csv` | `json`）、不正なら 400 Bad Request
  - `sessionDetailQuery(id)` を呼び、null なら 404 Not Found
  - format=csv: `buildCsvFromCoverages(detail)` → `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="bulr-session-{id}.csv"`
  - format=json: `JSON.stringify(buildJsonFromSession(detail), null, 2)` → `Content-Type: application/json; charset=utf-8` + `Content-Disposition: attachment; filename="bulr-session-{id}.json"`
  - 完了状態: `/admin/sessions/[id]/export?format=csv` で CSV ダウンロードでき Excel で開いて文字化けしない、`?format=json` で JSON ダウンロードでき構造が仕様通り、認証なしで 401/403、format invalid で 400、session 不存在で 404
  - _Requirements: 8.1-8.16, 10.3, 13.5_
  - _Depends: 1.3, 1.5, 6.1, 6.2_
  - _Boundary: ExportRoute_

## G7. smoke test ページの冪等削除

- [ ] 7.1 _Filesystem_ smoke test ページを冪等削除する `apps/web/app/admin/_health/`
  - `apps/web/app/admin/_health/` ディレクトリを削除（既に削除済みなら処理スキップ、冪等処理）
  - bash `rm -rf apps/web/app/admin/_health/` または手動削除を実行
  - 削除後の検証として `pnpm dev` 起動 → `/admin/_health` への手動アクセスで 404 が返ることを確認
  - 完了状態: ディレクトリが存在しないこと、`/admin/_health` で 404 が返ること
  - _Requirements: 12.1-12.4_
  - _Boundary: AdminHealthDelete_

## G8. 検証（手動 smoke test）

- [ ] 8.1 _Smoke_ 認証 + 一覧ページ動作確認
  - `pnpm dev` 起動
  - 許可メールでサインインして `/admin/sessions` に到達できることを確認（ST-1）
  - `/admin/sessions` で全セッションが一覧表示されること（候補者名 / 面接官 email / status / 開始時刻 / ターン数 / 平均スコア / レビューステータスが正しい）（ST-3）
  - 完了状態: スクリーンショットで確認
  - _Requirements: 1.1-1.7, 2.7, 10.1, 14.2_
  - _Depends: 2.4_

- [ ] 8.2 _Smoke_ フィルタ + ソート + URL 直接アクセス動作確認
  - レビューステータス + status を変更すると URL が変わり一覧が再描画されること（ST-4）
  - 各ソートキー + 順序で一覧が並び替わること（ST-5）
  - `?reviewStatus=invalid&sortBy=invalid` でアクセスしてもデフォルト値で表示されること（ST-6）
  - 完了状態: 各操作後の URL とテーブル状態を確認
  - _Requirements: 2.1-2.7, 3.1-3.7, 14.2_
  - _Depends: 2.4_

- [ ] 8.3 _Smoke_ 詳細ページ + 手動評価入力 + 並列比較 + レビューステータス遷移
  - 一覧で 1 セッションをクリックして `/admin/sessions/[id]` に遷移できること、各セクションが表示されること（候補者情報 / 面接官情報 / セッションメタ / interview_turn 時系列 / pattern_coverage カード）（ST-7）
  - 1 つの pattern_coverage に 5 次元 + notes を入力して保存できること、`manual_evaluation` JSONB に reviewer = admin email + reviewed_at が記録されること（DB 直接確認）（ST-8）
  - 値域外（authenticity=4 等）入力でボタン無効化、エラー表示（ST-9）
  - 保存後に LLM vs 手動 並列比較が描画され、差分 != 0 の行が `bg-yellow-50` でハイライトされること（ST-10）
  - 1 件保存後に一覧の該当セッションのレビューステータスが「未レビュー → 一部レビュー」に変わること（ST-11）
  - 全 pattern_coverage を保存後にレビューステータスが「レビュー済み」になること（ST-12）
  - 詳細画面のレポートリンクから `/interviews/{sessionId}/report` に別タブで遷移できること（ST-19）
  - 完了状態: スクリーンショットと DB SELECT で確認
  - _Requirements: 4.1-4.11, 5.1-5.12, 6.1-6.11, 7.1-7.8, 14.2_
  - _Depends: 5.3, 8.1_

- [ ] 8.4 _Smoke_ CSV/JSON エクスポート動作確認
  - `/admin/sessions/[id]/export?format=csv` で CSV ダウンロードでき、Excel で開いて文字化けしないこと、ヘッダー + 各 coverage 1 行が正しいこと（ST-13）
  - `/admin/sessions/[id]/export?format=json` で JSON ダウンロードでき、構造が `{ session, candidate, interviewer, coverages: [...] }` であること（ST-14）
  - CSV / JSON のいずれにも採用推奨列がないこと（ST-15）
  - サインアウト状態で `/admin/sessions/{id}/export?format=csv` にアクセスして 401/403 が返ること（ST-16）
  - `?format=xml` で 400 が返ること（ST-17）
  - 存在しない session id にアクセスして 404 が返ること（ST-18）
  - 完了状態: ダウンロードファイルを Excel と JSON parser で確認
  - _Requirements: 8.1-8.17, 10.3, 13.5, 14.2, 15.4_
  - _Depends: 6.3, 8.1_

- [ ] 8.5 _Smoke_ smoke test ページ削除確認
  - `/admin/_health` にアクセスして 404 が返ることを確認（ST-20）
  - 完了状態: ブラウザで 404 ページ表示
  - _Requirements: 12.1-12.4, 14.2_
  - _Depends: 7.1, 8.1_

- [ ] 8.6 _Boundary check_ コンポーネント配置と Stage 2 移行容易性の検証
  - admin 専用コンポーネント / Server Action / lib ヘルパーが `apps/web/app/admin/_components/`、`_actions/`、`_lib/` 配下にあることを `find apps/web/app/admin -type d` で確認
  - apps/web の他ルート（`/interviews/*` 等）から `_components/` を import していないこと（grep で検索）
  - `import { sessionListQuery } from '@bulr/db/queries/admin'` と `import { sessionListQuery } from '@bulr/db'` の両方で解決することを TypeScript で確認
  - `_components/` 内で `@bulr/types/profile` の `CandidateInfo` / `InterviewerProfile`、`@bulr/types/evaluation` の `LlmEvaluation` / `ManualEvaluation` を import して使っていること
  - ファイル命名 kebab-case、コンポーネント名 PascalCase で統一されていること
  - 完了状態: grep / find / typecheck で確認
  - _Requirements: 11.1-11.6, 14.2_
  - _Depends: 5.3, 6.3_

## Implementation Notes

- **review-status.ts のパッケージ境界 (タスク 1.1, 1.2)**: `computeReviewStatus` 関数は `apps/web/app/admin/_lib/review-status.ts` に配置（task 1.1）。design.md の Component Specifications では `SessionListQuery → ReviewStatus` 依存が示されているが、packages/db から apps/web への import は依存方向逆になるため、`packages/db/src/queries/admin/session-list-query.ts` (task 1.2) では同等のロジックを Drizzle の `sql<...>` 式 + `CASE WHEN` で SQL レベルにインライン化する：`CASE WHEN total = 0 OR pending = total THEN 'pending' WHEN pending = 0 THEN 'reviewed' ELSE 'partial' END as review_status`。フィルタの WHERE 句も同じ CASE 式を使う（HAVING 句または derived subquery）。判定ロジックが将来変わる場合は `review-status.ts` と session-list-query.ts 両方を同期更新すること。
- **バレルチェーン整備 (タスク 1.4-1.6)**: 既存の `packages/db/src/queries/index.ts` は flat な直接ファイル export（`export * from './interview/load-session-with-turns'` 等）だったため、`interview/index.ts` を新規作成して subdir-barrel パターンに移行。最終構造: `admin/index.ts` + `interview/index.ts` → `queries/index.ts` (subdir barrel) → `db/index.ts` (`export * from './queries/index'` を新規追加)。これで `@bulr/db/queries/admin` と `@bulr/db` の両方から `sessionListQuery` 等が解決する。trivial な barrel 系（1.4-1.6）はメインコンテキストで直接実装し typecheck で確認した（subagent ラウンドトリップを省略）。
- **typetest ファイルは作らない (タスク 3.1 で発生)**: Stage 1 は requirements 14.1 でテストフレームワーク（Vitest/Playwright 等）導入を明示的に禁じている。subagent が TDD プロトコルに従って `__typetest__/*.typetest.tsx` ファイルを作成した場合は境界違反として削除する。検証は `pnpm typecheck` / `pnpm lint` + 手動 smoke のみ。後続タスクの implementer prompt にも明記すること。
