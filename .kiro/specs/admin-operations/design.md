# 設計書

## 概要

本機能は `apps/admin`（admin.bulr.net）に運営タブ（candidates / companies / masters / monitoring）を追加する。既存の `admin-review-panel` 成果（セッション一覧・詳細・手動評価・エクスポート）は一切変更せず、新規ルートを並列追加する拡張スタイルをとる。

重いデータ取得は `packages/db/src/queries/admin/` の Server Component クエリ関数、変更系は Server Action。認可は既存 `requireAdmin()` / `adminAction` を踏襲。ソフトデリートは `is_active` boolean フラグで実装する。

**重要な前提**: `candidate_profile` および `company` テーブルには現状 `is_active` カラムが存在しない（スキーマ確認済み）。本 spec は早期タスクで Drizzle マイグレーションを追加する。

---

## Boundary Commitments

### This Spec Owns

- `candidate_profile` テーブルへの `is_active` boolean カラム追加（スキーマ変更 + migration）
- `company` テーブルへの `is_active` boolean カラム追加（スキーマ変更 + migration）
- `packages/db/src/queries/admin/` への新規クエリ関数（7 関数）
- `apps/admin/app/candidates/` 配下のルート一式（一覧・詳細）
- `apps/admin/app/companies/` 配下のルート一式（一覧・詳細）
- `apps/admin/app/masters/skill-survey/` 配下のルート一式（一覧・詳細）
- `apps/admin/app/masters/assessment-pattern/` 配下のルート一式（一覧・詳細）
- `apps/admin/app/monitoring/` 配下のルート一式（コスト・クォータ）
- Server Action 群（`disableCandidateProfile`・`resetCandidateQuota`・`disableCompany`・`createCompany`・`updateSkillSurveyQuestion`・`updateSkillSurveyChoice`）
- 新規 admin 専用コンポーネント（`apps/admin/app/_components/` 配下に追加）

### Out of Boundary

- `admin-review-panel` 既存 UI（`/sessions`・`/sessions/[id]`・エクスポート）への変更
- `mock-interview` のクォータ enforcement ロジック（セッション作成時の 3 回チェック）
- `assessment_pattern` の CREATE/UPDATE/DELETE
- `skill_survey` テーブル自体（`job_type`・`title`）の CRUD（カテゴリ新規作成・削除・設問削除・サーベイ削除）
- `entry-flow`・`session-from-entry`・`assessment-engine` のロジック変更
- Anthropic 課金 API の呼び出し
- 監査ログ、マルチテナント RBAC、大規模エクスポート

### Allowed Dependencies

- `@bulr/auth/server` — `requireAdmin()` および `adminAction` ラッパー（既設）
- `@bulr/db` — Drizzle クライアント、全スキーマ参照・クエリ関数
- `@bulr/db/queries/admin` — 既存 `sessionListQuery`・`sessionDetailQuery` と並列の新規クエリ
- Next.js 16 App Router、React 19、Tailwind CSS 4、Zod、shadcn/ui ベース
- `candidate_profile.quota_reset_at timestamptz NULL` — **mock-interview spec が所有・追加するカラム**。admin-operations はこのカラムを WRITE（`resetCandidateQuota`）および READ（クォータ表示）するのみ。mock-interview（Wave 4a）が先行してマイグレーション済みであることを前提とする。
- `mock_interview` テーブル — mock-interview spec が所有。admin-operations は参照（コスト集計・クォータ集計）のみ。CUD 操作は行わない。
- `packages/db/src/queries/index.ts` の mock-interview export — Wave 4a 完了後に利用可能。

### Revalidation Triggers

- `mock_interview` スキーマ変更（カラム名・`metadata` JSONB 構造変更）→ `getLlmCostMetrics`・`getCandidateQuotaUsage` クエリを更新（shared seam: mock-interview が権威）
- `candidate_profile` スキーマ変更（カラム型変更・FK 変更）→ `getCandidatesForAdmin`・`getCandidateProfileDetail` クエリを更新
- `company` スキーマ変更 → `getCompaniesForAdmin`・`getCompanyDetail` クエリを更新
- `skill_survey`・`skill_survey_question`・`skill_survey_choice` スキーマ変更 → `getSkillSurveyMaster` クエリ・CMS アクション・UI を更新
- `requireAdmin()` / `adminAction` 戻り値型変更 → 全 Server Action を更新
- `user_profile.company_id` の意味変更（企業ユーザー所属判定に利用中）→ `getCompanyDetail` を更新

