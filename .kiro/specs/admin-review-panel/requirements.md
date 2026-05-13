# Requirements Document — admin-review-panel

## Project Description (Input)

bulr Stage 1 MVP プロトタイプ（AI 面接アシスタント型）における **創業者の検証作業ツール** を構築する。Stage 1 検証ゴール「ベトナム人 20-30 + 日本人 10-20 の面接結果と既知実力評価および面接官独自判断との一致度確認」を達成するため、創業者は全セッションを横断的にレビューし、各 `pattern_coverage` レコードに対し 5 次元の手動スコアを付与し、LLM 評価との突合と CSV/JSON エクスポートを行う必要がある。

v1 では「ヒートマップ閲覧 + 手動評価」の二本柱だったが、v2 移行に伴い役割が **大幅に縮小**：ヒートマップ閲覧は `assessment-engine` の面接官向けレポート画面（CSS 横棒で実装済み）に移管し、本 spec は **手動評価入力 + LLM 評価との突合表示 + CSV/JSON エクスポート** に集中する。本 spec はヒートマップ可視化を一切実装せず、`/admin/sessions/[id]` 画面から面接官向けレポート画面（`/interviews/[sessionId]/report`）へのリンクのみを提供する。

`authentication` spec の `requireAdmin` / `adminAction` / proxy.ts Basic 認証 / `/admin/login`、`assessment-engine` spec の 6 テーブル（`candidate` / `interview_session` / `question_proposal` / `interview_turn` / `pattern_coverage` / `session_report`）と `LlmEvaluation` JSONB 構造、共通型（`@bulr/types/profile` の `CandidateInfo` / `InterviewerProfile`、`@bulr/types/evaluation` の `LlmEvaluation` / `ManualEvaluation`）を再利用する。本 spec は `pattern_coverage.manual_evaluation` JSONB の **権威定義**（`{ authenticity, judgment, scope, meta_cognition, ai_literacy, notes, reviewer, reviewed_at }`）を確立し、`packages/db/src/queries/admin/` サブディレクトリ + 3 階層バレルチェーンを初導入する。

apps/web 同居の `/admin/*` 配下に最小機能の検証ツールを構築。Stage 2 で apps/admin 分離する前提で、コンポーネントは `apps/web/app/admin/_components/` に閉じて配置（Next.js App Router の private folder 規約 `_` を活用、ディレクトリごと移動可能）。

## Requirements

### Requirement 1: セッション一覧ページの提供

**User Story:** 創業者として、`/admin/sessions` で全面接セッションを一覧表示し、横断的にレビュー対象を把握したい。検証作業の起点となる。

#### Acceptance Criteria

1.1. システムは `/admin/sessions` ルート（`apps/web/app/admin/sessions/page.tsx`）に Server Component としてセッション一覧ページを公開する。
1.2. システムは一覧ページの先頭で `requireAdmin()` を呼び出し、未認証または非許可メールアクセスを拒否する。
1.3. システムは一覧ページに各セッションについて以下の列を表示する：候補者名、面接官メール、status（in_progress/completed/abandoned）、開始時刻、終了時刻（NULL なら「未終了」）、ターン数、平均スコア（5 次元の総平均、未評価セッションは「-」）、レビューステータス（未レビュー / 一部レビュー / レビュー済み）。
1.4. システムは各セッション行に `/admin/sessions/[id]` 詳細ページへのリンクを提供する。
1.5. システムは status が `draft` のセッションを一覧に表示しない（実質的に未開始のため検証対象外）。
1.6. システムは候補者・面接官・カバレッジが 0 件のセッションでもエラーを起こさず、それぞれ「-」または「0」を表示する。
1.7. WHEN セッションが 1 件も存在しない THEN システムは「セッションがありません」というメッセージを表示する。

### Requirement 2: セッション一覧フィルタの提供

**User Story:** 創業者として、レビューステータスや status でセッションを絞り込み、未レビューのセッションに集中して取り組みたい。

#### Acceptance Criteria

