# 要件定義 — skill-survey

## プロジェクト概要

候補者（`apps/candidate` ユーザー）が職種別の静的構造化フォームに回答し、自分のスキル像（L1 棚卸し結果）を確認できる機能を実装する。マスタデータは `docs/backend-skills.csv`（バックエンド職種）を Drizzle seed で投入し、回答は `candidate_profile.id` に紐づいて保存される。LLM は一切使わず、静的な選択式フォーム（一部自由記述）で完結する。Wave 3 `session-from-entry` が `getLatestResponseByCandidateProfileId` を通じてこのデータを読み出せるよう、読み出し API の安定性を保証する。

> **Wave 5 UX 洗練の追加スコープ（2026-06-05）**
> 要件 1〜7 はコア実装として完了済み（`phase: implemented`）。本改訂は roadmap.md `## Existing Spec Updates` の skill-survey 拡張として、**回答 UX の洗練**（要件 8〜12）を追加する。回答フォームをカテゴリ単位の多段ステップ（ウィザード）化し、設問単位の必須フラグと検証を強化し、L1 棚卸し結果表示のビジュアルを向上させる。新規テーブルは追加しない（必須フラグはマスタ `skill_survey_question` への加算的な列追加のみ）。回答スキーマ（`skill_survey_response` / `skill_survey_answer`）と読み出しクエリ `getLatestResponseByCandidateProfileId` の既存契約は変更せず、下流の `candidate-self-analysis` を回帰させない。途中保存（未送信入力の永続化）は今回スコープ外。

## スコープ境界

- **スコープ内**: `skill_survey` / `skill_survey_category` / `skill_survey_question` / `skill_survey_choice` マスタスキーマ＋マイグレーション、`skill_survey_response` / `skill_survey_answer` 回答スキーマ＋マイグレーション、バックエンド職種 1 件分の seed スクリプト（`backend-skills.csv` から）、`apps/candidate/app/skill-survey/*` の回答フォーム UI＋L1 棚卸し結果表示 UI、`getLatestResponseByCandidateProfileId` 読み出しクエリ（Wave 3 公開 seam）、同一 survey の再回答ロジック（最新版保持）、`requireCandidate` ガード経由のアクセス制御
- **スコープ外**: LLM によるスキル要約・自然言語フィードバック、数値スコアリング・年収査定・他者比較、`assessment_pattern` 選定ロジック（Wave 3）、admin CMS でのマスタ管理（Wave 4）、バックエンド以外の職種 survey、履歴書（`resume-registration`）
- **隣接 spec との期待関係**: `candidate-auth-onboarding` が提供する `candidate_profile.id` と `requireCandidate` ガードが前提。Wave 3 `session-from-entry` は本 spec が確立する `getLatestResponseByCandidateProfileId` を呼び出す。Wave 4 `mock-interview` は L1 棚卸し結果を参照する。Wave 4 `admin-operations` は `skill_survey` マスタの CMS を担当する。

### Wave 5 UX 洗練（要件 8〜12）の境界

- **スコープ内**: 回答フォームのカテゴリ単位多段ステップ（ウィザード）化＋進捗表示、設問単位の必須フラグ（`skill_survey_question.is_required` の加算的列追加）と必須検証のクライアント／サーバ両側強化、選択肢レンダリングと自由記述入力体験の改善、L1 棚卸し結果表示のビジュアル向上（構造化カード／カテゴリ回答状態／自己診断への導線）
- **スコープ外**: 途中保存・下書きの永続化（未送信入力のセッションをまたぐ保存）、強み・弱みの解釈／数値スコア／成長アクション提案（`candidate-self-analysis` が担当）、回答スキーマ・読み出しクエリの破壊的変更、新規テーブルの追加、バックエンド以外の職種 survey
- **隣接 spec との期待関係（UX 洗練）**: `candidate-self-analysis` は本 spec の `getLatestResponseByCandidateProfileId` を入力に強み・弱み可視化と成長アクションを担当する。UX 洗練は同関数の既存戻り値契約（`is_required` の加算的露出を除く）と回答スキーマを変更せず、`candidate-self-analysis` を回帰させない。結果ページは「棚卸しの構造化表示」に留め、解釈・分析は `candidate-self-analysis` へ導線で渡す。

---

## 要件一覧

### 要件 1: スキルアンケートマスタスキーマ

**目的:** 開発者として、職種別・カテゴリ別・設問別・選択肢別の 4 階層マスタが `packages/db` に存在することで、静的構造化フォームをマスタ駆動でレンダリングでき、マスタ変更を seed の再実行だけで反映できるようにしたい。

