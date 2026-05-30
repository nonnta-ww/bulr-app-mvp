# 要件定義 — session-from-entry

## はじめに

本 spec は Wave 3 の最終ピースとして、Stage 1 で構築された `assessment-engine` の `interview_session` を `entry` 経由で起動できるよう改修し、Stage 1 → Stage 2 の意味論的整合を完成させる。

Wave 2 + Wave 3 で整備されたエントリーモデル（`entry` / `candidate_profile` / `resume_document` / `skill_survey_response`）を面接セッション作成フローに接続することで、面接官が候補者情報を手入力する二重管理を廃止し、スキルアンケート結果をパターン選定の判断材料として活用できるようにする。

Stage 1 のセッション（`entry_id=NULL`）は引き続き閲覧・継続できる状態を保つ。`assessment-engine` 本体（5 LLM 関数・状態 A/B 遷移・interview_turn / pattern_coverage / session_report テーブル）は本 spec では変更しない。

## スコープ境界

**スコープ内:**
- `interview_session` テーブルへの `entry_id` カラム追加（nullable、`entry` への FK）および `candidate_id` の nullable 化
- データ整合性保証（`entry_id IS NOT NULL OR candidate_id IS NOT NULL`）のアプリ層での実施
- `createSessionFromEntry` Server Action（企業側アプリ、`entry_id` を入力にセッション作成 + entry.status を `progressing` に更新）
- entry 詳細ページへのパターン選定支援 UI 追加（スキルアンケートベース推奨 + 面接官による選択 + セッション作成）
- `getInterviewSession` クエリ拡張（`entry_id` が存在する場合に opening / company / resume_document / skill_survey_response を JOIN して返す）
- 面接アシスタント UI ヘッダーの Stage 1/2 分岐表示（entry_id あり → candidate_profile.display_name + opening 情報、なし → candidate.name）
- 面接後レポート画面の Stage 2 拡張（entry 経由セッションで opening 情報 + skill_survey_response を併用表示）
- `/interviews/new`（Stage 1 候補者手入力フォーム）のナビゲーションからの非表示化（ルートファイルは温存）
- admin-review-panel のセッション一覧を entry 経由セッションも表示されるよう拡張（`apps/admin` 配下）
- Drizzle マイグレーションファイルの生成と適用

**スコープ外:**
- `assessment-engine` 本体（5 LLM 関数・`analyzeTurn` 等・状態 A/B 遷移ロジック）
- `interview_turn` / `pattern_coverage` / `session_report` テーブルのスキーマ変更
- `assessment_pattern` マスタの追加・編集（Wave 4 `admin-operations`）
- Stage 1 `candidate` テーブルの削除・縮退（将来別 spec）
- 候補者側からの面接セッション可視化（Wave 5+）
- 面接結果の自動公開・候補者側通知（Wave 5+）
- パターン選定の ML ベース最適化（MVP はキーワードマッチング）
- L4 模擬面接結果のセッションへの引き継ぎ（Wave 4 `mock-interview`）

**隣接 spec との期待関係:**
- `entry-flow`（Wave 3）が確立する `entry` エンティティ・`getEntryWithSnapshots` seam・entry 詳細ページを本 spec が拡張する
- Stage 1 `assessment-engine` が確立する `interview_session` スキーマ・面接アシスタント UI・面接後レポートを本 spec が拡張する
- `skill-survey`（Wave 2）が確立する `getLatestResponseByCandidateProfileId` / `SkillSurveyResponseWithAnswers` を本 spec がパターン推奨ロジックで消費する
- `admin-review-panel`（Stage 1）が確立するセッション一覧 UI を本 spec が entry 経由セッション表示のために拡張する
- 本 spec が拡張した `interview_session` スキーマは Wave 4 `mock-interview` / `admin-operations` が後続消費者となる

---

## 要件一覧

### 要件 1: interview_session スキーマ拡張

**目的:** 開発者として、`interview_session` テーブルが `entry_id` カラムを持ち、`candidate_id` が nullable になることで、Stage 1 形式（手入力候補者）と Stage 2 形式（entry 経由）の両セッションを同一テーブルで管理できるようにしたい。

#### 受け入れ基準

1. The db package shall `interview_session` テーブルに `entry_id` カラム（nullable text、`entry` テーブルへの FK）を追加する。
2. The db package shall `interview_session.candidate_id` カラムを nullable に変更する（Stage 1 との後方互換を維持しながら entry 経由セッションでは NULL を許容する）。
3. The db package shall `entry_id IS NOT NULL OR candidate_id IS NOT NULL` の整合性制約をアプリ層で保証できる状態にする（MVP では CHECK 制約は不要、アプリ層での保証とする）。
4. The db package shall `interview_session` の既存レコード（Stage 1 セッション）が `entry_id=NULL` として継続して読み書きできることを保証する。
5. The db package shall すべての timestamp カラムが `{ withTimezone: true }` 統一で定義されていることを維持する。
6. The db package shall Drizzle マイグレーションファイルを生成し、dev ブランチへの適用が可能な状態にする。

