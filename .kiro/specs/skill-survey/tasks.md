# 実装タスク — skill-survey

> 本タスクリストは `skill-survey` spec の実装手順を記述する。各サブタスクは 1〜3 時間で完了できる粒度。`(P)` マーカーは並列実行可能タスク。`_Boundary:_` は責務範囲、`_Depends:_` は他タスクへの依存。
>
> **前提**: `candidate-auth-onboarding` spec が完了しており、`requireCandidate`、`authedAction`、`candidate_profile` テーブルが利用可能であること。

---

## 1. マスタスキーマ定義

### 1.1 ✅ `skill_survey` マスタ 4 テーブル + `question_type` pgEnum を実装

- `packages/db/src/schema/skill-survey.ts` を新規作成
- `pgEnum('question_type', ['single_choice', 'multi_choice', 'free_text'])` を `questionType` 名で export
- `pgTable('skill_survey', { id, job_type, title, description, is_active, created_at, updated_at })` を `skillSurvey` 名で export。`job_type` は `UNIQUE`
- `pgTable('skill_survey_category', { id, skill_survey_id FK, name, subcategory, display_order, created_at, updated_at })` を `skillSurveyCategory` 名で export。`(skill_survey_id, name, subcategory)` に `uniqueIndex` を設定（task 3.2 の upsert conflict target として必須）
- `pgTable('skill_survey_question', { id, category_id FK, body, question_type, display_order, created_at, updated_at })` を `skillSurveyQuestion` 名で export。`(category_id, body)` に `uniqueIndex` を設定（task 3.2 の upsert conflict target として必須）
- `pgTable('skill_survey_choice', { id, question_id FK, label, display_order, created_at })` を `skillSurveyChoice` 名で export。`(question_id, label)` に `uniqueIndex` を設定（task 3.2 の upsert conflict target として必須）
- 全テーブルの `id` は `text('id').primaryKey().$defaultFn(() => nanoid())`
- `$inferSelect` / `$inferInsert` 型を export
- 完了時の観察可能状態: `pnpm typecheck` が `packages/db` で成功し、`import { skillSurvey, questionType } from './schema/skill-survey'` が解決する
- _Boundary: MasterSchemaModule_
- _Requirements: 1.1, 1.2, 1.3, 1.4_

### 1.2 ✅ `skill_survey_response` / `skill_survey_answer` テーブルを実装 (P)

- `packages/db/src/schema/skill-survey-response.ts` を新規作成
- `pgTable('skill_survey_response', { id, candidate_profile_id FK, skill_survey_id FK, submitted_at, created_at, updated_at })` を `skillSurveyResponse` 名で export
- `(candidate_profile_id, skill_survey_id)` に `uniqueIndex` を設定
- `pgTable('skill_survey_answer', { id, response_id FK with ON DELETE CASCADE, question_id FK, selected_choice_ids text[], free_text, created_at })` を `skillSurveyAnswer` 名で export
- `$inferSelect` / `$inferInsert` 型を export
- 完了時の観察可能状態: `pnpm typecheck` が `packages/db` で成功する
- _Boundary: ResponseSchemaModule_
- _Requirements: 2.1, 2.2, 2.3_

### 1.3 ✅ schema バレルを更新

- `packages/db/src/schema/index.ts` に `export * from './skill-survey';` と `export * from './skill-survey-response';` を追加
- 完了時の観察可能状態: `import { skillSurvey, skillSurveyResponse } from '@bulr/db/schema'` が解決する（typecheck 成功）
- _Boundary: MasterSchemaModule, ResponseSchemaModule_
- _Depends: 1.1, 1.2, resume-registration task 1.1_（`schema/index.ts` は `candidate-auth-onboarding` → `resume-registration` の順で追記されており、本タスクは `resume-registration` の追加完了後に skill-survey 関連の export 行を追記する。ファイル全体を置換せず追記すること。）
- _Requirements: 1.6, 2.5_

---

## 2. マイグレーション生成と適用

### 2.1 ✅ drizzle-kit generate でマイグレーション SQL を生成

- `packages/db` ルートで `pnpm generate`（または `pnpm --filter @bulr/db generate`）を実行
- 6 テーブル分の migration SQL ファイルが `packages/db/drizzle/` に生成される
- 生成 SQL を目視レビュー: CREATE TYPE、6 つの CREATE TABLE、UNIQUE INDEX が含まれることを確認
- 完了時の観察可能状態: `ls packages/db/drizzle/` に新規 SQL ファイルが存在する
- _Boundary: MasterSchemaModule, ResponseSchemaModule_
- _Depends: 1.3_
- _Requirements: 1.5, 2.4_