---

## アーキテクチャ

### アーキテクチャパターン & 境界マップ

```
運営者 Browser
  │
  ▼
apps/admin（Next.js 16 App Router）
  ├── Server Components（ページ）
  │   ├── /candidates/page.tsx            — getCandidatesForAdmin
  │   ├── /candidates/[id]/page.tsx       — getCandidateProfileDetail
  │   ├── /companies/page.tsx             — getCompaniesForAdmin
  │   ├── /companies/[id]/page.tsx        — getCompanyDetail
  │   ├── /masters/skill-survey/page.tsx  — getSkillSurveyMaster (一覧)
  │   ├── /masters/skill-survey/[surveyId]/page.tsx — getSkillSurveyMaster (詳細)
  │   ├── /masters/assessment-pattern/page.tsx     — getAssessmentPatternsForAdmin
  │   ├── /masters/assessment-pattern/[code]/page.tsx — getAssessmentPatternDetail
  │   ├── /monitoring/page.tsx            — getLlmCostMetrics
  │   └── /monitoring/quota/page.tsx      — getCandidateQuotaUsage
  │
  ├── Server Actions
  │   ├── disableCandidateProfile         — candidate_profile.is_active = false
  │   ├── resetCandidateQuota             — candidate_profile.quota_reset_at = now()
  │   ├── disableCompany                  — company.is_active = false
  │   ├── createCompany                   — company INSERT
  │   ├── updateSkillSurveyQuestion       — skill_survey_question UPDATE
  │   └── updateSkillSurveyChoice         — skill_survey_choice UPDATE
  │
  └── Client Components（最小限）
      ├── SearchFilter                    — キーワード検索・フィルタ
      ├── SkillSurveyQuestionForm         — 設問編集フォーム
      ├── SkillSurveyChoiceForm           — 選択肢編集フォーム
      └── CreateCompanyForm              — 企業新規作成フォーム

packages/db/src/queries/admin/
  ├── 既存: session-list-query.ts
  ├── 既存: session-detail-query.ts
  ├── 新規: candidates-query.ts          — getCandidatesForAdmin / getCandidateProfileDetail
  ├── 新規: companies-query.ts           — getCompaniesForAdmin / getCompanyDetail
  ├── 新規: skill-survey-master-query.ts — getSkillSurveyMaster
  ├── 新規: assessment-pattern-query.ts  — getAssessmentPatternsForAdmin / getAssessmentPatternDetail
  ├── 新規: monitoring-query.ts          — getLlmCostMetrics / getCandidateQuotaUsage
  └── 更新: index.ts                     — 新規ファイルを re-export

packages/db/src/schema/
  ├── 更新: candidate-profile.ts         — is_active カラム追加（quota_reset_at は mock-interview が追加済みの前提で参照のみ）
  └── 更新: company.ts                   — is_active カラム追加
```

### テクノロジースタック

| 層 | 選択 / バージョン | 役割 |
| -- | --------------- | ---- |
| フレームワーク | Next.js 16 App Router | UI + Server Actions |
| UI | React 19 + Tailwind CSS 4 + shadcn/ui | 管理 UI |
| 認証 | Better Auth（`@bulr/auth/server`）| `requireAdmin()` / `adminAction` 再利用 |
| ORM | Drizzle ORM 0.45.x + Neon Postgres | 集約クエリ + UPDATE |
| バリデーション | Zod | Server Action 入力検証 |
| マイグレーション | drizzle-kit | `is_active` 追加（`quota_reset_at` は mock-interview 所有） |

---

## ファイル構造計画

### 新規作成ファイル

