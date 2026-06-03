# 実装タスク

## タスク一覧

- [ ] 1. スキーマ変更とマイグレーション

_Requirements:_ 6.2, 6.3
_Boundary:_ packages/db/src/schema/candidate-profile.ts, packages/db/src/schema/company.ts, migration ファイル
_Depends:_ なし（最初に実施すること）

- [x] 1.1 `candidate_profile` テーブルに `is_active` カラムを追加する

> **注意**: `quota_reset_at` カラムは mock-interview spec（Wave 4a）が所有・追加する。admin-operations はこのカラムを ADD COLUMN しない。mock-interview の migration が先行適用済みであることを前提として参照（READ/WRITE）のみ行う。

- `packages/db/src/schema/candidate-profile.ts` に `isActive: boolean('is_active').notNull().default(true)` を追加
- `CandidateProfile` 型・`NewCandidateProfile` 型が `isActive` を含む（`quotaResetAt` は mock-interview schema 定義から既に存在）
- `pnpm typecheck` がエラーなし

- [x] 1.2 `company` テーブルに `is_active` カラムを追加する

- `packages/db/src/schema/company.ts` に `isActive: boolean('is_active').notNull().default(true)` を追加
- `Company` 型・`NewCompany` 型が新カラムを含む
- `pnpm typecheck` がエラーなし

- [x] 1.3 Drizzle マイグレーションファイルを生成してローカル DB に適用する

> **前提**: mock-interview（Wave 4a）が先行して `quota_reset_at` カラムを追加済みであること。本タスクのマイグレーションは `is_active` のみ追加する（`quota_reset_at` は含めない）。

- `pnpm drizzle-kit generate` を実行してマイグレーション SQL が生成される（`is_active` カラムのみ対象）
- `pnpm drizzle-kit push`（dev）でローカル Neon DB に適用される
- 既存レコードの `is_active` がすべて `true`（DEFAULT）になっている

---

- [ ] 2. 候補者管理クエリ関数

_Requirements:_ 1.1, 1.2, 1.3, 6.4
_Boundary:_ packages/db/src/queries/admin/candidates-query.ts
_Depends:_ 1.1, 1.3、**mock-interview Wave 4a 完了**（`quota_reset_at` カラムおよび `mock_interview` テーブルが DB に存在すること）

- [x] 2.1 `getCandidatesForAdmin` クエリ関数を実装する

- `packages/db/src/queries/admin/candidates-query.ts` を新規作成
- `candidate_profile` LEFT JOIN `user`（メール）LEFT JOIN `mock_interview`（当月件数）LEFT JOIN `skill_survey_response`（完了フラグ）
- 当月件数は正規ウィンドウ式 `GREATEST(date_trunc('month', now()), COALESCE(quota_reset_at, date_trunc('month', now())))` 以降の件数を集計（`quota_reset_at` が NULL でも月初基準となり、NULL 返却を防ぐ）
- `search` パラメータで `displayName` または `email` の部分一致フィルタ
- `isActive` パラメータで `is_active` フィルタ
- `page` / `pageSize` パラメータでページング（LIMIT / OFFSET）
- `{ items: CandidateListItem[]; total: number }` を返す
- `pnpm typecheck` がエラーなし

- [x] 2.2 `getCandidateProfileDetail` クエリ関数を実装する

- 同ファイルに `getCandidateProfileDetail(candidateProfileId: string)` を追加
- `candidate_profile` + `user` + `resume_document` 一覧 + `skill_survey_response` + `mock_interview` 一覧を結合取得
- 対象レコード不在の場合 `undefined` を返す
- `CandidateProfileDetail` インターフェースを満たす
- `pnpm typecheck` がエラーなし

- [x] 2.3 `packages/db/src/queries/admin/index.ts` に候補者クエリを re-export する