### 2.2 ✅ dev branch への push と確認

- `DATABASE_URL` を dev branch に設定し `pnpm --filter @bulr/db push` を実行
- `psql` または Neon Console で `\d skill_survey`、`\d skill_survey_response` 等のカラム一覧が仕様通りであることを確認
- `\d skill_survey_response` で `UNIQUE(candidate_profile_id, skill_survey_id)` が存在することを確認
- 完了時の観察可能状態: 6 テーブルが dev DB に作成されている
- _Boundary: MasterSchemaModule, ResponseSchemaModule_
- _Depends: 2.1_
- _Requirements: 1.5, 2.4_

---

## 3. バックエンド職種 seed スクリプト

### 3.1 ✅ `backend.ts` シードデータを実装

- `packages/db/src/seeds/skill-surveys/` ディレクトリを新規作成
- `packages/db/src/seeds/skill-surveys/backend.ts` を新規作成
- `docs/backend-skills.csv` の全行（カテゴリ / サブカテゴリ / 質問 / 選択肢）を TypeScript リテラルとして手動転記
- データ構造:
  ```typescript
  export type BackendSurveySeedData = {
    jobType: 'backend';
    title: string;
    categories: Array<{
      name: string;
      subcategory: string | null;
      displayOrder: number;
      questions: Array<{
        text: string;
        questionType: 'single_choice' | 'multi_choice' | 'free_text';
        displayOrder: number;
        choices: Array<{ text: string; displayOrder: number }>;
      }>;
    }>;
  };
  export const backendSurveySeed: BackendSurveySeedData = { ... };
  ```
- 「はい / いいえ」のみの設問は `single_choice`、複数回答可の設問は `multi_choice`、テキスト入力のみの設問は `free_text` に分類
- 完了時の観察可能状態: `pnpm typecheck` が通る（型注釈付き）
- _Boundary: BackendSeedModule_
- _Depends: 1.1_
- _Requirements: 3.1_

### 3.2 ✅ seed 実行関数を実装し `seeds/index.ts` から呼び出せるようにする

- `packages/db/src/seeds/skill-surveys/backend.ts` に `runBackendSkillSurveySeed(db: DB): Promise<void>` を実装
- **upsert 方式（idempotent）**: `db.transaction` + `onConflictDoUpdate` を全テーブルで統一使用。DELETE + INSERT による再構築方式は禁止（FK cascade で `skill_survey_answer.question_id` が dangling になるリスクがあるため）
- upsert の conflict target:
  - `skill_survey`: `onConflictDoUpdate({ target: skillSurvey.jobType, set: { title, description, updatedAt } })`
  - `skill_survey_category`: `onConflictDoUpdate({ target: [skillSurveyCategory.skillSurveyId, skillSurveyCategory.name, skillSurveyCategory.subcategory], set: { displayOrder, updatedAt } })`（UNIQUE インデックス `(skill_survey_id, name, subcategory)` が必要 → task 1.1 参照）
  - `skill_survey_question`: `onConflictDoUpdate({ target: [skillSurveyQuestion.categoryId, skillSurveyQuestion.body], set: { questionType, displayOrder, updatedAt } })`（UNIQUE インデックス `(category_id, body)` が必要 → task 1.1 参照）
  - `skill_survey_choice`: `onConflictDoUpdate({ target: [skillSurveyChoice.questionId, skillSurveyChoice.label], set: { displayOrder } })`（UNIQUE インデックス `(question_id, label)` が必要 → task 1.1 参照）
- **各テーブルの id は初回生成後不変**: `onConflictDoUpdate` の `set` に `id` を含めない。これにより既存回答の FK が dangling にならない
- `packages/db/src/seeds/index.ts` を更新し `runBackendSkillSurveySeed` の呼び出しを追加
- 完了後に `console.log` でカテゴリ数・設問数・選択肢数を出力
- 完了時の観察可能状態: `pnpm seed`（または相当コマンド）を実行して dev DB に投入でき、ログが出力される。2 回連続実行で id が変化しないことを psql で確認する
- _Boundary: BackendSeedModule_
- _Depends: 3.1, 2.2_
- _Requirements: 3.2, 3.3, 3.5_