2.1. システムは一覧ページに「レビューステータス」フィルタ（全件 / 未レビュー / 一部レビュー / レビュー済み）を提供する。
2.2. システムは一覧ページに「status」フィルタ（全件 / in_progress / completed / abandoned）を提供する。
2.3. WHEN 創業者がフィルタを変更 THEN システムは選択された条件に該当するセッションのみを再描画する。
2.4. システムは複数フィルタを AND 条件で組み合わせる（例：レビューステータス=未レビュー かつ status=completed）。
2.5. システムはフィルタ状態を URL クエリパラメータ（`?reviewStatus=...&status=...`）で保持し、ブラウザリロードしても状態が維持される。
2.6. システムはフィルタ条件を Zod スキーマで検証し、不正な値はデフォルト値（全件）にフォールバックする。
2.7. システムはレビューステータスを以下のロジックで判定する：当該セッションの全 `pattern_coverage` レコード数を total、`manual_evaluation IS NULL` のレコード数を pending としたとき、pending == total なら「未レビュー」、0 < pending < total なら「一部レビュー」、pending == 0 かつ total > 0 なら「レビュー済み」、total == 0 なら「未レビュー」と扱う。

### Requirement 3: セッション一覧ソートの提供

**User Story:** 創業者として、開始時刻、候補者名、平均スコアの順でソートし、検証戦略に沿ってレビュー順序を決めたい。

#### Acceptance Criteria

3.1. システムは一覧ページに「開始時刻」「候補者名」「平均スコア」の 3 つのソートキーを提供する。
3.2. システムは各ソートキーで昇順 / 降順を切り替えられる UI を提供する。
3.3. システムはデフォルトソートを「開始時刻 降順（新しい順）」とする。
3.4. WHEN 創業者がソートキーまたは順序を変更 THEN システムは選択された条件で再描画する。
3.5. システムはソート状態を URL クエリパラメータ（`?sortBy=...&sortOrder=...`）で保持する。
3.6. システムはソート条件を Zod スキーマで検証し、不正な値はデフォルト値にフォールバックする。
3.7. システムは平均スコア NULL（未評価セッション）を昇順時は末尾、降順時は末尾に配置する。

### Requirement 4: セッション詳細ページの提供

**User Story:** 創業者として、`/admin/sessions/[id]` でセッションの全情報を 1 画面で確認し、手動評価作業を行いたい。

#### Acceptance Criteria

4.1. システムは `/admin/sessions/[id]` ルート（`apps/web/app/admin/sessions/[id]/page.tsx`）に Server Component として詳細ページを公開する。
4.2. システムは詳細ページの先頭で `requireAdmin()` を呼び出し、未認証または非許可メールアクセスを拒否する。
4.3. システムは詳細ページに **候補者情報セクション** を表示する（name / applied_role / background_summary、email がある場合のみ表示）。
4.4. システムは詳細ページに **面接官情報セクション** を表示する（display_name / role_in_org / 面接官の email）。
4.5. システムは詳細ページに **セッションメタ情報セクション** を表示する（status / 開始時刻 / 終了時刻 / 所要時間 / ターン数 / pattern_coverage 数 / フリー質問数（pattern_id IS NULL のターン数）/ planned_pattern_codes / consent_obtained_at / consent_version）。
4.6. システムは詳細ページに **interview_turn 時系列セクション** を表示する（sequence_no 昇順、各ターンで question_text / question_source / candidate transcript / pattern_match_confidence / off_pattern_summary（off_pattern の場合のみ）/ pattern_id（紐づく場合は assessment_pattern.code も併記）/ duration_ms / created_at）。
4.7. システムは詳細ページに **pattern_coverage セクション** を pattern_code 昇順で表示し、各カバレッジカードに以下を含める：パターンコード / level_reached（0-4）/ stuck_type（NULL なら「詰まりなし」）/ LLM 評価（5 次元 + notes + evaluated_at）/ 手動評価入力フォーム（既存値を初期値に）/ LLM vs 手動の並列比較表。
4.8. システムは詳細ページに **面接後レポートへのリンク** を表示する（assessment-engine 側の `/interviews/[sessionId]/report` への遷移、別タブで開く）。
4.9. WHEN 指定された session id が存在しない THEN システムは Next.js の `notFound()` を呼び 404 ページを表示する。
4.10. システムはセッション id を Zod スキーマで検証し、不正な形式の場合は `notFound()` で 404 を返す。
4.11. システムは詳細ページにヒートマップを表示しない（assessment-engine 側へリンクで誘導）。

### Requirement 5: 手動評価入力フォームの提供

**User Story:** 創業者として、各 `pattern_coverage` に対し 5 次元の手動スコアと観察ノートを入力し、LLM 評価との一致度検証データを蓄積したい。