> **バレル更新ルール（APPEND-ONLY）**: `index.ts` は `admin-review-panel` が所有するファイルに既存 export（`session-list-query`・`session-detail-query`）がある。本タスク以降のすべてのバレル更新は既存行を書き換えず、末尾に 1 行追加する形とすること。タスク 3.3・4.2・5.2・6.3 でも同様に追記のみ行う。

- `export * from './candidates-query'` を末尾に追加
- 既存の `session-list-query`・`session-detail-query` の export を維持
- `pnpm typecheck` がエラーなし

---

- [ ] 3. 企業管理クエリ関数

_Requirements:_ 2.1, 2.2, 2.3, 6.4
_Boundary:_ packages/db/src/queries/admin/companies-query.ts
_Depends:_ 1.2, 1.3

- [x] 3.1 `getCompaniesForAdmin` クエリ関数を実装する

- `packages/db/src/queries/admin/companies-query.ts` を新規作成
- `company` LEFT JOIN `opening`（件数集計）
- `search` / `isActive` / `page` / `pageSize` パラメータ対応
- `{ items: CompanyListItem[]; total: number }` を返す
- `pnpm typecheck` がエラーなし

- [x] 3.2 `getCompanyDetail` クエリ関数を実装する

- 同ファイルに `getCompanyDetail(companyId: string)` を追加
- `company` + `opening` 一覧 + `user_profile`（`company_id` 一致）+ `user`（メール）を結合取得
- 対象レコード不在の場合 `undefined` を返す
- `CompanyDetail` インターフェースを満たす
- `pnpm typecheck` がエラーなし

- [x] 3.3 `packages/db/src/queries/admin/index.ts` に企業クエリを re-export する

> **APPEND-ONLY**: 既存 export 行を変更せず `export * from './companies-query'` を末尾に追記する（タスク 2.3 参照）。

- `export * from './companies-query'` を末尾に追加
- `pnpm typecheck` がエラーなし

---

- [ ] 4. スキルアンケートマスタクエリ関数

_Requirements:_ 3.1, 3.2, 6.4
_Boundary:_ packages/db/src/queries/admin/skill-survey-master-query.ts
_Depends:_ なし（スキーマ変更不要）

- [ ] 4.1 `getSkillSurveyList` および `getSkillSurveyMaster` クエリ関数を実装する

- `packages/db/src/queries/admin/skill-survey-master-query.ts` を新規作成
- `getSkillSurveyList()`: `skill_survey` 全件取得（`id`・`jobType`・`title`・`isActive`）
- `getSkillSurveyMaster(surveyId)`: survey + category + question + choice のネストしたツリーを返す
  - JOIN または複数クエリで取得しアプリ側でネスト構造に変換
  - `SkillSurveyTree` インターフェースを満たす
- `pnpm typecheck` がエラーなし

- [ ] 4.2 `packages/db/src/queries/admin/index.ts` にスキルアンケートクエリを re-export する

> **APPEND-ONLY**: 既存 export 行を変更せず `export * from './skill-survey-master-query'` を末尾に追記する（タスク 2.3 参照）。

- `export * from './skill-survey-master-query'` を末尾に追加
- `pnpm typecheck` がエラーなし

---

- [ ] 5. アセスメントパターンクエリ関数

_Requirements:_ 4.1, 4.2, 6.4
_Boundary:_ packages/db/src/queries/admin/assessment-pattern-query.ts
_Depends:_ なし

- [ ] 5.1 `getAssessmentPatternsForAdmin` および `getAssessmentPatternDetail` クエリ関数を実装する

- `packages/db/src/queries/admin/assessment-pattern-query.ts` を新規作成
- `getAssessmentPatternsForAdmin()`: 全パターンを `code` 昇順で取得（`id`・`code`・`category`・`title`・`isActive`）
- `getAssessmentPatternDetail(code)`: パターン 1 件の全フィールドを取得。存在しない場合は `undefined`
- `pnpm typecheck` がエラーなし