### 3.3 ✅ seed の冪等性を確認

- `pnpm seed` を 2 回連続実行し、2 回目のレコード数が変わらないことを psql で確認
- `SELECT COUNT(*) FROM skill_survey_category;` 等が同値であることを確認
- 完了時の観察可能状態: 2 回実行後のレコード数が初回投入後と同値
- _Boundary: BackendSeedModule_
- _Depends: 3.2_
- _Requirements: 3.4_

---

## 4. Wave 3 読み出しクエリ

### 4.1 ✅ `getLatestResponseByCandidateProfileId` を実装 (P)

- `packages/db/src/queries/skill-survey/index.ts` を新規作成
- 関数シグネチャ:
  ```typescript
  export type SkillSurveyResponseWithAnswers = {
    response: typeof skillSurveyResponse.$inferSelect;
    answers: Array<{
      answer: typeof skillSurveyAnswer.$inferSelect;
      question: typeof skillSurveyQuestion.$inferSelect;
    }>;
  };

  export async function getLatestResponseByCandidateProfileId(
    candidateProfileId: string,
    surveyId: string,
  ): Promise<SkillSurveyResponseWithAnswers | null>
  ```
- `db.query.skillSurveyResponse.findFirst({ where: and(eq(...candidateProfileId), eq(...surveyId)), with: { answers: { with: { question: true } } } })` パターンで実装
- 存在しない場合は `null` を返す
- `packages/db/src/queries/index.ts` に `export * from './skill-survey';` を追加（ファイル全体を置換せず追記すること）
- 完了時の観察可能状態: `pnpm typecheck` が成功し、`import { getLatestResponseByCandidateProfileId } from '@bulr/db/queries'` が解決する
- _Boundary: SkillSurveyQueryModule_
- _Depends: 1.3, resume-registration task 1.3_（`queries/index.ts` は `resume-registration` が追加した後に skill-survey 関連の re-export を追記する。ファイル全体を置換せず追記すること。）
- _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

---

## 5. 回答フォーム UI

### 5.1 ✅ survey 一覧ページを実装

- `apps/candidate/app/skill-survey/page.tsx` を新規作成（Server Component）
- `requireCandidate()` でガード
- `db.query.skillSurvey.findMany({ where: eq(skillSurvey.isActive, true) })` でアクティブな survey 一覧を取得
- 各 survey のカードを表示し、リンク先は `/skill-survey/{surveyId}`
- `apps/candidate/app/skill-survey/_components/survey-list.tsx` に一覧 UI コンポーネントを切り出す
- 完了時の観察可能状態: 認証済みで `/skill-survey` にアクセスすると survey カード一覧が表示される
- _Boundary: SurveyListPage_
- _Depends: 4.1 (クエリ利用), 3.2 (seed 投入済み)_
- _Requirements: 4.1, 7.1_

### 5.2 ✅ 回答フォームページ（Server Component）を実装

- `apps/candidate/app/skill-survey/[surveyId]/page.tsx` を新規作成（Server Component）
- `requireCandidate()` でガード + `candidateProfile` 取得
- `surveyId` が存在しない場合は `notFound()` を呼ぶ
- マスタデータ（survey + categories + questions + choices）を全件取得して Client Component に渡す
- 既存回答があれば取得して初期値として渡す（再回答時のプリフィル）
- 完了時の観察可能状態: `/skill-survey/{seedで投入したsId}` にアクセスするとフォームページが表示される
- _Boundary: SurveyFormPage_
- _Depends: 5.1_
- _Requirements: 4.2, 7.1_

### 5.3 ✅ 回答フォーム Client Component を実装

- `apps/candidate/app/skill-survey/_components/survey-form.tsx` を `'use client'` で作成
- カテゴリ → 設問の順にセクション分割してレンダリング
- `single_choice` 設問 → `<question-single.tsx>` (radio group)
- `multi_choice` 設問 → `<question-multi.tsx>` (checkbox group)
- `free_text` 設問 → `<question-free-text.tsx>` (textarea)
- フォーム送信時に `submitSurvey` Server Action を呼び出す
- バリデーションエラーを各フィールド近辺に表示
- 完了時の観察可能状態: フォームが設問タイプに応じて正しい input 要素でレンダリングされる
- _Boundary: SurveyFormComponent_
- _Depends: 5.2_
- _Requirements: 4.3_