#### Acceptance Criteria

5.1. システムは各 pattern_coverage カード内に手動評価入力フォーム（Client Component）を提供する。
5.2. システムはフォームに以下の 5 つの整数入力フィールドを提供する：authenticity（0-3）、judgment（0-3）、scope（1-5）、meta_cognition（0-3）、ai_literacy（0-3）。
5.3. システムはフォームに `notes` テキストエリア（最大 5000 文字）を提供する。
5.4. システムはフォームに「保存」ボタンを提供する。
5.5. WHEN 手動評価が既に存在する THEN システムは既存値をフォーム初期値として表示する。
5.6. システムは入力値の整数値域（authenticity/judgment/meta_cognition/ai_literacy: 0-3、scope: 1-5）を Zod スキーマでクライアントサイドおよびサーバーサイドの両方で検証する。
5.7. WHEN 値域外の数値を入力 THEN システムは保存ボタンを無効化し、エラーメッセージを表示する。
5.8. システムは `notes` が 5000 文字を超える場合に保存ボタンを無効化し、文字数カウンタを表示する。
5.9. システムはフォーム送信中はボタンを無効化し、ローディングインジケーターを表示する。
5.10. WHEN 保存が成功 THEN システムは成功メッセージを表示し、LLM vs 手動 並列比較表を最新値で再描画する。
5.11. WHEN 保存が失敗 THEN システムはエラー詳細を含むメッセージを表示し、フォーム入力値を保持する。
5.12. システムは「採用推奨」「不採用推奨」「保留」等の判断フィールドを提供しない（`evaluation-rubric.md` 方針）。

### Requirement 6: 手動評価保存 Server Action の提供

**User Story:** 創業者として、フォーム送信で `pattern_coverage.manual_evaluation` JSONB が信頼可能な形で upsert され、reviewer 情報がサーバー側で固定される（信頼境界）ことを保証したい。

#### Acceptance Criteria

6.1. システムは `apps/web/app/admin/_actions/update-manual-evaluation.ts` に Server Action を実装する。
6.2. システムは Server Action を `adminAction` ラッパー（`apps/web/lib/safe-action.ts`、`authentication` spec で実装済み）でラップする。
6.3. システムは Server Action の入力 Zod スキーマを次の構造で定義する：`{ patternCoverageId: string, authenticity: 0|1|2|3, judgment: 0|1|2|3, scope: 1|2|3|4|5, meta_cognition: 0|1|2|3, ai_literacy: 0|1|2|3, notes: string (max 5000) }`。
6.4. システムは Server Action 内で `requireAdmin()` の戻り値から `user.email` を取得し、`reviewer` フィールドにサーバー側で固定する（フォーム入力からは取得しない、信頼境界）。
6.5. システムは Server Action 内で現在の ISO 8601 timestamp を `reviewed_at` に設定する。
6.6. システムは `pattern_coverage` テーブルの `manual_evaluation` JSONB カラムを以下の構造で upsert する：`{ authenticity, judgment, scope, meta_cognition, ai_literacy, notes, reviewer, reviewed_at }`（権威定義）。
6.7. WHEN 指定された patternCoverageId が存在しない THEN システムは `{ ok: false, error: 'NOT_FOUND' }` を返す。
6.8. システムは保存後に `revalidatePath('/admin/sessions/[id]')` を呼び、詳細ページのキャッシュを無効化する。
6.9. システムは `manual_evaluation` JSONB の構造を本 spec が **権威定義** とし、`assessment-engine` spec の `pattern_coverage.manual_evaluation` カラムは nullable で受ける。
6.10. システムは Server Action のレスポンスを `{ ok: true } | { ok: false, error: string }` の判別共用体で返す。
6.11. システムは Server Action の処理で、Zod 検証失敗時に `{ ok: false, error: 'VALIDATION_ERROR', details: ... }` を返す。

### Requirement 7: LLM 評価 vs 手動評価の並列表示と差分ハイライト

**User Story:** 創業者として、LLM 評価と手動評価が並列に表示され、差分が一目で分かることで、検証作業の効率を上げたい。

#### Acceptance Criteria