- [ ] 5.2 `packages/db/src/queries/admin/index.ts` にパターンクエリを re-export する

> **APPEND-ONLY**: 既存 export 行を変更せず `export * from './assessment-pattern-query'` を末尾に追記する（タスク 2.3 参照）。

- `export * from './assessment-pattern-query'` を末尾に追加
- `pnpm typecheck` がエラーなし

---

- [ ] 6. 監視クエリ関数（LLM コスト・クォータ）

_Requirements:_ 5.1, 5.2, 5.3, 5.4, 6.4
_Boundary:_ packages/db/src/queries/admin/monitoring-query.ts
_Depends:_ タスク 1.1・1.3（`is_active` カラム）、**mock-interview Wave 4a 完了**（`mock_interview` テーブル、`quota_reset_at` カラム、`packages/db/src/queries/index.ts` の mock-interview export が存在すること）

- [ ] 6.1 `getLlmCostMetrics` クエリ関数を実装する

- `packages/db/src/queries/admin/monitoring-query.ts` を新規作成
- `mock_interview` テーブルの `metadata` JSONB から `llm_cost_estimate.estimated_usd`・`input_tokens`・`output_tokens` を集計
  - `(metadata->'llm_cost_estimate'->>'estimated_usd')::numeric` で数値取得
  - `metadata IS NOT NULL AND metadata->'llm_cost_estimate' IS NOT NULL` を WHERE 条件に追加
- 日次トレンド: `date_trunc('day', created_at)` で過去 30 日間を集計
- 候補者別トップ 10: `candidate_profile_id` でグループ化し `SUM(estimated_usd) DESC LIMIT 10`
  - `candidate_profile` を JOIN して `displayName` を取得
- `LlmCostMetrics` インターフェースを満たす（データなしの場合は 0 値・空配列）
- `pnpm typecheck` がエラーなし

- [ ] 6.2 `getCandidateQuotaUsage` クエリ関数を実装する

- 同ファイルに `getCandidateQuotaUsage()` を追加
- `candidate_profile` LEFT JOIN `user`（メール）LEFT JOIN `mock_interview`（`quota_reset_at` 考慮の当月件数）
- 当月件数の FILTER 条件は正規ウィンドウ式を使用する: `mi.created_at >= GREATEST(date_trunc('month', now()), COALESCE(cp.quota_reset_at, date_trunc('month', now())))` — `quota_reset_at` が NULL の場合も月初が基準となり NULL 返却を防ぐ
- `used_this_month >= 3` の候補者に `isLimitReached: true` をセット
- `CandidateQuotaUsage[]` を `usedThisMonth DESC` 順で返す
- `pnpm typecheck` がエラーなし

- [ ] 6.3 `packages/db/src/queries/admin/index.ts` に監視クエリを re-export する

> **APPEND-ONLY**: 既存 export 行を変更せず `export * from './monitoring-query'` を末尾に追記する（タスク 2.3 参照）。

- `export * from './monitoring-query'` を末尾に追加
- `pnpm typecheck` がエラーなし

---

- [ ] 7. 候補者管理 Server Actions

_Requirements:_ 1.4, 1.5, 1.6, 6.2, 6.5
_Boundary:_ apps/admin/app/candidates/_actions/
_Depends:_ 1.1, 1.3, 2.1

- [ ] 7.1 `disableCandidateProfile` Server Action を実装する

- `apps/admin/app/candidates/_actions/disable-candidate.ts` を新規作成
- `'use server'` 指定
- `adminAction(z.object({ candidateProfileId: z.string().min(1) }), ...)` でラップ
- `candidate_profile` の `is_active` を `false` に更新
- `revalidatePath('/candidates')` と `revalidatePath('/candidates/${id}')` を実行
- `pnpm typecheck` がエラーなし

- [ ] 7.2 `resetCandidateQuota` Server Action を実装する