```
packages/db/src/schema/
├── candidate-profile.ts          MODIFIED: is_active boolean 追加（quota_reset_at は mock-interview が所有・追加済み、参照のみ）
└── company.ts                    MODIFIED: is_active boolean 追加

packages/db/src/migrations/
└── 00XX_add_is_active.sql  NEW: マイグレーションファイル（drizzle-kit generate で生成、is_active のみ追加）

packages/db/src/queries/admin/
├── candidates-query.ts           NEW
├── companies-query.ts            NEW
├── skill-survey-master-query.ts  NEW
├── assessment-pattern-query.ts   NEW
├── monitoring-query.ts           NEW
└── index.ts                      MODIFIED: 5 ファイルを re-export 追加

apps/admin/app/
├── candidates/
│   ├── page.tsx                  NEW: 候補者一覧 Server Component
│   ├── _actions/
│   │   ├── disable-candidate.ts  NEW: disableCandidateProfile Server Action
│   │   └── reset-quota.ts        NEW: resetCandidateQuota Server Action
│   └── [id]/
│       └── page.tsx              NEW: 候補者詳細 Server Component
├── companies/
│   ├── page.tsx                  NEW: 企業一覧 Server Component
│   ├── _actions/
│   │   ├── disable-company.ts    NEW: disableCompany Server Action
│   │   └── create-company.ts     NEW: createCompany Server Action
│   └── [id]/
│       └── page.tsx              NEW: 企業詳細 Server Component
├── masters/
│   ├── skill-survey/
│   │   ├── page.tsx              NEW: スキルアンケート一覧 Server Component
│   │   ├── _actions/
│   │   │   ├── update-question.ts  NEW: updateSkillSurveyQuestion Server Action
│   │   │   └── update-choice.ts    NEW: updateSkillSurveyChoice Server Action
│   │   └── [surveyId]/
│   │       └── page.tsx          NEW: スキルアンケート詳細/ツリー Server Component
│   └── assessment-pattern/
│       ├── page.tsx              NEW: アセスメントパターン一覧 Server Component
│       └── [code]/
│           └── page.tsx          NEW: アセスメントパターン詳細 Server Component
├── monitoring/
│   ├── page.tsx                  NEW: LLM コストダッシュボード Server Component
│   └── quota/
│       └── page.tsx              NEW: クォータ使用状況 Server Component
└── _components/
    ├── search-filter.tsx         NEW: キーワード検索・フィルタ (Client Component)
    ├── skill-survey-question-form.tsx  NEW: 設問編集フォーム (Client Component)
    ├── skill-survey-choice-form.tsx    NEW: 選択肢編集フォーム (Client Component)
    └── create-company-form.tsx   NEW: 企業新規作成フォーム (Client Component)
```

---

## システムフロー

### 候補者一覧 + 無効化フロー

```
運営者 Browser
  → GET /candidates
  → requireAdmin()
  → getCandidatesForAdmin({ search, isActive, page })
  → candidate_profile LEFT JOIN mock_interview（当月件数集計）
     LEFT JOIN skill_survey_response（完了フラグ）
  → CandidatesListPage (Server Component)
      → SearchFilter (Client Component)
      → 候補者テーブル + [無効化] ボタン
  → [無効化] クリック → disableCandidateProfile(candidateProfileId)
      → requireAdmin() ガード
      → candidate_profile SET is_active = false WHERE id = ?
      → revalidatePath('/candidates')
```

### クォータリセットフロー

```
候補者詳細ページ → [クォータリセット] ボタン
  → resetCandidateQuota(candidateProfileId)
      → requireAdmin() ガード
      → candidate_profile SET quota_reset_at = NOW() WHERE id = ?
      → revalidatePath('/candidates/[id]')

クォータカウント計算（mock-interview と共有する正規ウィンドウ式）:
  当月件数 = COUNT(mock_interview WHERE candidate_profile_id = ?
                   AND created_at >= GREATEST(
                         date_trunc('month', now()),
                         COALESCE(quota_reset_at, date_trunc('month', now()))
                       ))
  ※ COALESCE により quota_reset_at が NULL でも月初が基準となり、GREATEST(NULL, 月初) で NULL が返る問題を回避する
```

### 企業新規作成フロー

```
運営者 → /companies → [新規作成] ボタン
  → CreateCompanyForm (Client Component) → 企業名入力
  → createCompany({ name })
      → requireAdmin() ガード
      → Zod 検証（name: string, min 1 文字）
      → company INSERT { name, is_active: true }
      → redirect('/companies/[new_id]')
```