### 5.4 ✅ 送信 Server Action を実装

- `apps/candidate/app/skill-survey/[surveyId]/_actions/submit-survey.ts` を新規作成
- `authedAction` でラップ
- Zod スキーマを定義:
  ```typescript
  const submitSurveyInputSchema = z.object({
    surveyId: z.string().min(1),
    answers: z.array(z.object({
      questionId: z.string().min(1),
      selectedChoiceIds: z.array(z.string()).optional(),
      freeText: z.string().max(2000).optional(),
    })),
  });
  ```
- **`authedAction` の ctx は `{ userId }` のみ提供する**（`candidateProfileId` は含まない）。`candidateProfile` は以下のパターンで取得する:
  ```typescript
  export const submitSurvey = authedAction(
    submitSurveyInputSchema,
    async ({ surveyId, answers }, { userId }) => {
      const { candidateProfile } = await requireCandidate();
      // candidateProfile.id を使った upsert
    },
  );
  ```
- **`authedAction + requireCandidate()` の二重呼び出しパターン**: `authedAction` が認証を保証し、`requireCandidate()` が `candidate_profile` の存在を確認する（多層防御）。`candidateAction` は Wave 2 スコープ外
- `selectedChoiceIds` が指定されている場合、その ID が `skill_survey_choice` テーブルに実在することをサーバーサイドで検証
- `db.transaction` で:
  1. `skill_survey_response` を upsert（`onConflictDoUpdate({ target: [candidateProfileId, surveyId], set: { submittedAt, updatedAt } })`）
  2. 既存 `skill_survey_answer` を `DELETE WHERE response_id = responseId`
  3. 新規 `skill_survey_answer` を全設問分 INSERT
- 成功後 `redirect('/skill-survey/{surveyId}/result')`
- 完了時の観察可能状態: フォーム送信後に result ページにリダイレクトされ、DB にレコードが保存されている
- _Boundary: SubmitSurveyAction_
- _Depends: 5.3_
- _Requirements: 4.4, 4.5, 4.6, 4.7, 7.2, 7.3, 7.4_

---

## 6. L1 棚卸し結果表示

### 6.1 ✅ result ページを実装

- `apps/candidate/app/skill-survey/[surveyId]/result/page.tsx` を新規作成（Server Component）
- `requireCandidate()` でガード + `candidateProfileId` 取得
- `getLatestResponseByCandidateProfileId(candidateProfileId, surveyId)` を呼び出す
- `null` の場合（回答なし）は `/skill-survey/{surveyId}` にリダイレクト
- 回答済みの場合、カテゴリ → 設問 → 回答内容を構造化表示
  - `single_choice` / `multi_choice`: 選択した選択肢テキストを表示
  - `free_text`: 入力テキストをそのまま表示（LLM 変換・要約なし）
- 数値スコア、他者比較、年収は UI に含めない
- 完了時の観察可能状態: 回答済み状態で result ページにアクセスすると、カテゴリ別に回答内容が表示される
- _Boundary: SurveyResultPage_
- _Depends: 5.4, 4.1_
- _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1_

---

## 7. 統合確認と最終検証

### 7.1 ✅ エンドツーエンド動線の手動 smoke test を実施

- 候補者としてサインイン → `/skill-survey` で一覧表示 → survey 選択 → フォーム回答 → 送信 → result 表示の全動線を確認
- 再回答（同一 surveyId に 2 回目の送信）後、`skill_survey_response` のレコード数が増えていないことを psql で確認
- 未認証でのルートアクセスが適切にリダイレクトされることを確認
- 完了時の観察可能状態: 全動線がエラーなく動作し、DB の状態が期待通りである
- _Boundary: 統合テスト（全コンポーネント）_
- _Depends: 6.1_
- _Requirements: 4.1〜4.7, 5.1〜5.5, 7.1〜7.4_

### 7.2 ✅ Wave 3 seam の型レベル確認

- `getLatestResponseByCandidateProfileId` を仮の呼び出しコードで import し `pnpm typecheck` が通ることを確認
- `SkillSurveyResponseWithAnswers` 型の shape が Wave 3 で消費可能であることをコメントで記録
- 完了時の観察可能状態: `import { getLatestResponseByCandidateProfileId, type SkillSurveyResponseWithAnswers } from '@bulr/db'` が型エラーなしで解決する
- _Boundary: SkillSurveyQueryModule_
- _Depends: 4.1_
- _Requirements: 6.1, 6.4, 6.5_