- `apps/admin/app/candidates/_actions/reset-quota.ts` を新規作成
- `adminAction(z.object({ candidateProfileId: z.string().min(1) }), ...)` でラップ
- `candidate_profile.quota_reset_at = new Date()` に更新（`mock_interview` レコードは削除しない）
- `revalidatePath('/candidates/${id}')` と `revalidatePath('/monitoring/quota')` を実行
- `pnpm typecheck` がエラーなし

---

- [ ] 8. 企業管理 Server Actions

_Requirements:_ 2.4, 2.5, 2.6, 6.2, 6.5
_Boundary:_ apps/admin/app/companies/_actions/
_Depends:_ 1.2, 1.3, 3.1

- [ ] 8.1 `createCompany` Server Action を実装する

- `apps/admin/app/companies/_actions/create-company.ts` を新規作成
- `adminAction(z.object({ name: z.string().min(1).max(200) }), ...)` でラップ
- `company` テーブルに INSERT（`is_active: true`）
- 作成後 `redirect('/companies/${created.id}')` を実行
- `pnpm typecheck` がエラーなし

- [ ] 8.2 `disableCompany` Server Action を実装する

- `apps/admin/app/companies/_actions/disable-company.ts` を新規作成
- `adminAction(z.object({ companyId: z.string().min(1) }), ...)` でラップ
- `company.is_active = false` に更新
- `revalidatePath('/companies')` と `revalidatePath('/companies/${id}')` を実行
- `pnpm typecheck` がエラーなし

---

- [ ] 9. スキルアンケート CMS Server Actions

_Requirements:_ 3.3, 3.4, 3.5, 6.5
_Boundary:_ apps/admin/app/masters/skill-survey/_actions/
_Depends:_ 4.1

- [ ] 9.1 `updateSkillSurveyQuestion` Server Action を実装する

- `apps/admin/app/masters/skill-survey/_actions/update-question.ts` を新規作成
- Zod スキーマ: `{ questionId, body: string min1 max1000, questionType: enum, displayOrder: int >= 0 }`
- `adminAction` でラップ
- `skill_survey_question` を WHERE `id = questionId` で UPDATE
- `surveyId` を取得して `revalidatePath('/masters/skill-survey/${surveyId}')` を実行
- `pnpm typecheck` がエラーなし

- [ ] 9.2 `updateSkillSurveyChoice` Server Action を実装する

- `apps/admin/app/masters/skill-survey/_actions/update-choice.ts` を新規作成
- Zod スキーマ: `{ choiceId, label: string min1 max500, displayOrder: int >= 0 }`
- `adminAction` でラップ
- `skill_survey_choice` を WHERE `id = choiceId` で UPDATE
- `surveyId` を取得して revalidatePath を実行
- `pnpm typecheck` がエラーなし

---

- [ ] 10. 候補者管理 UI ページ

_Requirements:_ 1.1, 1.2, 1.3, 6.1, 6.6
_Boundary:_ apps/admin/app/candidates/
_Depends:_ 2.1, 2.2, 2.3, 7.1, 7.2

- [ ] 10.1 `SearchFilter` 共通 Client Component を実装する

- `apps/admin/app/_components/search-filter.tsx` を新規作成（`'use client'`）
- Props: `{ placeholder: string; paramKey?: string }` — URL searchParams を更新する
- テキスト入力 + `router.push` で URL を更新（500ms debounce）
- `pnpm typecheck` がエラーなし

- [ ] 10.2 候補者一覧ページを実装する

- `apps/admin/app/candidates/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getCandidatesForAdmin` → `SearchFilter` + テーブル描画
- テーブル行: 表示名・メール・クォータ使用数/上限・アンケート完了フラグ・有効/無効バッジ・[詳細]リンク・[無効化]ボタン
- `is_active = false` の行をグレーアウト
- ページング UI（前へ/次へボタン）
- `pnpm typecheck` がエラーなし