#### 受け入れ基準

1. The db package shall define a `skill_survey` table with columns: `id`, `job_type` (e.g., `'backend'`), `title`, `description`, `is_active` (default true), `created_at`, `updated_at`.
2. The db package shall define a `skill_survey_category` table with columns: `id`, `skill_survey_id` (FK to `skill_survey`), `name`, `subcategory` (nullable text), `display_order`, `created_at`, `updated_at`.
3. The db package shall define a `skill_survey_question` table with columns: `id`, `category_id` (FK to `skill_survey_category`), `text`, `question_type` (enum: `single_choice`, `multi_choice`, `free_text`), `display_order`, `created_at`, `updated_at`.
4. The db package shall define a `skill_survey_choice` table with columns: `id`, `question_id` (FK to `skill_survey_question`), `text`, `display_order`, `created_at`, `updated_at`.
5. The db package shall generate Drizzle migration files for all four master tables that can be applied to the Neon Postgres database.
6. All four master tables shall be exported from the `packages/db` barrel.

### 要件 2: 回答スキーマ

**目的:** 開発者として、候補者の回答が `candidate_profile.id` に紐づき永続化されることで、データオーナーシップを保証しつつ Wave 3 がスナップショット参照できるようにしたい。

#### 受け入れ基準

1. The db package shall define a `skill_survey_response` table with columns: `id`, `candidate_profile_id` (FK to `candidate_profile`), `skill_survey_id` (FK to `skill_survey`), `submitted_at`, `created_at`, `updated_at`.
2. The `skill_survey_response` table shall enforce that at most one response record exists per `(candidate_profile_id, skill_survey_id)` pair through a unique constraint, enabling upsert-based re-answer semantics.
3. The db package shall define a `skill_survey_answer` table with columns: `id`, `response_id` (FK to `skill_survey_response`), `question_id` (FK to `skill_survey_question`), `selected_choice_ids` (text array, nullable), `free_text` (nullable), `created_at`.
4. The db package shall generate Drizzle migration files for both response tables.
5. Both response tables shall be exported from the `packages/db` barrel.

### 要件 3: バックエンド職種 seed スクリプト

**目的:** 開発者として、`docs/backend-skills.csv` の内容が単一の seed スクリプト実行で dev/production DB に投入でき、再実行しても冪等であることで、マスタの初期設定と更新が安全に行えるようにしたい。

#### 受け入れ基準

1. The db package shall provide a seed file `packages/db/src/seeds/skill-surveys/backend.ts` that contains backend skill survey master data derived from `docs/backend-skills.csv`.
2. When the seed script is executed, the skill_survey system shall create or update one `skill_survey` record with `job_type = 'backend'`, its associated categories, questions, and choices using upsert (idempotent) operations.
3. The seed script shall be invocable from `packages/db/src/seeds/index.ts` following the same pattern as the `assessment-pattern-seed` spec.
4. When the seed script is executed a second time with unchanged data, the skill_survey system shall produce no net change in the database (idempotent behavior).
5. The seed entry point shall log the total number of categories, questions, and choices seeded upon successful completion.

### 要件 4: 回答フォーム UI

**目的:** 候補者として、`bulr.net/skill-survey` にアクセスしてバックエンド職種のスキルアンケートに回答できることで、自分のスキルを構造化して申告できるようにしたい。

#### 受け入れ基準

1. When an authenticated candidate with a `candidate_profile` visits `/skill-survey`, the candidate app shall display a list of available skill surveys to choose from.
2. When a candidate selects a survey and visits `/skill-survey/[surveyId]`, the candidate app shall render a form driven by the master data (categories → questions → choices) without any LLM involvement.
3. When a survey form is rendered, the candidate app shall display `single_choice` questions as radio groups, `multi_choice` questions as checkbox groups, and `free_text` questions as text areas.
4. When a candidate submits the survey form, the candidate app shall validate the submission using a Zod schema and reject invalid payloads.
5. When a valid submission is received, the candidate app shall save a `skill_survey_response` and associated `skill_survey_answer` records, replacing any previously existing response for the same `(candidate_profile_id, skill_survey_id)` pair.
6. If a candidate is not authenticated or does not have a `candidate_profile`, the candidate app shall redirect them appropriately using the `requireCandidate` guard.
7. After a successful submission, the candidate app shall redirect the candidate to the result page `/skill-survey/[surveyId]/result`.

### 要件 5: L1 棚卸し結果表示

**目的:** 候補者として、回答後に自分のスキル像が構造化表示で返ってくることで、自己認識を深め次のエントリーアクションに繋げられるようにしたい。