### 7.3 ✅ ビルドとタイプチェックの全 workspace 確認

- `pnpm typecheck` が全 workspace（packages/db、packages/auth、apps/candidate、apps/business、apps/admin）で成功することを確認
- `pnpm build` が全 packages・apps で成功することを確認
- 完了時の観察可能状態: CI 相当の `pnpm typecheck && pnpm build` が完走する
- _Boundary: 全コンポーネント_
- _Depends: 7.1, 7.2_
- _Requirements: 全要件_

---
---

# Wave 5 UX 洗練タスク（要件 8〜12）

> 本セクションは roadmap.md `## Existing Spec Updates` に基づく既存 skill-survey の UX 拡張タスク。タスク 1〜7（コア実装）は完了済み。新テーブルは追加せず、`skill_survey_question.is_required` の加算的列追加と `apps/candidate/app/skill-survey/*` の UI 改修のみ。回答スキーマ（response/answer）と `getLatestResponseByCandidateProfileId` の既存契約は不変（`isRequired` の加算露出を除く）。設計は design.md「Wave 5 UX 洗練 設計（要件 8〜12）」を参照。

## 8. 必須フラグ基盤（スキーマ・マイグレーション・seed）

### 8.1 `skill_survey_question` に `is_required` 列を加算的に追加

- `packages/db/src/schema/skill-survey.ts` の `skillSurveyQuestion` に `isRequired: boolean('is_required').notNull().default(false)` を追加
- `skill_survey_response` / `skill_survey_answer` テーブルは変更しない（要件 12.1）
- `$inferSelect` 経由で `getLatestResponseByCandidateProfileId` の戻り値 `question` に `isRequired` が加算的に現れること。既存フィールドの型・名前は不変（要件 12.2）
- 完了時の観察可能状態: `pnpm --filter @bulr/db typecheck` が成功し、`skillSurveyQuestion.$inferSelect` に `isRequired: boolean` が含まれる
- _Boundary: MasterSchemaModule_
- _Requirements: 9.1, 9.2, 12.1, 12.2_

### 8.2 マイグレーション生成と dev push

- `pnpm --filter @bulr/db generate` で `ALTER TABLE skill_survey_question ADD COLUMN is_required boolean NOT NULL DEFAULT false` の migration が生成される
- 生成 SQL を目視レビュー: `skill_survey_response` / `skill_survey_answer` に差分が無いことを確認（要件 12.1）。バックフィル不要（DEFAULT false）
- dev branch へ push 後、`psql` で `\d skill_survey_question` に `is_required` 列が存在することを確認
- 完了時の観察可能状態: dev DB の `skill_survey_question` に `is_required` 列が存在する
- _Boundary: MasterSchemaModule_
- _Depends: 8.1_
- _Requirements: 9.1, 12.1_

### 8.3 seed に `is_required` を反映し必須設問を選定

- `packages/db/src/seeds/skill-surveys/backend.ts` の question 型に `isRequired: boolean` を追加
- **必須設問の選定（ユーザーと確定）**: 9 トップレベルカテゴリ × 設問の一覧（カテゴリ / サブカテゴリ / 設問文）を提示し、必須にする設問をユーザーが選定して `isRequired: true` を設定する。残りは `false`。位置ヒューリスティックではなく意図的に選んだ集合とする（candidate-self-analysis が各カテゴリの土台データを得られる代表設問を目安）
- seed runner（`backend.ts` の `runBackendSkillSurveySeed`）の question upsert の `set` に `is_required` を含める（`id` 不変方針は維持、要件 3 の冪等性を保持）
- 完了時の観察可能状態: 再 seed 後、選定した設問のみ `SELECT count(*) FROM skill_survey_question WHERE is_required = true` が選定集合と一致し、2 回連続実行で件数・`id` が不変
- _Boundary: BackendSeedModule_
- _Depends: 8.2_
- _Requirements: 9.3_

## 9. 共有構造ヘルパー

### 9.1 `survey-structure.ts` の純関数群を実装