---

### 要件 2: createSessionFromEntry Server Action

**目的:** 企業ユーザーとして、entry 詳細ページから「面接セッションを作成」を実行したとき、候補者情報を手入力することなく `entry` の情報（候補者名・募集情報・履歴書・スキルアンケート）を引き継いだ面接セッションが作成され、`entry.status` が `progressing` に更新されるようにしたい。

#### 受け入れ基準

1. The business app shall `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/_actions/create-session-from-entry.ts` に `createSessionFromEntry` Server Action を実装する。
2. The `createSessionFromEntry` Server Action shall `entry_id` を入力として受け取り、`authedAction` + `requireCompanyUser` の二重防御パターンで認証・認可を行う。
3. When `createSessionFromEntry` が呼ばれたとき、the business app shall `entry.candidate_profile_id` 経由で `candidate_profile.display_name`・`opening` 情報・`resume_document`・`skill_survey_response` を参照して `interview_session` レコードを作成する。
4. When `createSessionFromEntry` が呼ばれたとき、the business app shall 作成される `interview_session` に `entry_id` をセットし、`candidate_id` は NULL とする。
5. When `createSessionFromEntry` が成功したとき、the business app shall `entry.status` を `progressing` に更新する。
6. When `createSessionFromEntry` が成功したとき、the business app shall 作成した `interview_session.id` を返し、呼び出し元が面接画面へリダイレクトできるようにする。
7. If `entry` が既に `interview_session` を持っている場合（既存の `interview_session` が `entry_id = 当該 entryId` で存在する場合）、the business app shall 既存セッションの ID を返すかエラーを返し、重複作成を防ぐ。
8. If 認証ユーザーの所属企業が当該 entry の `opening.company_id` と一致しない場合、the business app shall `FORBIDDEN` エラーを返す。

---

### 要件 3: パターン選定支援 UI

**目的:** 企業ユーザーとして、entry 詳細ページでスキルアンケートの回答結果をもとに関連する assessment_pattern の推奨を確認し、面接で深掘りするパターンを選択してから面接セッションを作成できるようにしたい。推奨はあくまで「ヒント」であり、最終的な選択は面接官が判断する。

#### 受け入れ基準

1. The business app shall entry 詳細ページ（`/openings/[openingId]/entries/[entryId]`）にスキルアンケート回答ベースの推奨 assessment_pattern をリスト表示するセクションを追加する。
2. The business app shall スキルアンケートの回答内容（選択肢テキスト・記述回答）と assessment_pattern のタイトル・説明のキーワード含有マッチングにより推奨パターンを導出し、面接官に提示する。
3. The business app shall 推奨パターンを「ヒント」として明示し、面接官が推奨を採用するかどうか自由に選択・変更できる UI を提供する。
4. The business app shall `entry.skill_survey_response_id` が NULL の場合でも entry 詳細ページが正常に表示され、推奨セクションは「スキルアンケート未回答」として適切なメッセージを表示する。
5. When 面接官がパターンを選択して「面接セッションを作成」ボタンを押したとき、the business app shall 選択されたパターンコードを `interview_session.planned_pattern_codes` に設定した状態でセッションを作成する。
6. The business app shall 推奨パターンの自動決定（面接官の承認なしでのフルオート選定）を行わない（面接官の明示的な操作によってのみセッションを作成する）。
7. The business app shall パターン推奨ロジックに ML・ベクトル検索を使用せず、MVP ではシンプルなキーワード含有マッチングを使用する。

---

### 要件 4: getInterviewSession クエリ拡張

**目的:** 開発者として、`getInterviewSession` が `entry_id` の有無に応じて entry 経由の情報（opening / company / resume_document / skill_survey_response）も取得できるよう拡張されることで、面接アシスタント UI や面接後レポート画面が Stage 1/2 両形式のセッションを正しく表示できるようにしたい。

#### 受け入れ基準

1. The db package shall `getInterviewSession(sessionId)` クエリ（または相当するクエリ関数）が、`interview_session.entry_id IS NOT NULL` の場合に `entry` → `opening` → `company` → `candidate_profile` → `resume_document` → `skill_survey_response` を JOIN して返す。
2. The db package shall `interview_session.entry_id IS NULL`（Stage 1 形式）の場合は従来通り `candidate` を JOIN して返し、entry 関連フィールドは null で返す。
3. The db package shall 拡張後のクエリ関数が、Stage 1 セッション（`entry_id=NULL`）も Stage 2 セッション（`entry_id` あり）もどちらも正常に取得できることを保証する。
4. The db package shall 拡張後のクエリの戻り値型が TypeScript 型安全であり、呼び出し元が `entry_id` の有無で Stage 1/2 を判別できる型定義を提供する。