### LLM コスト集計フロー（shared seam: mock-interview 所有スキーマ参照）

```
GET /monitoring
  → requireAdmin()
  → getLlmCostMetrics()
      SELECT
        SUM((metadata->>'llm_cost_estimate'->>'estimated_usd')::numeric) AS total_usd,
        SUM((metadata->>'llm_cost_estimate'->>'input_tokens')::integer)  AS total_input_tokens,
        SUM((metadata->>'llm_cost_estimate'->>'output_tokens')::integer) AS total_output_tokens,
        date_trunc('day', created_at) AS day,
        candidate_profile_id
      FROM mock_interview
      WHERE metadata IS NOT NULL
  → モデル別・日次・候補者別に集計して表示
```

### クォータ使用状況フロー

```
GET /monitoring/quota
  → requireAdmin()
  → getCandidateQuotaUsage()
      SELECT
        cp.id, cp.display_name,
        u.email,
        cp.quota_reset_at,
        COUNT(mi.id) FILTER (WHERE mi.created_at >= GREATEST(
          date_trunc('month', now()),
          COALESCE(cp.quota_reset_at, date_trunc('month', now()))
        )) AS used_this_month,
        MAX(mi.created_at) AS last_session_at
      FROM candidate_profile cp
      LEFT JOIN user u ON cp.user_id = u.id
      LEFT JOIN mock_interview mi ON mi.candidate_profile_id = cp.id
      WHERE cp.is_active = true
      GROUP BY cp.id, cp.display_name, u.email, cp.quota_reset_at
      ORDER BY used_this_month DESC
```

---

## コンポーネントとインターフェース

### データ層

#### `getCandidatesForAdmin` (`packages/db/src/queries/admin/candidates-query.ts`)

```typescript
export interface CandidateListItem {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
  quotaResetAt: Date | null;
  usedThisMonth: number;         // mock_interview 当月件数（quota_reset_at 考慮）
  surveyCompleted: boolean;      // skill_survey_response 存在フラグ
  createdAt: Date;
}

export async function getCandidatesForAdmin(params: {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}): Promise<{ items: CandidateListItem[]; total: number }>;
```

#### `getCandidateProfileDetail` (`packages/db/src/queries/admin/candidates-query.ts`)

```typescript
export interface CandidateProfileDetail {
  profile: {
    id: string;
    displayName: string;
    headline: string | null;
    isActive: boolean;
    quotaResetAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    email: string;
  };
  resumeDocuments: Array<{
    id: string;
    fileType: string;
    blobUrl: string;
    createdAt: Date;
  }>;
  surveyResponses: Array<{
    surveyId: string;
    jobType: string;
    submittedAt: Date;
  }>;
  mockInterviews: Array<{
    id: string;
    patternCode: string;
    startedAt: Date;
    endedAt: Date | null;
    turnCount: number;
  }>;
}

export async function getCandidateProfileDetail(
  candidateProfileId: string,
): Promise<CandidateProfileDetail | undefined>;
```

#### `getCompaniesForAdmin` / `getCompanyDetail` (`packages/db/src/queries/admin/companies-query.ts`)

```typescript
export interface CompanyListItem {
  id: string;
  name: string;
  isActive: boolean;
  openingCount: number;
  createdAt: Date;
}

export async function getCompaniesForAdmin(params: {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}): Promise<{ items: CompanyListItem[]; total: number }>;

export interface CompanyDetail {
  company: { id: string; name: string; isActive: boolean; createdAt: Date };
  openings: Array<{ id: string; title: string; status: string; createdAt: Date }>;
  interviewers: Array<{ userId: string; email: string; displayName: string; roleInOrg: string | null }>;
}

export async function getCompanyDetail(companyId: string): Promise<CompanyDetail | undefined>;
```

#### `getSkillSurveyMaster` (`packages/db/src/queries/admin/skill-survey-master-query.ts`)

```typescript
export interface SkillSurveyTree {
  survey: { id: string; jobType: string; title: string; isActive: boolean };
  categories: Array<{
    id: string;
    name: string;
    subcategory: string | null;
    displayOrder: number;
    questions: Array<{
      id: string;
      body: string;
      questionType: string;
      displayOrder: number;
      choices: Array<{ id: string; label: string; displayOrder: number }>;
    }>;
  }>;
}

export async function getSkillSurveyList(): Promise<Array<{ id: string; jobType: string; title: string; isActive: boolean }>>;
export async function getSkillSurveyMaster(surveyId: string): Promise<SkillSurveyTree | undefined>;
```