- `apps/candidate/app/skill-survey/_lib/survey-structure.ts` を新規作成（`'use client'` を付けない純 TS。form/result/progress が共有）
- `groupByCategoryName`: distinct `category.name` 単位で `SurveyStep[]` を構成（サブカテゴリ行を保持、`displayOrder` 昇順、ステップ順は category.name の最小 displayOrder 昇順で安定）
- `isAnswered`: 内容ベースの回答済み判定（single/multi は選択肢 1 件以上、free_text は空白以外）。answer 行の有無では判定しない（単一の真実）
- `isRequiredSatisfied`: `is_required=false` は常に true、true は `isAnswered` と同基準
- `categoryStatus`: 必須設問があれば全必須充足で `'answered'`、無ければ `isAnswered` な設問が 1 問以上で `'answered'`
- `answersToStateMap`: DB の answers 配列を `questionId` キーの `Record<string, AnswerState>` に正規化
- 完了時の観察可能状態: `pnpm --filter candidate typecheck` 成功、client（form）と server（result page）の双方から import できる
- _Boundary: SurveyStructureLib_
- _Depends: 8.1_
- _Requirements: 8.1, 8.3, 9.5, 9.7, 9.8, 10.1, 11.2_

## 10. ウィザード回答フォーム

### 10.1 (P) 進捗インジケータコンポーネントを実装

- `apps/candidate/app/skill-survey/_components/survey-progress.tsx` を新規作成（presentational client）
- `steps` と `answers` を受け、現在位置（例「カテゴリ 3 / 9」）と各カテゴリの回答状態（`categoryStatus`）を視覚表示
- 完了時の観察可能状態: フォーム上部に「n / 9」と各カテゴリの回答済み/未回答が表示される
- _Boundary: SurveyProgress_
- _Depends: 9.1_
- _Requirements: 8.2, 8.3_

### 10.2 `survey-form.tsx` をカテゴリ名単位ウィザードに改修

- `groupByCategoryName(categories)` で `SurveyStep[]` を導出し、`currentStepIndex` で当該ステップ（1 カテゴリ名グループ）のみ描画
- 「戻る」「次へ」「送信」を配置。最終ステップでのみ送信ボタン（要件 8.6）。入力 state は全設問分を保持しステップ間で失わない（要件 8.4, 8.5）
- 「次へ」時に当該ステップの必須設問を `isRequiredSatisfied` で検証し、未充足はインラインエラーで前進中断（要件 9.5）。送信時は全ステップを検証し未充足ステップへ誘導
- 必須設問に視覚マーク（`*`）を表示（要件 9.4）
- `single_choice`→radio / `multi_choice`→checkbox（選択状態を明確化）/ `free_text`→textarea + 残り文字数表示、2000 字超で前進/送信中断（要件 10.2〜10.5、既存ロジック流用）
- サブカテゴリ見出しで設問をグルーピング（要件 10.1）。各設問の検証エラーは近傍にインライン表示（要件 10.6）
- 既存回答のプリフィルを維持（要件 8.7）。途中保存は実装しない（リロード/離脱で未送信入力は破棄、新規 state 永続フィールドを追加しない＝要件 12.4, 12.5）
- `survey-progress.tsx` を統合
- 完了時の観察可能状態: `/skill-survey/{surveyId}` が 9 ステップで表示され、次へ/戻るで入力が保持され、必須未回答で前進が中断され、最終ステップで送信できる
- _Boundary: SurveyFormComponent_
- _Depends: 9.1, 10.1_
- _Requirements: 8.1, 8.4, 8.5, 8.6, 8.7, 8.8, 9.4, 9.5, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 12.4, 12.5_

## 11. サーバ側必須検証

### 11.1 (P) `submit-survey.ts` にサーバ側必須検証を追加

- Zod `submitSurveySchema` の形は変更しない（`surveyId` + `answers[]`）。必須情報はクライアント送信を信頼せず DB から取得
- upsert 前に当該 survey の `skill_survey_question`（`is_required=true`）を DB 取得し、各必須設問のペイロード充足を再検証（single/multi は選択肢 1 件以上、free_text は非空白）
- 未充足があれば `{ ok: false, error: { code: 'MISSING_REQUIRED_ANSWERS', message } }` を返す（既存 `INVALID_CHOICE_IDS` と同じ envelope 規約）
- 既存の choice 実在確認・`onConflictDoUpdate` upsert・answer 全件差し替え・`redirect`・回答スキーマは不変（要件 12.1）
- 完了時の観察可能状態: クライアント検証を迂回した必須未充足ペイロードが `MISSING_REQUIRED_ANSWERS` で拒否され、DB に書き込まれない
- _Boundary: SubmitSurveyAction_
- _Depends: 8.2, 8.3_
- _Requirements: 9.6, 12.1_