- [ ] 10.3 候補者詳細ページを実装する

- `apps/admin/app/candidates/[id]/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getCandidateProfileDetail`（不在なら `notFound()`）
- セクション: 基本情報・履歴書一覧・アンケート回答サマリー・模擬面接履歴テーブル
- [クォータリセット] ボタン（`resetCandidateQuotaAction` 呼び出し）
- [無効化] ボタン（`disableCandidateProfileAction` 呼び出し）
- `pnpm typecheck` がエラーなし

---

- [ ] 11. 企業管理 UI ページ

_Requirements:_ 2.1, 2.2, 2.3, 2.4, 6.1, 6.6
_Boundary:_ apps/admin/app/companies/
_Depends:_ 3.1, 3.2, 3.3, 8.1, 8.2

- [ ] 11.1 `CreateCompanyForm` Client Component を実装する

- `apps/admin/app/_components/create-company-form.tsx` を新規作成（`'use client'`）
- 企業名テキスト入力 + [作成] ボタン
- `createCompanyAction` を呼び出し、エラー時はエラーメッセージ表示
- `pnpm typecheck` がエラーなし

- [ ] 11.2 企業一覧ページを実装する

- `apps/admin/app/companies/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getCompaniesForAdmin` → `SearchFilter` + テーブル + `CreateCompanyForm`
- テーブル行: 企業名・募集件数・有効/無効バッジ・[詳細]リンク
- `pnpm typecheck` がエラーなし

- [ ] 11.3 企業詳細ページを実装する

- `apps/admin/app/companies/[id]/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getCompanyDetail`（不在なら `notFound()`）
- セクション: 企業基本情報・募集一覧・所属面接官一覧
- [無効化] ボタン（`disableCompanyAction` 呼び出し）
- `pnpm typecheck` がエラーなし

---

- [ ] 12. スキルアンケート CMS UI ページ

_Requirements:_ 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.1, 6.6
_Boundary:_ apps/admin/app/masters/skill-survey/
_Depends:_ 4.1, 4.2, 9.1, 9.2

- [ ] 12.1 `SkillSurveyQuestionForm` および `SkillSurveyChoiceForm` Client Components を実装する

- `apps/admin/app/_components/skill-survey-question-form.tsx` を新規作成（`'use client'`）
  - Props: `{ question: SkillSurveyQuestion; surveyId: string }`
  - `body`・`questionType`（select）・`displayOrder` の入力フィールド
  - `updateSkillSurveyQuestionAction` を呼び出し
- `apps/admin/app/_components/skill-survey-choice-form.tsx` を新規作成（`'use client'`）
  - Props: `{ choice: SkillSurveyChoice; surveyId: string }`
  - `label`・`displayOrder` の入力フィールド
  - `updateSkillSurveyChoiceAction` を呼び出し
- `pnpm typecheck` がエラーなし

- [ ] 12.2 スキルアンケート一覧ページを実装する

- `apps/admin/app/masters/skill-survey/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getSkillSurveyList()` → サーベイカード一覧
- 各カードに[詳細/編集] リンク
- `pnpm typecheck` がエラーなし

- [ ] 12.3 スキルアンケート詳細/編集ページを実装する

- `apps/admin/app/masters/skill-survey/[surveyId]/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getSkillSurveyMaster`（不在なら `notFound()`）
- カテゴリ accordion 展開で設問リストを表示
- 各設問に `SkillSurveyQuestionForm` をインライン表示
- 各選択肢に `SkillSurveyChoiceForm` をインライン表示
- `pnpm typecheck` がエラーなし

---

- [ ] 13. アセスメントパターン閲覧 UI ページ

_Requirements:_ 4.1, 4.2, 4.3, 6.1
_Boundary:_ apps/admin/app/masters/assessment-pattern/
_Depends:_ 5.1, 5.2

- [ ] 13.1 アセスメントパターン一覧ページを実装する