#### `getLlmCostMetrics` / `getCandidateQuotaUsage` (`packages/db/src/queries/admin/monitoring-query.ts`)

**重要**: 以下の JSONB パス参照は `mock-interview` spec の `MockInterviewMetadata` 型定義（`metadata.llm_cost_estimate.estimated_usd / input_tokens / output_tokens`）を権威として利用する。admin-operations はこのスキーマを所有しない。

```typescript
export interface LlmCostMetrics {
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** 日次トレンド（直近 30 日） */
  dailyTrend: Array<{ day: string; usd: number }>;
  /** 候補者別コスト上位 10 名 */
  topCandidates: Array<{
    candidateProfileId: string;
    displayName: string;
    totalUsd: number;
    sessionCount: number;
  }>;
}

export async function getLlmCostMetrics(): Promise<LlmCostMetrics>;

export interface CandidateQuotaUsage {
  candidateProfileId: string;
  displayName: string;
  email: string;
  usedThisMonth: number;
  monthlyLimit: number;  // 固定値 3（mock-interview spec の仕様）
  lastSessionAt: Date | null;
  isLimitReached: boolean;
}

export async function getCandidateQuotaUsage(): Promise<CandidateQuotaUsage[]>;
```

---

### Server Actions

#### `disableCandidateProfile` (`apps/admin/app/candidates/_actions/disable-candidate.ts`)

```typescript
'use server';
// adminAction ラップ + Zod 検証
export const disableCandidateProfileAction = adminAction(
  z.object({ candidateProfileId: z.string().min(1) }),
  async ({ candidateProfileId }) => {
    await db.update(candidateProfile)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(candidateProfile.id, candidateProfileId));
    revalidatePath('/candidates');
    revalidatePath(`/candidates/${candidateProfileId}`);
  },
);
```

#### `resetCandidateQuota` (`apps/admin/app/candidates/_actions/reset-quota.ts`)

```typescript
'use server';
export const resetCandidateQuotaAction = adminAction(
  z.object({ candidateProfileId: z.string().min(1) }),
  async ({ candidateProfileId }) => {
    // quota_reset_at を now() に更新することで、mock-interview の月次カウントが
    // quota_reset_at 以降のレコードのみを対象とするようになる
    await db.update(candidateProfile)
      .set({ quotaResetAt: new Date(), updatedAt: new Date() })
      .where(eq(candidateProfile.id, candidateProfileId));
    revalidatePath(`/candidates/${candidateProfileId}`);
    revalidatePath('/monitoring/quota');
  },
);
```

#### `createCompany` (`apps/admin/app/companies/_actions/create-company.ts`)

```typescript
'use server';
const createCompanySchema = z.object({ name: z.string().min(1).max(200) });

export const createCompanyAction = adminAction(
  createCompanySchema,
  async ({ name }) => {
    const [created] = await db.insert(company)
      .values({ name, isActive: true })
      .returning({ id: company.id });
    redirect(`/companies/${created.id}`);
  },
);
```

#### `disableCompany` (`apps/admin/app/companies/_actions/disable-company.ts`)

```typescript
'use server';
export const disableCompanyAction = adminAction(
  z.object({ companyId: z.string().min(1) }),
  async ({ companyId }) => {
    await db.update(company)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(company.id, companyId));
    revalidatePath('/companies');
    revalidatePath(`/companies/${companyId}`);
  },
);
```

#### `updateSkillSurveyQuestion` / `updateSkillSurveyChoice`

```typescript
'use server';
// updateSkillSurveyQuestion
const updateQuestionSchema = z.object({
  questionId: z.string().min(1),
  body: z.string().min(1).max(1000),
  questionType: z.enum(['single_choice', 'multi_choice', 'free_text']),
  displayOrder: z.number().int().min(0),
});

export const updateSkillSurveyQuestionAction = adminAction(
  updateQuestionSchema,
  async ({ questionId, body, questionType, displayOrder }) => {
    await db.update(skillSurveyQuestion)
      .set({ body, questionType, displayOrder, updatedAt: new Date() })
      .where(eq(skillSurveyQuestion.id, questionId));
    // surveyId を取得して revalidatePath する
  },
);

// updateSkillSurveyChoice（同様の構造）
```