7.1. システムは各 pattern_coverage カード内に LLM 評価と手動評価を並列表示する比較表（Server Component）を提供する。
7.2. システムは比較表に 5 次元（authenticity / judgment / scope / meta_cognition / ai_literacy）それぞれを行とし、列に「LLM スコア」「手動スコア」「差分（手動 - LLM）」を含める。
7.3. WHEN 手動評価が未入力 THEN システムは「手動スコア」「差分」列に「-」を表示する。
7.4. システムは差分が 0 でない行に `bg-yellow-50` の背景色を適用してハイライトする。
7.5. システムは差分が 0 の行は通常の背景色で表示する。
7.6. システムは LLM の `notes` と手動の `notes` を比較表の下にそれぞれ表示する。
7.7. システムは比較表に LLM 評価の `evaluated_at` と手動評価の `reviewed_at` をそれぞれ表示する（手動評価は reviewer email も併記）。
7.8. システムは比較表に「採用推奨」を表示しない。

### Requirement 8: CSV / JSON エクスポート endpoint の提供

**User Story:** 創業者として、セッションごとに CSV / JSON 形式で全評価データをダウンロードし、Excel または Python pandas で相関分析を行いたい。

#### Acceptance Criteria

8.1. システムは `/admin/sessions/[id]/export` ルート（`apps/web/app/admin/sessions/[id]/export/route.ts`）に Route Handler を実装する。
8.2. システムは Route Handler の先頭で `requireAdmin()` を呼び出し、未認証または非許可メールアクセスを拒否する（URL 直接アクセス禁止）。
8.3. システムはクエリパラメータ `?format=csv` で CSV、`?format=json` で JSON を返す。
8.4. WHEN format パラメータが csv または json 以外 THEN システムは 400 Bad Request を返す。
8.5. システムは CSV を 1 行 = 1 pattern_coverage レコードの形式で出力し、以下の列を含める：session_id, candidate_name, candidate_applied_role, interviewer_email, pattern_code, pattern_category, level_reached, stuck_type, llm_authenticity, llm_judgment, llm_scope, llm_meta_cognition, llm_ai_literacy, llm_notes, llm_evaluated_at, manual_authenticity, manual_judgment, manual_scope, manual_meta_cognition, manual_ai_literacy, manual_notes, reviewer, reviewed_at。
8.6. システムは CSV の先頭にヘッダー行を含める。
8.7. システムは CSV を UTF-8 BOM（`﻿`）で開始し、Excel での文字化けを防ぐ。
8.8. システムは CSV の改行を CRLF（`\r\n`）とし、Excel 互換とする。
8.9. システムは CSV 値内のダブルクォート / カンマ / 改行を適切にエスケープする（RFC 4180 準拠）。
8.10. システムは JSON を以下の構造で返す：`{ session: { id, status, started_at, completed_at, ... }, candidate: { name, applied_role, background_summary, email? }, interviewer: { email, display_name, role_in_org }, coverages: [ { pattern_code, level_reached, stuck_type, llm_evaluation, manual_evaluation? }, ... ] }`。
8.11. システムは CSV / JSON のいずれにも「採用推奨」フィールドを含めない（`evaluation-rubric.md` 方針）。
8.12. システムは Content-Disposition ヘッダーで適切なファイル名を返す（例：`bulr-session-{sessionId}.csv` / `.json`）。
8.13. システムは CSV の Content-Type を `text/csv; charset=utf-8` に、JSON の Content-Type を `application/json; charset=utf-8` に設定する。
8.14. WHEN 指定された session id が存在しない THEN システムは 404 Not Found を返す。
8.15. システムは未評価のフィールド（manual_evaluation がない場合の各列）を CSV では空文字列、JSON では `null` として出力する。
8.16. システムは CSV エクスポートに papaparse 等のサードパーティライブラリを使わず、自作の `escapeCsvField` 純関数で実装する。
8.17. システムは pattern_id IS NULL のフリー質問ターンを CSV / JSON の coverages に含めない（pattern_coverage が作られないため）。

### Requirement 9: 集約クエリの提供

**User Story:** 開発者として、セッション一覧と詳細ページが共通の集約クエリ関数を再利用でき、`packages/db` 層に責務を集約したい。

#### Acceptance Criteria