- `apps/admin/app/masters/assessment-pattern/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getAssessmentPatternsForAdmin()` → テーブル表示
- テーブル行: コード・カテゴリ・タイトル・有効/無効バッジ・[詳細]リンク
- `pnpm typecheck` がエラーなし

- [ ] 13.2 アセスメントパターン詳細ページを実装する

- `apps/admin/app/masters/assessment-pattern/[code]/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getAssessmentPatternDetail(code)`（不在なら `notFound()`）
- 全フィールド表示（コード・カテゴリ・タイトル・説明・4 段階テンプレート・シグナル・AI 観点）
- 編集ボタンは存在しない（読み取り専用）
- `pnpm typecheck` がエラーなし

---

- [ ] 14. 監視ダッシュボード UI ページ

_Requirements:_ 5.1, 5.2, 5.3, 5.4, 5.5, 6.1
_Boundary:_ apps/admin/app/monitoring/
_Depends:_ 6.1, 6.2, 6.3

- [ ] 14.1 LLM コストダッシュボードページを実装する

- `apps/admin/app/monitoring/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getLlmCostMetrics()`
- 表示セクション:
  - 合計コスト（USD）・合計入力トークン・合計出力トークン
  - 日次トレンド（直近 30 日分 HTML テーブル or CSS バー表示）
  - 候補者別コスト上位 10 名テーブル
- チャートライブラリは不使用（CSS のみ）
- `pnpm typecheck` がエラーなし

- [ ] 14.2 クォータ使用状況ページを実装する

- `apps/admin/app/monitoring/quota/page.tsx` を新規作成（Server Component）
- `requireAdmin()` → `getCandidateQuotaUsage()`
- 表示: 候補者名・メール・当月使用回数/3・最終実施日・上限到達バッジ
- `isLimitReached = true` の行を視覚的に強調（赤バッジ等）
- `pnpm typecheck` がエラーなし

---

- [ ] 15. ナビゲーション統合

_Requirements:_ 6.1, 6.6
_Boundary:_ apps/admin/app/_components/header.tsx（または layout.tsx）
_Depends:_ 10.2, 11.2, 12.2, 13.1, 14.1

- [ ] 15.1 管理画面のナビゲーションに新規タブを追加する

- `apps/admin/app/_components/header.tsx`（または layout レベルの nav）を更新
- 追加タブ: 候補者（/candidates）・企業（/companies）・マスタ（/masters/skill-survey）・パターン（/masters/assessment-pattern）・監視（/monitoring）
- 既存タブ「セッション」（/sessions）は変更しない
- アクティブルート時にタブをハイライト
- `pnpm typecheck` がエラーなし

---

- [ ] 16. 統合確認・ビルド検証

_Requirements:_ 全要件
_Boundary:_ モノレポ全体
_Depends:_ 全タスク完了後

- [ ] 16.1 型チェックとビルドを通す

- `pnpm typecheck` がモノレポ全体でエラーなし
- `pnpm build` が `packages/db`・`apps/admin` でエラーなし

- [ ] 16.2 手動スモークテストを完走する

- 以下の操作が正常に動作する:
  1. `/candidates` — 候補者一覧表示（検索・フィルタ）
  2. `/candidates/[id]` — 候補者詳細表示・[無効化]・[クォータリセット]
  3. `/companies` — 企業一覧表示・[新規作成]
  4. `/companies/[id]` — 企業詳細表示・[無効化]
  5. `/masters/skill-survey/[surveyId]` — 設問編集・保存
  6. `/masters/assessment-pattern` — パターン一覧表示（編集ボタンなし）
  7. `/monitoring` — コストダッシュボード表示
  8. `/monitoring/quota` — クォータ使用状況表示
  9. `/sessions` — 既存セッション一覧が引き続き動作する
  10. `/sessions/[id]` — 既存セッション詳細が引き続き動作する