#### 受け入れ基準

1. When a candidate visits `/skill-survey/[surveyId]/result`, the candidate app shall display their submitted answers organized by category and subcategory.
2. The result page shall show which categories the candidate has experience in based on their answers, without computing any numeric score.
3. The result page shall display free-text answers as entered by the candidate without any transformation or LLM summarization.
4. The result page shall NOT display numeric scores, salary estimates, or comparisons with other candidates.
5. If a candidate visits the result page without having submitted a response, the candidate app shall redirect them to the survey form page.

### 要件 6: Wave 3 読み出し API

**目的:** Wave 3 `session-from-entry` の開発者として、候補者の最新スキルアンケート回答を `candidate_profile_id` と `survey_id` を指定して読み出せることで、パターン選定支援の入力データとして利用できるようにしたい。

#### 受け入れ基準

1. The db package shall provide a `getLatestResponseByCandidateProfileId(candidateProfileId: string, surveyId: string)` query function in `packages/db/src/queries/skill-survey/`.
2. When called with a valid `candidateProfileId` and `surveyId`, the function shall return the `skill_survey_response` record along with all associated `skill_survey_answer` records joined with their `skill_survey_question` data.
3. When no response exists for the given `(candidateProfileId, surveyId)` pair, the function shall return `null`.
4. The function signature and return type shall remain stable across Wave 3 and Wave 4 consumption without breaking changes.
5. The function shall be exported from the `packages/db` barrel or a documented subpath so that downstream specs can import it.

### 要件 7: アクセス制御と入力検証

**目的:** 開発者として、スキルアンケートの全エンドポイントが認証・認可ガードと Zod 入力検証を持つことで、不正アクセスや不正データ送信からシステムを守れるようにしたい。

#### 受け入れ基準

1. The candidate app shall protect all skill-survey routes (list, form, result) using the `requireCandidate` guard from `packages/auth`, rejecting unauthenticated requests and candidates without a `candidate_profile`.
2. The candidate app shall use a Zod schema to validate the survey submission payload before any database write, enforcing that choice IDs reference valid choices and that free-text fields do not exceed 2000 characters per question.
3. The candidate app Server Action for survey submission shall follow the `authedAction` wrapper pattern consistent with other candidate app server actions.
4. The db queries for skill-survey shall scope all read operations to the `candidate_profile_id` of the authenticated user, preventing cross-candidate data access.

---

## 要件一覧（Wave 5 UX 洗練 — 要件 8〜12）

> 以下は roadmap.md `## Existing Spec Updates` に基づく既存 skill-survey の UX 拡張。要件 1〜7（コア実装）を前提に、回答 UX とビジュアルを洗練する。

### 要件 8: カテゴリ単位の多段ステップ回答フォーム

**目的:** 候補者として、スキルアンケートをカテゴリ単位の多段ステップ（ウィザード）で回答できることで、長いアンケートでも現在地と残量を把握しながら一度に一つのカテゴリへ集中できるようにしたい。

#### 受け入れ基準

1. When 認証済み候補者が `/skill-survey/[surveyId]` を開いたとき, the candidate app shall マスタの 1 カテゴリを 1 ステップとして扱い、最初のカテゴリステップのみを表示する。
2. While あるカテゴリステップを表示している間, the candidate app shall 全カテゴリ数に対する現在のカテゴリ位置（例: 「カテゴリ 2 / 4」）と進捗インジケータを表示する。
3. While 進捗インジケータを表示している間, the candidate app shall 各カテゴリの回答状態（回答済み／未回答）を視覚的に示す。
4. When 候補者が「次へ」を操作したとき, the candidate app shall 現在のステップの入力を保持したまま次のカテゴリステップへ遷移する。
5. When 候補者が「戻る」を操作したとき, the candidate app shall 入力を失わずに直前のカテゴリステップへ戻る。
6. While 最後のカテゴリステップを表示している間, the candidate app shall 「次へ」ではなく送信アクションを提示する。
7. When 既存回答のある survey を再訪したとき, the candidate app shall 確定済みの回答を全ステップにプリフィルする。
8. The candidate app shall 各カテゴリ内の設問を、マスタの並び順（カテゴリ → サブカテゴリ → 設問の `display_order`）に従って表示する。

### 要件 9: 設問必須フラグと入力検証の強化

**目的:** プロダクト担当および開発者として、設問単位で回答必須を指定でき、未回答のまま送信できないようにすることで、回答品質を担保し下流の自己診断における入力欠損を減らせるようにしたい。

#### 受け入れ基準