---

### UI 層（主要ページ）

#### `CandidatesListPage` (`apps/admin/app/candidates/page.tsx`)

Server Component。`requireAdmin()` → `getCandidatesForAdmin` → `SearchFilter`（Client）+ 候補者テーブル。各行に [詳細] リンクと [無効化] ボタン。`is_active = false` の行はグレーアウト。

#### `CandidateDetailPage` (`apps/admin/app/candidates/[id]/page.tsx`)

Server Component。`requireAdmin()` → `getCandidateProfileDetail` → 候補者基本情報セクション + 履歴書一覧 + アンケート回答サマリー + 模擬面接履歴テーブル。[クォータリセット] / [無効化] ボタン。

#### `CompaniesListPage` / `CompanyDetailPage`

Server Components。一覧は `getCompaniesForAdmin`、詳細は `getCompanyDetail`。企業詳細には [新規作成] ボタンと `CreateCompanyForm`（Client Component）、[無効化] ボタンを配置。

#### `SkillSurveyDetailPage` (`apps/admin/app/masters/skill-survey/[surveyId]/page.tsx`)

Server Component。`getSkillSurveyMaster` でツリー取得。カテゴリ accordion、設問ごとに `SkillSurveyQuestionForm`（Client Component）、選択肢ごとに `SkillSurveyChoiceForm`（Client Component）をインライン表示。

#### `MonitoringPage` (`apps/admin/app/monitoring/page.tsx`)

Server Component。`getLlmCostMetrics` → 合計コスト・日次トレンド（HTML テーブルまたはシンプルな棒グラフ）・候補者別トップ 10。チャートライブラリは不使用（shadcn/ui の最小実装か単純な CSS バー）。

---

## データモデル変更

### `candidate_profile` テーブル追加カラム

```typescript
// packages/db/src/schema/candidate-profile.ts に追加（admin-operations が追加するカラム）
isActive: boolean('is_active').notNull().default(true),
// ※ quotaResetAt は mock-interview spec が追加する。admin-operations は参照のみ（ADD COLUMN しない）
```

**マイグレーション SQL（drizzle-kit generate 後に生成される内容）**:
```sql
ALTER TABLE "candidate_profile" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT TRUE;
-- quota_reset_at は mock-interview のマイグレーションで追加済みの前提（Wave 4a 先行）
```

### `company` テーブル追加カラム

```typescript
// packages/db/src/schema/company.ts に追加
isActive: boolean('is_active').notNull().default(true),
```

**マイグレーション SQL**:
```sql
ALTER TABLE "company" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT TRUE;
```

---

## 要件トレーサビリティ

