# 自己分析 一覧化 ＆ 結果ページ CTA 強化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アンケート結果ページで完了を明示して自己分析CTAを目立たせ、`/self-analysis` を「回答済みアンケート一覧 → 各アンケートの分析詳細」の2階層に再構成する。

**Architecture:** `/self-analysis` を一覧ページに作り変え、現行の表示ロジックを `/self-analysis/[surveyId]` に移設。新規クエリ `getAnsweredSurveysForCandidate` で一覧データを供給し、生成系 Server Action は surveyId を受け取る形へ改修する。

**Tech Stack:** Next.js App Router (Server/Client Components), Drizzle ORM, Zod, Vitest, Tailwind, `@bulr/ui`（Button/Card）。pnpm + Turborepo。

参照設計: `docs/superpowers/specs/2026-06-20-self-analysis-list-and-cta-design.md`

---

## 前提・実行環境メモ

- 作業ディレクトリ: リポジトリルート（worktree）。
- DB クエリ・コンポーネントの単体テストはこのコードベースに存在しない（既存テストは `apps/candidate/app/self-analysis/_lib/*.test.ts` の純関数のみ）。
  本計画では **純関数（ステータス導出）を抽出して TDD** し、ページ/クエリ/アクションは型チェック・lint・既存テスト・ビルドで検証する（既存パターン踏襲）。
- テスト実行（candidate 単体）: `pnpm --filter candidate test`
- 型チェック: `pnpm --filter candidate typecheck` / `pnpm --filter @bulr/db typecheck`
- lint: `pnpm --filter candidate lint`
- 全体: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

---

## ファイル構成

**新規作成:**
- `apps/candidate/app/self-analysis/_lib/analysis-status.ts` — ステータス導出の純関数
- `apps/candidate/app/self-analysis/_lib/analysis-status.test.ts` — 上記のテスト
- `apps/candidate/app/self-analysis/[surveyId]/page.tsx` — 詳細ページ（現 page.tsx ロジック移設）
- `apps/candidate/app/self-analysis/_components/survey-analysis-card.tsx` — 一覧カード
- `packages/db/src/queries/self-analysis/answered-surveys-query.ts` — 新規クエリ

**変更:**
- `apps/candidate/app/self-analysis/page.tsx` — 一覧ページへ作り変え
- `apps/candidate/app/self-analysis/_components/self-analysis-view.tsx` — `surveyId` prop 追加
- `apps/candidate/app/self-analysis/_components/generate-button.tsx` — `surveyId` prop 追加・アクション呼び出し変更
- `apps/candidate/app/self-analysis/_actions/generate-self-analysis.ts` — surveyId 入力対応
- `apps/candidate/app/skill-survey/_components/survey-result.tsx` — 完了バナー＋CTA強化＋`surveyId` prop
- `apps/candidate/app/skill-survey/[surveyId]/result/page.tsx` — `surveyId` を SurveyResult に渡す
- `packages/db/src/queries/self-analysis/index.ts` — 新規クエリは `export *` で自動再エクスポート（変更不要の見込み。要確認）

---

## Task 1: ステータス導出の純関数（TDD）

一覧カードの「未生成 / 生成済み / 要再生成」を決める純粋ロジックを切り出してテストする。
詳細ページの陳腐化判定（`record !== null && answered.submittedAt > record.sourceSubmittedAt`）と同じ規則を一覧でも使う。

**Files:**
- Create: `apps/candidate/app/self-analysis/_lib/analysis-status.ts`
- Test: `apps/candidate/app/self-analysis/_lib/analysis-status.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`apps/candidate/app/self-analysis/_lib/analysis-status.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

import { deriveAnalysisStatus } from './analysis-status';