1. The db package shall add an `is_required` column (boolean, default `false`) to the `skill_survey_question` table and generate a corresponding Drizzle migration.
2. The db package shall keep this change additive: the `skill_survey_response` / `skill_survey_answer` table structures and the existing return fields of `getLatestResponseByCandidateProfileId` shall remain unchanged (除く: `is_required` の加算的な露出)。
3. When the backend seed script is executed, the skill_survey system shall set each question's `is_required` value idempotently (再実行で冪等)。
4. While 必須設問を含むカテゴリステップを表示している間, the candidate app shall 当該設問が必須であることを視覚的に示す。
5. If 候補者が必須設問を未回答のままステップを前進または送信しようとしたとき, then the candidate app shall 前進／送信を中断し、未充足の必須設問を示すエラーを表示する。
6. When a survey submission is received, the candidate app shall サーバ側でもすべての必須設問が回答済みであることを検証し、未充足のペイロードを拒否する。
7. Where 必須設問が `single_choice` または `multi_choice` の場合, the candidate app shall 少なくとも 1 件の選択肢が選択されていることを必須充足の条件とする。
8. Where 必須設問が `free_text` の場合, the candidate app shall 空白のみでない文字列が入力されていることを必須充足の条件とする。

### 要件 10: 選択肢レンダリングと回答体験の改善

**目的:** 候補者として、各設問タイプが見やすく操作しやすい形で提示されることで、迷わず正確に自己申告できるようにしたい。

#### 受け入れ基準

1. When カテゴリステップを表示するとき, the candidate app shall そのカテゴリにサブカテゴリが存在する場合、設問をサブカテゴリ見出しでグルーピングして表示する。
2. The candidate app shall `single_choice` 設問を、選択中の状態が視覚的に明確な単一選択 UI として表示する。
3. The candidate app shall `multi_choice` 設問を、選択中の状態が視覚的に明確な複数選択 UI として表示する。
4. While 候補者が `free_text` 設問に入力している間, the candidate app shall 上限 2000 文字に対する残り文字数をリアルタイムに表示する。
5. If `free_text` 設問の入力が 2000 文字を超えたとき, then the candidate app shall 超過を視覚的に示し、当該ステップの前進／送信を中断する。
6. The candidate app shall 各設問の検証エラーを、該当設問の近傍にインラインで表示する。

### 要件 11: L1 棚卸し結果表示のビジュアル向上

**目的:** 候補者として、回答後に自分の棚卸し結果が構造化された見やすい形で返ってくることで、自己認識を整理し、必要に応じて自己診断へ進めるようにしたい。

> 本要件は要件 5（L1 棚卸し結果表示）の提示要件を継承・拡張する。要件 5 の制約（数値スコア・年収・他者比較を出さない、未提出時はフォームへリダイレクト）は引き続き有効。

#### 受け入れ基準

1. When 候補者が `/skill-survey/[surveyId]/result` を開いたとき, the candidate app shall 回答をカテゴリ／サブカテゴリ単位の構造化されたカード形式で表示する。
2. The result page shall 各カテゴリについて「回答済み／未回答」の状態を視覚的に示す（数値スコアは用いない）。
3. The result page shall 自由記述の回答を、候補者が入力したまま変換や LLM 要約を行わずに整形表示する。
4. The result page shall NOT 強み・弱みの解釈、数値スコア、年収査定、成長アクション提案、他者比較を表示する（これらは `candidate-self-analysis` が担当する境界）。
5. The result page shall 候補者を自己診断（`candidate-self-analysis`）へ進める導線を提示する。

### 要件 12: 既存データ契約の維持とスコープ外（回帰防止）

**目的:** 開発者として、UX 洗練が下流の `candidate-self-analysis` を壊さないことを保証することで、既存機能を回帰させずに改善を進められるようにしたい。

#### 受け入れ基準

1. The skill-survey UX 洗練 shall `skill_survey_response` / `skill_survey_answer` のテーブル構造を変更しない。
2. The skill-survey UX 洗練 shall `getLatestResponseByCandidateProfileId` の関数シグネチャと既存戻り値フィールドを変更しない（`is_required` の加算的露出を除く）。
3. While UX 洗練の実装後の状態において, the candidate-self-analysis 機能 shall 変更前と同一の入力（最新回答）で従来どおり動作する。
4. The skill-survey UX 洗練 shall 途中保存（未送信入力のセッションをまたぐ永続化）を実装しない。
5. When 候補者が未送信の入力を残したままページを離脱したとき, the candidate app shall 確定済み回答のみを保持し、未送信入力は破棄する（途中保存しない）。