9.1. システムは `packages/db/src/queries/admin/` サブディレクトリを **本 spec で初導入** する（`assessment-engine` の `queries/interview/` と並列）。
9.2. システムは `packages/db/src/queries/admin/session-list-query.ts` に `sessionListQuery` 関数を実装する：全セッションを fetch し、各セッションについてレビューステータス（pending count vs total count）と平均スコア（pattern_coverage の llm_evaluation 5 次元の総平均）を計算する。
9.3. システムは `sessionListQuery` がフィルタ条件（reviewStatus / status）とソート条件（sortBy / sortOrder）を引数で受け取り、結果をフィルタ・ソートして返す。
9.4. システムは `packages/db/src/queries/admin/session-detail-query.ts` に `sessionDetailQuery(sessionId)` 関数を実装する：session + candidate + interviewer (user + user_profile) + interview_turn[] (sequence_no 昇順) + pattern_coverage[] (pattern_code 昇順) + 関連 assessment_pattern を一括取得する。
9.5. システムは集約クエリを **3 階層バレルチェーン** で公開する：

- `packages/db/src/queries/admin/index.ts`：admin 配下の全関数を再エクスポート
- `packages/db/src/queries/index.ts`：`export * from './admin/index'` を追加（既に `queries/interview/` を含むはず）
- `packages/db/src/index.ts`：`export * from './queries/index'` のバレルが既存または追加
  9.6. システムは集約クエリで Drizzle ORM のみを使用し、生 SQL を使わない（`security.md` の SQL injection 対策準拠）。
  9.7. システムは集約クエリで N+1 を避けるため、JOIN または `with` clause を活用する（70 セッション × 平均 8-12 パターン = 600-900 レコード規模で許容）。

### Requirement 10: 多層認証の徹底

**User Story:** セキュリティ担当として、proxy.ts の Basic 認証だけに依存せず、各 admin ページで `requireAdmin()` を独立に呼ぶことで、CVE-2025-29927 類似の bypass 攻撃に対する多層防御を保証したい。

#### Acceptance Criteria

10.1. システムは `/admin/sessions` 一覧ページの先頭で `requireAdmin()` を呼ぶ。
10.2. システムは `/admin/sessions/[id]` 詳細ページの先頭で `requireAdmin()` を呼ぶ。
10.3. システムは `/admin/sessions/[id]/export` Route Handler の先頭で `requireAdmin()` を呼ぶ。
10.4. システムは `update-manual-evaluation` Server Action を `adminAction` ラッパー経由でのみ提供する（素の `async function` で書かない）。
10.5. WHEN `requireAdmin()` が `AuthError('UNAUTHORIZED')` を throw THEN システムは `/sign-in` にリダイレクトする。
10.6. WHEN `requireAdmin()` が `AuthError('FORBIDDEN')` を throw THEN システムは 403 ページを表示する。
10.7. システムは proxy.ts の Basic 認証チェックに依存せず、各レイヤーで独立に認可チェックを実行する。
10.8. システムは `ADMIN_ALLOWED_EMAILS` 環境変数の許可リスト二重チェックを `requireAdmin()` 経由で実施する。

### Requirement 11: コンポーネントの配置と Stage 2 移行容易性

**User Story:** 開発者として、Stage 2 で apps/admin 分離する際にディレクトリごと移動できるよう、admin 専用コンポーネントを `apps/web/app/admin/_components/` に閉じて配置したい。

#### Acceptance Criteria

11.1. システムは admin 専用コンポーネントを `apps/web/app/admin/_components/` 配下に配置する（Next.js App Router の private folder 規約 `_` を活用、URL ルーティング対象外）。
11.2. システムは admin 専用 Server Action を `apps/web/app/admin/_actions/` 配下に配置する。
11.3. システムは admin 専用ヘルパー（CSV エクスポート整形等）を `apps/web/app/admin/_lib/` 配下に配置する。
11.4. システムは `_components/` 配下のコンポーネントを apps/web の他ルート（`/interviews/*` 等）から import しない（boundary 閉鎖）。
11.5. システムは `_components/` 内で `@bulr/types/profile` の `CandidateInfo` / `InterviewerProfile`、`@bulr/types/evaluation` の `LlmEvaluation` / `ManualEvaluation` を import して使う（`assessment-engine` spec で定義済み、本 spec では新規追加しない）。
11.6. システムはファイル命名を kebab-case、コンポーネント名を PascalCase で統一する（`structure.md` 準拠）。

### Requirement 12: smoke test ページの削除

