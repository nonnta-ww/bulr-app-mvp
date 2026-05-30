# 要件定義 — skill-survey

## プロジェクト概要

候補者（`apps/candidate` ユーザー）が職種別の静的構造化フォームに回答し、自分のスキル像（L1 棚卸し結果）を確認できる機能を実装する。マスタデータは `docs/backend-skills.csv`（バックエンド職種）を Drizzle seed で投入し、回答は `candidate_profile.id` に紐づいて保存される。LLM は一切使わず、静的な選択式フォーム（一部自由記述）で完結する。Wave 3 `session-from-entry` が `getLatestResponseByCandidateProfileId` を通じてこのデータを読み出せるよう、読み出し API の安定性を保証する。

## スコープ境界

- **スコープ内**: `skill_survey` / `skill_survey_category` / `skill_survey_question` / `skill_survey_choice` マスタスキーマ＋マイグレーション、`skill_survey_response` / `skill_survey_answer` 回答スキーマ＋マイグレーション、バックエンド職種 1 件分の seed スクリプト（`backend-skills.csv` から）、`apps/candidate/app/skill-survey/*` の回答フォーム UI＋L1 棚卸し結果表示 UI、`getLatestResponseByCandidateProfileId` 読み出しクエリ（Wave 3 公開 seam）、同一 survey の再回答ロジック（最新版保持）、`requireCandidate` ガード経由のアクセス制御
- **スコープ外**: LLM によるスキル要約・自然言語フィードバック、数値スコアリング・年収査定・他者比較、`assessment_pattern` 選定ロジック（Wave 3）、admin CMS でのマスタ管理（Wave 4）、バックエンド以外の職種 survey、履歴書（`resume-registration`）
- **隣接 spec との期待関係**: `candidate-auth-onboarding` が提供する `candidate_profile.id` と `requireCandidate` ガードが前提。Wave 3 `session-from-entry` は本 spec が確立する `getLatestResponseByCandidateProfileId` を呼び出す。Wave 4 `mock-interview` は L1 棚卸し結果を参照する。Wave 4 `admin-operations` は `skill_survey` マスタの CMS を担当する。

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