| 要件 | 概要 | 設計コンポーネント |
| ---- | ---- | ---------------- |
| 1.1 | 候補者一覧 | `getCandidatesForAdmin`、`CandidatesListPage` |
| 1.2 | 候補者フィルタ・ページング | `SearchFilter`（Client）、クエリ params |
| 1.3 | 候補者詳細 | `getCandidateProfileDetail`、`CandidateDetailPage` |
| 1.4 | 候補者無効化 | `disableCandidateProfile` Action、`candidate_profile.is_active` |
| 1.5 | クォータリセット | `resetCandidateQuota` Action、`candidate_profile.quota_reset_at` |
| 1.6 | 認証ガード | `requireAdmin()` / `adminAction` ラップ |
| 2.1 | 企業一覧 | `getCompaniesForAdmin`、`CompaniesListPage` |
| 2.2 | 企業フィルタ・ページング | `SearchFilter`（Client）、クエリ params |
| 2.3 | 企業詳細 | `getCompanyDetail`、`CompanyDetailPage` |
| 2.4 | 企業新規作成 | `createCompany` Action、`CreateCompanyForm` |
| 2.5 | 企業無効化 | `disableCompany` Action、`company.is_active` |
| 2.6 | 認証ガード | `requireAdmin()` / `adminAction` ラップ |
| 3.1 | スキルアンケート一覧 | `getSkillSurveyList`、`SkillSurveyListPage` |
| 3.2 | スキルアンケートツリー表示 | `getSkillSurveyMaster`、`SkillSurveyDetailPage` |
| 3.3 | 設問編集 | `updateSkillSurveyQuestion` Action、`SkillSurveyQuestionForm` |
| 3.4 | 選択肢編集 | `updateSkillSurveyChoice` Action、`SkillSurveyChoiceForm` |
| 3.5 | 認証ガード | `requireAdmin()` / `adminAction` ラップ |
| 3.6 | 削除スコープ外 | Out of Boundary 宣言 |
| 4.1 | パターン一覧 | `getAssessmentPatternsForAdmin`、`AssessmentPatternListPage` |
| 4.2 | パターン詳細 | `getAssessmentPatternDetail`、`AssessmentPatternDetailPage` |
| 4.3 | CUD スコープ外 | Out of Boundary 宣言 |
| 5.1 | LLM コストダッシュボード | `getLlmCostMetrics`、`MonitoringPage` |
| 5.2 | JSONB 参照（shared seam） | `mock_interview.metadata.llm_cost_estimate.*` |
| 5.3 | クォータ使用状況 | `getCandidateQuotaUsage`、`QuotaPage` |
| 5.4 | 上限到達強調 | `isLimitReached` フラグ、バッジ表示 |
| 5.5 | 監視は読み取り専用 | Out of Boundary 宣言 |
| 6.1 | 全ルート認証 | 全 Page で `requireAdmin()` |
| 6.2 | ソフトデリート | `is_active` フラグ運用 |
| 6.3 | `is_active` 追加 | スキーマ変更 + migration タスク |
| 6.4 | クエリ配置 | `packages/db/src/queries/admin/` |
| 6.5 | Server Action バリデーション | Zod + `adminAction` ラップ |
| 6.6 | コンポーネント配置 | `apps/admin/app/_components/` |

---

## エラーハンドリング

| エラー種別 | 対応 |
| ---------- | ---- |
| 未認証 / 非管理者 | `requireAdmin()` が AuthError をスローし `/sign-in` リダイレクト |
| リソース不在 | クエリが undefined 返却 → `notFound()` |
| Server Action 入力不正 | `adminAction` 内 Zod 検証エラー → `{ ok: false, error: { code: 'INVALID_INPUT' } }` |
| DB 更新失敗 | 通常 Error を throw → Next.js エラーバウンダリに委ねる |
| `mock_interview` データなし | `getLlmCostMetrics` は 0 値を返す（null 回避） |

---

## テスト戦略

テストフレームワークは導入しない。検証は `pnpm typecheck`・`pnpm build`・手動スモークテストで行う。

### 型チェック

- 新規スキーマカラム（`isActive`）の Drizzle 推論型が全クエリ関数の引数・戻り値型と整合する（`quotaResetAt` は mock-interview が追加済みのカラムを参照するため型が既に存在すること）
- `mock_interview.metadata` JSONB アクセスが `MockInterviewMetadata` 型と整合する（型アサーション箇所を明示）
- 全 Server Action の入力スキーマ（Zod）と戻り値型が TypeScript strict mode でエラーなし

### ビルド

- `packages/db`・`apps/admin` がビルドエラーなし（`pnpm build`）

### 手動スモークテスト

1. **候補者一覧**: `/candidates` にアクセスし候補者リストが表示される
2. **候補者無効化**: [無効化] ボタン押下後、行がグレーアウトされる
3. **クォータリセット**: `/candidates/[id]` から [クォータリセット] 押下後、`/monitoring/quota` のカウントが更新される
4. **企業新規作成**: 企業名入力 → 作成後に詳細ページへリダイレクトされる
5. **スキルアンケート編集**: 設問の `body` を変更して保存後、ページにリロードして更新内容が反映される
6. **パターン閲覧**: `/masters/assessment-pattern` で 57 件のパターン一覧が表示される
7. **コスト監視**: `/monitoring` で合計コストと日次トレンドが表示される（データなしの場合は 0）
8. **既存セッション UI 疎通**: `/sessions` 一覧と `/sessions/[id]` 詳細が引き続き動作する