**User Story:** 保守担当として、`authentication` spec で一時設置された `/admin/_health/` smoke test ページが冪等に削除されることを保証したい（assessment-engine spec で削除済みの場合も問題なく動作）。

#### Acceptance Criteria

12.1. システムは本 spec のタスクで `apps/web/app/admin/_health/page.tsx` の削除を実行する。
12.2. WHEN `/admin/_health/page.tsx` が既に存在しない（assessment-engine spec で削除済み）THEN システムはエラーを起こさず処理をスキップする（冪等処理）。
12.3. WHEN `/admin/_health/` ディレクトリが空になる THEN システムはディレクトリも削除する（git では空ディレクトリは追跡されないため自動的に消える）。
12.4. システムは削除後の検証として `pnpm dev` 起動 → `/admin/_health` への手動アクセスで 404 が返ることを確認する。

### Requirement 13: 個人情報の取り扱い

**User Story:** プライバシー担当として、候補者・面接官の個人情報が管理画面でのみ表示され、ログ・エクスポート以外の場所に漏出しないことを保証したい。

#### Acceptance Criteria

13.1. システムは候補者の name / email / background_summary を管理画面ページとエクスポート出力でのみ表示する。
13.2. システムは面接官の email を管理画面ページとエクスポート出力でのみ表示する。
13.3. システムは個人情報をサーバーログ（console.log / console.error）に出力しない。
13.4. システムは Zod 検証エラーメッセージに個人情報を含めない。
13.5. システムは CSV / JSON エクスポートを `requireAdmin()` 経由でのみ生成し、URL 直接アクセスで未認可ダウンロードを許さない。

### Requirement 14: テスト戦略（Stage 1）

**User Story:** 開発者として、Stage 1 の制約（自動テストなし）に従い、手動 smoke test で完了確認を行いたい。

#### Acceptance Criteria

14.1. システムは Stage 1 で Playwright / Vitest 等の自動テストフレームワークを導入しない（`security.md` 方針）。
14.2. 完了確認は以下の手動 smoke test を実施する：

- `/admin/login` に Basic 認証で到達できる
- 許可メールでサインインして `/admin/sessions` に到達できる
- 一覧で 1 セッションをクリックして `/admin/sessions/[id]` に遷移できる
- 1 つの pattern_coverage に手動スコアを入力して保存できる
- 保存後に LLM vs 手動 並列表示の差分ハイライトが正しく機能する
- `/admin/sessions/[id]/export?format=csv` で CSV をダウンロードでき、Excel で開いても文字化けしない
- `/admin/sessions/[id]/export?format=json` で JSON をダウンロードでき、構造が仕様通りである
- 面接官向けレポート画面（`/interviews/[sessionId]/report`）へのリンクが機能する
  14.3. システムは Server Action の Zod 検証ロジックについてのみ、必要に応じて単体テストを書く（任意、Stage 1 必須ではない）。

### Requirement 15: Stage 2 移行への配慮（Out of Scope の明示）

**User Story:** 創業者として、Stage 1 の本 spec が Stage 2 で apps/admin 分離やフル機能ヒートマップに発展することを前提に設計されていることを確認したい。

#### Acceptance Criteria

15.1. システムは本 spec で apps/admin 分離（Stage 2）を実施しない。
15.2. システムは本 spec でフル機能のヒートマップ可視化（D3.js / Recharts 等のチャートライブラリ）を実装しない（Stage 2）。
15.3. システムは本 spec で受験者管理（招待・削除・停止）を実装しない（Stage 2）。
15.4. システムは本 spec で候補者削除フローを実装しない（Stage 3）。
15.5. システムは本 spec でパターン管理 UI を実装しない（Stage 2、Stage 1 は TypeScript ファイル編集 + シード再実行で運用）。
15.6. システムは本 spec でフリー質問の新パターン昇格 UI を実装しない（Stage 2）。
15.7. システムは本 spec で LLM 評価の手動再実行を実装しない（Stage 2）。
15.8. システムは本 spec でレビュー履歴・監査ログを実装しない（Stage 2）。
15.9. システムは本 spec で複数管理者の権限分離を実装しない（Stage 1 は `ADMIN_ALLOWED_EMAILS` でフラットに許可）。
15.10. システムは本 spec でリアルタイム通知を実装しない（Stage 2）。
15.11. システムは本 spec で統計ダッシュボード（受験率・完走率トレンド等）を実装しない（Stage 2）。