## 12. 結果ビジュアル

### 12.1 (P) `survey-result.tsx` 結果ビューを実装

- `apps/candidate/app/skill-survey/_components/survey-result.tsx` を新規作成（presentational）
- 入力は result ページが組み立てた master 木（`CategoryWithQuestions[]`）＋回答 state Map＋choiceLabels
- `groupByCategoryName` でカテゴリ名 → サブカテゴリ → 設問の構造化カードに整形し、`categoryStatus` / `isAnswered`（共有定義）で回答済み/未回答バッジを描画（要件 11.1, 11.2）
- 選択肢は choice id → label を解決して表示、自由記述は入力どおり整形表示（要件 11.3）
- 数値スコア・強み弱み解釈・他者比較・成長アクションは描画しない（要件 11.4）
- 自己診断（`/self-analysis`）への導線リンクを置く（要件 11.5）
- 完了時の観察可能状態: カテゴリ名カードに回答内容と回答済み/未回答バッジが表示され、スコア・解釈・比較が一切表示されない
- _Boundary: SurveyResultView_
- _Depends: 9.1_
- _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

### 12.2 result ページを master 木組み立て + `survey-result.tsx` に差し替え

- `apps/candidate/app/skill-survey/[surveyId]/result/page.tsx` で master 木（`skillSurveyCategory` + `skillSurveyQuestion` + `skillSurveyChoice` を survey 単位取得し `CategoryWithQuestions[]` に組み立て）
- `getLatestResponseByCandidateProfileId` の回答を `answersToStateMap` で Record 化、choice id→label の Map を構築し `survey-result.tsx` に渡す
- 45 行 category id 単位の独自グルーピングを廃し `groupByCategoryName` に統一（Issue 1 対応）
- 既存の「未提出時リダイレクト」（要件 5.5）と「数値スコア・他者比較を出さない」（要件 5.4）は維持
- 完了時の観察可能状態: result ページがカテゴリ名単位の構造化カードで表示され、自己診断への導線リンクが機能する
- _Boundary: SurveyResultPage_
- _Depends: 8.1, 12.1_
- _Requirements: 11.1, 11.5_

## 13. 統合・回帰検証

### 13.1 ウィザード・必須・結果の手動 smoke test

- ウィザード: 9 ステップ表示、進捗（n/9）とカテゴリ回答状態、次へ/戻るで入力保持、最終ステップで送信、既存回答ありの再訪で全ステップにプリフィル
- 必須検証（クライアント）: 必須マーク（`*`）表示、必須未回答で「次へ／送信」が中断し該当設問にエラー
- 必須検証（サーバ）: クライアント検証を迂回した必須未充足ペイロードが `MISSING_REQUIRED_ANSWERS` で拒否される
- 選択肢/自由記述: サブカテゴリ見出しグルーピング、radio/checkbox の選択状態が明確、残り文字数表示、2000 字超で中断
- 結果: カテゴリ名単位の構造化カード、回答済み/未回答バッジ、スコア/解釈/比較なし、自己診断リンク、未提出時リダイレクト
- 途中保存なし: 未送信のまま離脱 → 再訪で確定済み回答のみ復元される
- 完了時の観察可能状態: 上記すべての UX 動線がエラーなく期待通りに動作する
- _Depends: 10.2, 11.1, 12.2_
- _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5, 12.4, 12.5_

### 13.2 candidate-self-analysis 回帰スモーク

- `is_required` 追加後、`/self-analysis` が従来どおり動作することを確認（最新回答を入力に強み・弱み可視化＋成長アクションが生成される）
- `getLatestResponseByCandidateProfileId` の戻り値が既存フィールド不変（`isRequired` の加算露出のみ）であることを型・実行で確認
- 完了時の観察可能状態: `/self-analysis` が変更前と同じ入力で正常動作する（回帰なし）
- _Depends: 8.2_
- _Requirements: 12.2, 12.3_

### 13.3 ビルドとタイプチェックの全 workspace 確認

- `pnpm typecheck` が全 workspace（packages/db、packages/auth、apps/candidate、apps/business、apps/admin）で成功する
- `pnpm build` が全 packages・apps で成功する
- 完了時の観察可能状態: `pnpm typecheck && pnpm build` が完走する
- _Depends: 13.1, 13.2_
- _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5, 12.1, 12.2, 12.3, 12.4, 12.5_