describe('deriveAnalysisStatus', () => {
  const t1 = new Date('2026-01-01T00:00:00Z');
  const t2 = new Date('2026-02-01T00:00:00Z');

  it('分析が無いとき none', () => {
    expect(deriveAnalysisStatus(t2, null)).toBe('none');
  });

  it('回答が分析生成元より新しいとき stale', () => {
    expect(deriveAnalysisStatus(t2, t1)).toBe('stale');
  });

  it('回答と分析生成元が同時刻のとき ready', () => {
    expect(deriveAnalysisStatus(t1, t1)).toBe('ready');
  });

  it('分析生成元が回答以降のとき ready', () => {
    expect(deriveAnalysisStatus(t1, t2)).toBe('ready');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter candidate test analysis-status`
Expected: FAIL（`deriveAnalysisStatus` が未定義 / モジュール解決不可）

- [ ] **Step 3: 最小実装**

`apps/candidate/app/self-analysis/_lib/analysis-status.ts`:
```ts
/**
 * 自己分析の一覧表示ステータスを導出する純関数。
 * 詳細ページの陳腐化判定（answered.submittedAt > record.sourceSubmittedAt）と同一規則。
 *
 * - none : 分析未生成（sourceSubmittedAt が null）
 * - stale: 最新回答が分析生成元より新しい（再生成推奨）
 * - ready: 上記以外（最新の分析あり）
 */
export type AnalysisStatus = 'none' | 'ready' | 'stale';

export function deriveAnalysisStatus(
  latestSubmittedAt: Date,
  analysisSourceSubmittedAt: Date | null,
): AnalysisStatus {
  if (analysisSourceSubmittedAt === null) return 'none';
  if (latestSubmittedAt > analysisSourceSubmittedAt) return 'stale';
  return 'ready';
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm --filter candidate test analysis-status`
Expected: PASS（4 件）

- [ ] **Step 5: コミット**

```bash
git add apps/candidate/app/self-analysis/_lib/analysis-status.ts apps/candidate/app/self-analysis/_lib/analysis-status.test.ts
git commit -m "feat(self-analysis): 一覧ステータス導出の純関数を追加"
```

---

## Task 2: 回答済みアンケート一覧クエリ

`packages/db/src/queries/self-analysis/answered-surveys-query.ts` を新設。
回答済みアンケートを surveyId 単位で集約し、各々の最新回答日と分析ステータスを返す。

**Files:**
- Create: `packages/db/src/queries/self-analysis/answered-surveys-query.ts`
- Verify: `packages/db/src/queries/self-analysis/index.ts`（`export *` で再エクスポート済みか確認）

- [ ] **Step 1: クエリを実装**

`packages/db/src/queries/self-analysis/answered-surveys-query.ts`:
```ts
/**
 * 候補者が回答済みのアンケート一覧を、最新回答日・分析ステータス付きで返す。
 * /self-analysis 一覧ページのデータソース（複数アンケート種別対応）。
 *
 * skill_survey 系・self_analysis を read-only で参照する。
 */

import { and, desc, eq, max } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurvey } from '../../schema/skill-survey';
import { skillSurveyResponse } from '../../schema/skill-survey-response';
import { selfAnalysis } from '../../schema/self-analysis';

/** 一覧カード1件分のサマリ */
export interface AnsweredSurveySummary {
  surveyId: string;
  jobType: string;
  title: string;
  latestSubmittedAt: Date;
  /** none: 分析なし / ready: 最新の分析あり / stale: 回答更新あり */
  analysisStatus: 'none' | 'ready' | 'stale';
}

/**
 * 候補者の回答済みアンケートを surveyId 単位で集約して返す（最新回答日 降順）。
 * 本人 ID で限定。未回答の場合は空配列。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID（本人のみ）
 */
export async function getAnsweredSurveysForCandidate(
  candidateProfileId: string,
): Promise<AnsweredSurveySummary[]> {
  // Step 1: surveyId ごとの最新回答日を集約し、title / jobType を JOIN で解決
  const answered = await db
    .select({
      surveyId: skillSurveyResponse.skillSurveyId,
      title: skillSurvey.title,
      jobType: skillSurvey.jobType,
      latestSubmittedAt: max(skillSurveyResponse.submittedAt),
    })
    .from(skillSurveyResponse)
    .innerJoin(skillSurvey, eq(skillSurveyResponse.skillSurveyId, skillSurvey.id))
    .where(eq(skillSurveyResponse.candidateProfileId, candidateProfileId))
    .groupBy(skillSurveyResponse.skillSurveyId, skillSurvey.title, skillSurvey.jobType);

  if (answered.length === 0) {
    return [];
  }

  // Step 2: 各 survey の最新 self_analysis.sourceSubmittedAt を解決してステータス導出
  const summaries: AnsweredSurveySummary[] = [];
  for (const row of answered) {
    const latestSubmittedAt = row.latestSubmittedAt as Date;

    const analysisRows = await db
      .select({ sourceSubmittedAt: selfAnalysis.sourceSubmittedAt })
      .from(selfAnalysis)
      .where(
        and(
          eq(selfAnalysis.candidateProfileId, candidateProfileId),
          eq(selfAnalysis.skillSurveyId, row.surveyId),
        ),
      )
      .orderBy(desc(selfAnalysis.sourceSubmittedAt))
      .limit(1);

    const sourceSubmittedAt = analysisRows[0]?.sourceSubmittedAt ?? null;

    const analysisStatus: AnsweredSurveySummary['analysisStatus'] =
      sourceSubmittedAt === null
        ? 'none'
        : latestSubmittedAt > sourceSubmittedAt
          ? 'stale'
          : 'ready';

    summaries.push({
      surveyId: row.surveyId,
      jobType: row.jobType,
      title: row.title,
      latestSubmittedAt,
      analysisStatus,
    });
  }

  // Step 3: 最新回答日 降順で返す
  summaries.sort((a, b) => b.latestSubmittedAt.getTime() - a.latestSubmittedAt.getTime());

  return summaries;
}
```

- [ ] **Step 2: 再エクスポートを確認**

Run: `grep -n "answered-surveys-query\|export \*" packages/db/src/queries/self-analysis/index.ts`
Expected: `export * from './analysis-source-query';` 等が存在。`export *` のため新ファイルも自動公開される。
もし `export *` でなく個別 export なら、`export * from './answered-surveys-query';` を追記する。

- [ ] **Step 3: db パッケージの型チェック**

Run: `pnpm --filter @bulr/db typecheck`
Expected: PASS（エラーなし）

- [ ] **Step 4: コミット**

```bash
git add packages/db/src/queries/self-analysis/answered-surveys-query.ts packages/db/src/queries/self-analysis/index.ts
git commit -m "feat(db): 回答済みアンケート一覧クエリ getAnsweredSurveysForCandidate を追加"
```

---

## Task 3: Server Action を surveyId 入力対応へ改修

詳細ページ（surveyId 単位）から「今見ているアンケート」に対して生成できるようにする。

**Files:**
- Modify: `apps/candidate/app/self-analysis/_actions/generate-self-analysis.ts`

- [ ] **Step 1: generateSelfAnalysis を改修**

入力スキーマを変更:
```ts
const generateSelfAnalysisSchema = z.object({ surveyId: z.string().min(1) });
```

ハンドラ本体（手順 2〜3）を以下に置換。`getAnsweredSurveyForCandidate` での対象選択を廃し、
`input.surveyId` を使い、`getLatestSurveyResponseForAnalysis` の null を `NO_RESPONSE` とする:
```ts
  async (input, _ctx): Promise<GenerateSelfAnalysisResult> => {
    // 1. requireCandidate — 未認証・プロフィール未作成は AuthError として伝播
    const { candidateProfile } = await requireCandidate();

    const { surveyId } = input;

    // 2. 指定 survey の最新版 response を解決（未回答 or 他者の survey なら NO_RESPONSE）
    //    getLatestSurveyResponseForAnalysis は candidateProfileId で本人フィルタ済み
    const source = await getLatestSurveyResponseForAnalysis(candidateProfile.id, surveyId);
    if (!source) {
      return {
        ok: false,
        error: {
          code: 'NO_RESPONSE',
          message: 'このアンケートにまだ回答していません。先にアンケートに回答してください。',
        },
      };
    }
```
（以降の手順 4〜7 はそのまま。`surveyId` 変数は上で定義済みのため重複定義を削除すること。）

`getAnsweredSurveyForCandidate` のインポートが他で未使用になる場合は import から削除する。

revalidate を両パスへ:
```ts
    // 8. /self-analysis（一覧）と詳細を revalidate
    revalidatePath('/self-analysis');
    revalidatePath(`/self-analysis/${surveyId}`);
```

- [ ] **Step 2: regenerateNarrative を改修**

入力スキーマ:
```ts
const regenerateNarrativeSchema = z.object({ surveyId: z.string().min(1) });
```

ハンドラ手順 2〜3 を置換（`getAnsweredSurveyForCandidate` を廃し input.surveyId を使用）:
```ts
  async (input, _ctx): Promise<RegenerateNarrativeResult> => {
    // 1. requireCandidate
    const { candidateProfile } = await requireCandidate();

    const { surveyId } = input;

    // 2. 指定 survey の最新版の保存済み自己分析を取得（無ければ NO_ANALYSIS）
    const existing = await getSelfAnalysis(candidateProfile.id, surveyId);
    if (!existing) {
      return {
        ok: false,
        error: {
          code: 'NO_ANALYSIS',
          message: '再生成対象の自己分析が見つかりません。先に自己分析を生成してください。',
        },
      };
    }
```
（以降の手順 4〜6 はそのまま。重複する `const { surveyId } = surveySummary;` を削除。）

revalidate を両パスへ:
```ts
    revalidatePath('/self-analysis');
    revalidatePath(`/self-analysis/${surveyId}`);
```

- [ ] **Step 3: 型チェック**

Run: `pnpm --filter candidate typecheck`
Expected: PASS（GenerateButton 側の呼び出しは Task 4 で更新するため、ここで未対応だと型エラーになる場合は Task 4 と合わせてコミットする）

- [ ] **Step 4: コミット（Task 4 と合わせて型整合する場合は本コミットを Task 4 直後に回す）**

```bash
git add apps/candidate/app/self-analysis/_actions/generate-self-analysis.ts
git commit -m "feat(self-analysis): 生成系アクションを surveyId 入力対応に改修"
```

---

## Task 4: GenerateButton / SelfAnalysisView に surveyId を伝播

**Files:**
- Modify: `apps/candidate/app/self-analysis/_components/generate-button.tsx`
- Modify: `apps/candidate/app/self-analysis/_components/self-analysis-view.tsx`

- [ ] **Step 1: GenerateButton に surveyId prop を追加**

`GenerateButtonProps` に追加:
```ts
  /** 対象アンケートの ID（生成系アクションへ渡す） */
  surveyId: string;
```

`export function GenerateButton({ action, label, variant = 'default', className, surveyId }: GenerateButtonProps)` とし、
`handleClick` のアクション呼び出しを変更:
```ts
      const result =
        action === 'generate'
          ? await generateSelfAnalysis({ surveyId })
          : await regenerateNarrative({ surveyId });
```

- [ ] **Step 2: SelfAnalysisView に surveyId prop を追加し全 GenerateButton に渡す**

`SelfAnalysisViewProps` に `surveyId: string;` を追加。
`export function SelfAnalysisView({ record, isStale, surveyId }: SelfAnalysisViewProps)` とし、
4 箇所すべての `<GenerateButton ... />` に `surveyId={surveyId}` を追加する（Empty / VizOnly / Stale / Complete）。

- [ ] **Step 3: 型チェック**

Run: `pnpm --filter candidate typecheck`
Expected: page.tsx（呼び出し元）が surveyId 未指定でエラーになる。これは Task 5/6 で解消するため、ここでは GenerateButton/SelfAnalysisView 単体の型整合を確認する目的。

- [ ] **Step 4: コミット**

```bash
git add apps/candidate/app/self-analysis/_components/generate-button.tsx apps/candidate/app/self-analysis/_components/self-analysis-view.tsx
git commit -m "feat(self-analysis): GenerateButton/SelfAnalysisView に surveyId を伝播"
```

---

## Task 5: 詳細ページ `/self-analysis/[surveyId]`

現 `apps/candidate/app/self-analysis/page.tsx` の「最新1件自動表示」ロジックを surveyId 駆動に移設する。

**Files:**
- Create: `apps/candidate/app/self-analysis/[surveyId]/page.tsx`

- [ ] **Step 1: 詳細ページを作成**

`apps/candidate/app/self-analysis/[surveyId]/page.tsx`:
```tsx
/**
 * 自己分析 詳細ページ（Server Component）
 *
 * params.surveyId のアンケートに対する自己分析を表示する。
 * - 認証ガード（requireCandidate）
 * - 当該候補者が surveyId に回答済みでなければ一覧へ redirect
 * - getSelfAnalysis / getSelfAnalysisHistory を surveyId で取得
 * - 表示状態（Empty/VizOnly/Stale/Complete）は SelfAnalysisView に委譲
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthError, requireCandidate } from '@bulr/auth/server';
import {
  getLatestResponseSubmittedAt,
  getSelfAnalysis,
  getSelfAnalysisHistory,
} from '@bulr/db';

import { HistorySection } from '../_components/history-section';
import { SelfAnalysisView } from '../_components/self-analysis-view';

interface PageProps {
  params: Promise<{ surveyId: string }>;
}

export default async function SelfAnalysisDetailPage({ params }: PageProps) {
  const { surveyId } = await params;

  // ── アクセス制御 ──
  let candidateProfileId: string;
  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') redirect('/sign-in');
      if (err.code === 'CANDIDATE_PROFILE_MISSING') redirect('/onboarding');
    }
    throw err;
  }

  // ── 当該 survey への回答有無で所有確認。未回答なら一覧へ ──
  const latestSubmittedAt = await getLatestResponseSubmittedAt(candidateProfileId, surveyId);
  if (latestSubmittedAt === null) {
    redirect('/self-analysis');
  }

  // ── 分析と版履歴を取得 ──
  const [record, history] = await Promise.all([
    getSelfAnalysis(candidateProfileId, surveyId),
    getSelfAnalysisHistory(candidateProfileId, surveyId),
  ]);

  // ── 陳腐化判定（最新回答日 > 分析生成元）──
  const isStale: boolean = record !== null && latestSubmittedAt > record.sourceSubmittedAt;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/self-analysis" className="hover:underline">
          ← 自己分析の一覧に戻る
        </Link>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">自己分析</h1>
        <p className="mt-1 text-sm text-gray-600">
          アンケートの回答をもとに、あなたの強み・弱み・成長アクションを確認できます。
        </p>
      </div>

      <div className="space-y-10">
        <SelfAnalysisView record={record} isStale={isStale} surveyId={surveyId} />
        <HistorySection versions={history} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `pnpm --filter candidate typecheck`
Expected: 詳細ページ単体は PASS（一覧 page.tsx は Task 6 で更新するまでエラーの可能性あり）。

- [ ] **Step 3: コミット**

```bash
git add apps/candidate/app/self-analysis/[surveyId]/page.tsx
git commit -m "feat(self-analysis): surveyId 単位の詳細ページを追加"
```

---

## Task 6: 一覧ページ ＆ カードコンポーネント

`/self-analysis` を一覧へ作り変え、カードコンポーネントを新設する。

**Files:**
- Create: `apps/candidate/app/self-analysis/_components/survey-analysis-card.tsx`
- Modify: `apps/candidate/app/self-analysis/page.tsx`

- [ ] **Step 1: カードコンポーネントを作成**

`apps/candidate/app/self-analysis/_components/survey-analysis-card.tsx`:
```tsx
/**
 * SurveyAnalysisCard — 自己分析一覧の1カード（presentational Server Component）
 *
 * 回答済みアンケート1件を、最新回答日・分析ステータスバッジ・遷移ボタンで表示する。
 * ボタンは詳細ページ /self-analysis/[surveyId] への Link。生成自体は詳細ページ側に委譲。
 */

import Link from 'next/link';

import type { AnsweredSurveySummary } from '@bulr/db';

const STATUS_BADGE: Record<
  AnsweredSurveySummary['analysisStatus'],
  { label: string; className: string }
> = {
  none: { label: '未生成', className: 'bg-gray-100 text-gray-600' },
  ready: { label: '生成済み', className: 'bg-emerald-100 text-emerald-800' },
  stale: { label: '要再生成', className: 'bg-amber-100 text-amber-800' },
};

const BUTTON_LABEL: Record<AnsweredSurveySummary['analysisStatus'], string> = {
  none: '自己分析を生成する',
  ready: '分析を見る',
  stale: '分析を見る',
};

export function SurveyAnalysisCard({ summary }: { summary: AnsweredSurveySummary }) {
  const badge = STATUS_BADGE[summary.analysisStatus];
  const submitted = summary.latestSubmittedAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <Link
      href={`/self-analysis/${summary.surveyId}`}
      className="block rounded-lg border border-gray-200 p-5 transition hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-900">{summary.title}</h2>
          <p className="mt-1 text-xs text-gray-500">最終回答日: {submitted}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      <div className="mt-4">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
          {BUTTON_LABEL[summary.analysisStatus]} →
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: 一覧ページに作り変え**

`apps/candidate/app/self-analysis/page.tsx` を全置換:
```tsx
/**
 * 自己分析 一覧ページ（Server Component）
 *
 * 候補者が回答済みのアンケートをカード一覧で表示する。
 * - 認証ガード（requireCandidate）
 * - 回答0件 → 「先にアンケートに回答しましょう」案内（/skill-survey）
 * - 1件以上 → SurveyAnalysisCard のリスト（各カードから /self-analysis/[surveyId] へ）
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthError, requireCandidate } from '@bulr/auth/server';
import { getAnsweredSurveysForCandidate } from '@bulr/db';

import { SurveyAnalysisCard } from './_components/survey-analysis-card';

export default async function SelfAnalysisPage() {
  // ── アクセス制御 ──
  let candidateProfileId: string;
  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') redirect('/sign-in');
      if (err.code === 'CANDIDATE_PROFILE_MISSING') redirect('/onboarding');
    }
    throw err;
  }

  const surveys = await getAnsweredSurveysForCandidate(candidateProfileId);

  // ── NoResponse 状態 ──
  if (surveys.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">自己分析</h1>
          <p className="mt-1 text-sm text-gray-600">
            アンケートの回答をもとに、あなたの強み・弱み・成長アクションを生成します。
          </p>
        </div>

        <div className="flex flex-col items-center gap-6 rounded-lg border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-amber-900">
              先にアンケートに回答しましょう
            </h2>
            <p className="text-sm text-amber-700">
              自己分析を生成するには、スキルアンケートへの回答が必要です。
              <br />
              まずアンケートに回答してから、こちらで自己分析を生成してください。
            </p>
          </div>
          <Link
            href="/skill-survey"
            className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            アンケート一覧へ
          </Link>
        </div>
      </main>
    );
  }

  // ── 一覧表示 ──
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">自己分析</h1>
        <p className="mt-1 text-sm text-gray-600">
          回答済みのアンケートを選んで、強み・弱み・成長アクションを確認しましょう。
        </p>
      </div>

      <div className="space-y-4">
        {surveys.map((summary) => (
          <SurveyAnalysisCard key={summary.surveyId} summary={summary} />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 型チェック・lint**

Run: `pnpm --filter candidate typecheck && pnpm --filter candidate lint`
Expected: PASS（self-analysis 関連が surveyId で整合）

- [ ] **Step 4: コミット**

```bash
git add apps/candidate/app/self-analysis/page.tsx apps/candidate/app/self-analysis/_components/survey-analysis-card.tsx
git commit -m "feat(self-analysis): 回答済みアンケート一覧ページとカードを追加"
```

---

## Task 7: アンケート結果ページ 完了明示 ＆ CTA 強化

**Files:**
- Modify: `apps/candidate/app/skill-survey/_components/survey-result.tsx`
- Modify: `apps/candidate/app/skill-survey/[surveyId]/result/page.tsx`

- [ ] **Step 1: SurveyResult に surveyId prop を追加し、完了バナー＋CTA を強化**

`SurveyResultProps` に追加:
```ts
  /** 結果対象のアンケート ID（自己分析詳細への導線に使用） */
  surveyId: string;
```

`export function SurveyResult({ categories, answers, choiceLabels, surveyTitle, surveyId }: SurveyResultProps)` とする。

冒頭（`<div className="space-y-6">` 直下）に完了バナーを追加し、既存の「自己診断への導線 CTA」ブロックを下記に置換:
```tsx
      {/* 完了バナー */}
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white"
          aria-hidden="true"
        >
          ✓
        </span>
        <p className="text-sm font-medium text-emerald-800">
          アンケートに回答しました。棚卸しが完了です。
        </p>
      </div>

      {/* 次アクション: 自己分析への主要 CTA */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
        <h2 className="text-base font-semibold text-blue-900">次は自己分析へ</h2>
        <p className="mt-1 text-sm text-blue-800">
          回答内容をもとに、あなたの強み・弱み・成長アクションを確認できます。
        </p>
        <Link
          href={`/self-analysis/${surveyId}`}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          自己分析を見る →
        </Link>
      </div>
```

ページ末尾の重複 CTA のリンク先を surveyId 付きに変更:
```tsx
        <Link
          href={`/self-analysis/${surveyId}`}
          className="inline-block rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          自己分析を見る →
        </Link>
```

- [ ] **Step 2: 結果ページから surveyId を渡す**

`apps/candidate/app/skill-survey/[surveyId]/result/page.tsx` の `<SurveyResult .../>` に `surveyId={surveyId}` を追加:
```tsx
      <SurveyResult
        categories={categoryTree}
        answers={answers}
        choiceLabels={choiceLabels}
        surveyTitle={survey.title}
        surveyId={surveyId}
      />
```

- [ ] **Step 3: 型チェック・lint**

Run: `pnpm --filter candidate typecheck && pnpm --filter candidate lint`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add apps/candidate/app/skill-survey/_components/survey-result.tsx apps/candidate/app/skill-survey/[surveyId]/result/page.tsx
git commit -m "feat(skill-survey): 結果ページに完了明示と自己分析への主要CTAを追加"
```

---

## Task 8: 全体検証

**Files:** （変更なし — 検証のみ）

- [ ] **Step 1: candidate ユニットテスト**

Run: `pnpm --filter candidate test`
Expected: PASS（既存 + Task 1 の analysis-status）

- [ ] **Step 2: 型チェック（全体）**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: lint（全体）**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: ビルド**

Run: `pnpm build`
Expected: PASS（`/self-analysis` と `/self-analysis/[surveyId]` が両方ビルドされる）

- [ ] **Step 5: 手動確認（任意・DB 起動が必要）**

```
pnpm db:up
pnpm --filter candidate dev   # http://localhost:3020
```
確認項目:
- アンケート回答 → 結果ページに「✓ アンケートに回答しました」と青い「自己分析を見る」CTA が表示される。
- CTA から `/self-analysis/{surveyId}` の詳細へ直行できる。
- `/self-analysis` がカード一覧になり、ステータスバッジ（未生成/生成済み/要再生成）が出る。
- カードから詳細へ遷移し、生成・再生成が当該 surveyId に対して動作する。

- [ ] **Step 6: 最終確認コミット（必要時）**

検証で微修正が出た場合のみコミット。なければスキップ。

---

## Self-Review チェック結果

- **Spec coverage:** 結果ページ完了明示＋CTA（Task 7）/ 一覧化（Task 6）/ 詳細移設（Task 5）/ 新規クエリ（Task 2）/ アクション surveyId 対応（Task 3,4）/ ステータス導出（Task 1）— 設計の全節をカバー。
- **Placeholder:** なし（全コードブロック実体記載）。
- **型整合:** `AnsweredSurveySummary`（Task 2 で定義 → Task 6 で使用）、`surveyId` prop（Task 3→4→5→7 で一貫）、`AnalysisStatus`（Task 1）一致を確認。
- **Scope:** 単一プラン（candidate アプリ + db クエリ1本）で完結。