---

### 要件 5: 面接アシスタント UI ヘッダーの Stage 1/2 分岐表示

**目的:** 面接官として、面接アシスタント画面のヘッダー部分が entry 経由のセッションでは `candidate_profile.display_name` と opening 情報を表示し、Stage 1 形式のセッションでは `candidate.name` を従来通り表示することで、どちらの形式のセッションでも正確な候補者情報を確認できるようにしたい。

#### 受け入れ基準

1. The business app shall 面接アシスタント画面（`/interviews/[sessionId]`）のヘッダー部分が、`interview_session.entry_id IS NOT NULL` の場合は `candidate_profile.display_name` と `opening.title` を表示する。
2. The business app shall 面接アシスタント画面のヘッダー部分が、`interview_session.entry_id IS NULL`（Stage 1 形式）の場合は `candidate.name` と `applied_role` を表示する（Stage 1 互換表示を維持する）。
3. The business app shall 面接アシスタントの状態 A（録音中）および状態 B（候補選択）UI が、Stage 1 セッション・Stage 2 セッションのどちらでも正常に動作する（LLM 関数・録音・ターン処理の動作は変更しない）。

---

### 要件 6: 面接後レポート画面の Stage 2 拡張

**目的:** 面接官として、entry 経由のセッションの面接後レポート（`/interviews/[sessionId]/report`）で opening 情報・候補者プロフィール情報・スキルアンケートの回答内容を面接スコアと並べて確認できるようにしたい。

#### 受け入れ基準

1. The business app shall 面接後レポート画面（`/interviews/[sessionId]/report`）が `interview_session.entry_id IS NOT NULL` の場合、opening のタイトル・会社名・候補者の display_name を面接スコアセクションの上部に表示する。
2. The business app shall 面接後レポート画面が `entry.skill_survey_response_id IS NOT NULL` の場合、スキルアンケートの主要な回答サマリー（回答したカテゴリ・スキル一覧）を面接レポートの補足情報として表示する。
3. The business app shall `interview_session.entry_id IS NULL`（Stage 1 形式）の面接後レポートが、既存の表示形式（`candidate.name` + 面接スコア）を維持する。
4. If `entry_id` は存在するが `skill_survey_response_id` が NULL の場合、the business app shall スキルアンケートサマリーセクションを「回答なし」として適切に表示する。

---

### 要件 7: /interviews/new ナビゲーション非表示化

**目的:** 企業ユーザーとして、面接セッション作成が entry 経由フローに統一されることで、旧来の候補者手入力フォーム（`/interviews/new`）が主要ナビゲーションに表示されないようにしたい。ただし既存の Stage 1 セッション（entry_id=NULL）は引き続き閲覧できる。

#### 受け入れ基準

1. The business app shall 主要ナビゲーション（サイドバー・ヘッダーメニュー等）から `/interviews/new` へのリンクを削除する。
2. The business app shall `/interviews/new` のルートファイル（`page.tsx`）はファイルシステム上に残し、直接 URL アクセスで引き続き利用可能な状態を維持する。
3. The business app shall Stage 1 セッション（`entry_id=NULL`）がセッション一覧（`/interviews`）に表示され、詳細画面・レポート画面へのアクセスが継続して可能であることを保証する。

---

### 要件 8: admin-review-panel のセッション一覧拡張

**目的:** 管理者として、admin のセッション一覧画面（`/admin/sessions`）で entry 経由のセッションも Stage 1 セッションと同様に表示・閲覧でき、entry 経由セッションの場合は候補者名・募集情報が正しく表示されるようにしたい。

#### 受け入れ基準

1. The admin app shall セッション一覧画面（`/admin/sessions`）が `entry_id IS NOT NULL` のセッションを一覧に表示し、候補者名として `candidate_profile.display_name` を使用する。
2. The admin app shall セッション一覧画面が `entry_id IS NULL`（Stage 1 形式）のセッションは従来通り `candidate.name` を表示する。
3. The admin app shall セッション詳細画面（`/admin/sessions/[id]`）が entry 経由セッションの場合、opening タイトル・会社名・候補者プロフィール情報を追加表示する。
4. The admin app shall 既存の手動評価入力・LLM 評価との突合・CSV/JSON エクスポート機能が entry 経由セッションに対しても正常に動作する（採点・エクスポートのロジックは変更しない）。
