# 実装タスク — entry-flow

## タスク概要

本 spec の実装は 4 フェーズ（DB スキーマ → Server Actions → 候補者側 UI → 企業側 UI）で進める。各タスクは依存関係の順に完了すること。

---

## フェーズ 1: DB スキーマ + クエリ

### タスク 1.1 ✅: entry スキーマの追加

**目的**: `entry` テーブルと `entry_status` pgEnum を `packages/db` に追加し、migration を生成する。

**実装ファイル**:
- [ ] `packages/db/src/schema/entry.ts` — 新規作成
- [ ] `packages/db/src/schema/index.ts` — `entry` / `entryStatus` / `Entry` / `NewEntry` / `EntryStatus` のバレル export 追加

**実装詳細**:

1. `packages/db/src/schema/entry.ts` を作成する:

```typescript
import { pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { candidateProfile } from './candidate-profile';
import { opening } from './opening';
import { invitation } from './invitation';
import { resumeDocument } from './resume-document';
import { skillSurveyResponse } from './skill-survey-response';

export const entryStatus = pgEnum('entry_status', [
  'submitted',
  'reviewed',
  'rejected',
  'progressing',
]);

export const entry = pgTable(
  'entry',
  {
    id: text('id').primaryKey(),
    candidateProfileId: text('candidate_profile_id')
      .notNull()
      .references(() => candidateProfile.id),
    openingId: text('opening_id')
      .notNull()
      .references(() => opening.id),
    invitationId: text('invitation_id')
      .notNull()
      .references(() => invitation.id),
    resumeDocumentId: text('resume_document_id')
      .references(() => resumeDocument.id, { onDelete: 'set null' }),
    skillSurveyResponseId: text('skill_survey_response_id')
      .references(() => skillSurveyResponse.id),
    status: entryStatus('status').notNull().default('submitted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('entry_candidate_opening_uniq').on(
      table.candidateProfileId,
      table.openingId,
    ),
  ],
);

export type Entry = typeof entry.$inferSelect;
export type NewEntry = typeof entry.$inferInsert;
export type EntryStatus = (typeof entryStatus.enumValues)[number];
```

2. `packages/db/src/schema/index.ts` に以下を追加:
   - `export * from './entry';`

**注意: entry.status の担当範囲**:

スキーマの enum 定義には全 4 値 (`submitted` / `reviewed` / `rejected` / `progressing`) を含めるが、各値の更新担当は以下の通り:
- `'submitted'`: entry-flow が `createEntry` 時にデフォルト挿入する (本 spec のスコープ)
- `'reviewed'`: 企業ユーザーが entry 詳細を確認した時に UI から明示更新する (本 spec のスコープ内で UI から実装)
- `'rejected'`: 企業ユーザーが拒否した時に UI から明示更新する (本 spec のスコープ内、または将来別 spec)
- `'progressing'`: 面接セッション作成時に Wave 3 `session-from-entry` の `createSessionFromEntry` が更新する (本 spec のスコープ外)

entry-flow タスク内では `submitted` の挿入と `reviewed` / `rejected` の手動更新 UI のみを担当すること。

**検証基準**:
- `pnpm typecheck` が全 workspace で成功すること
- `packages/db` から `Entry` / `NewEntry` / `EntryStatus` / `entry` / `entryStatus` が import できること

---

### タスク 1.2 ✅: Drizzle migration の生成と適用

**目的**: entry テーブルの migration を生成して dev DB に適用する。

**実装ファイル**:
- [ ] `packages/db/drizzle/*_entry.sql` — drizzle-kit 生成

**実装詳細**:

1. `drizzle-kit generate` を実行して migration ファイルを生成する（inline env override を使用）:
   ```bash
   DATABASE_URL=<dev_db_url> pnpm --filter @bulr/db drizzle-kit generate
   ```

2. 生成された SQL を確認し、以下が含まれていることを確認:
   - `CREATE TYPE entry_status AS ENUM (...)` または `DO $$ ... EXCEPTION ...` による enum 作成
   - `CREATE TABLE entry (...)` に 5 FK + status enum + UNIQUE 制約が含まれること
   - `entry.resume_document_id` FK が `ON DELETE SET NULL` になっていること

3. dev DB に適用:
   ```bash
   DATABASE_URL=<dev_db_url> pnpm --filter @bulr/db drizzle-kit push
   ```

**検証基準**:
- migration ファイルが `packages/db/drizzle/` に生成されること
- `UNIQUE(candidate_profile_id, opening_id)` インデックスが DB に存在すること
- `entry.resume_document_id` の FK が `ON DELETE SET NULL` で定義されていること

---

### タスク 1.3 ✅: entry クエリ関数の実装

**目的**: 候補者向け / 企業向け / downstream seam の 3 クエリ関数を `packages/db` に追加する。

**実装ファイル**:
- [ ] `packages/db/src/queries/entry/get-entries-by-candidate-profile-id.ts` — 新規作成
- [ ] `packages/db/src/queries/entry/get-entries-by-opening-id.ts` — 新規作成
- [ ] `packages/db/src/queries/entry/get-entry-with-snapshots.ts` — 新規作成
- [ ] `packages/db/src/queries/index.ts` — entry クエリの re-export 追加

**実装詳細**:

1. `get-entries-by-candidate-profile-id.ts`:

```typescript
import { db } from '../../client';
import { entry } from '../../schema/entry';
import { opening } from '../../schema/opening';
import { company } from '../../schema/company';
import { eq, desc } from 'drizzle-orm';

export type EntryWithOpeningAndCompany = {
  entry: typeof entry.$inferSelect;
  opening: Pick<typeof opening.$inferSelect, 'id' | 'title'>;
  company: Pick<typeof company.$inferSelect, 'id' | 'name'>;
};

export async function getEntriesByCandidateProfileId(
  candidateProfileId: string,
): Promise<EntryWithOpeningAndCompany[]> {
  const rows = await db
    .select({
      entry: entry,
      opening: { id: opening.id, title: opening.title },
      company: { id: company.id, name: company.name },
    })
    .from(entry)
    .innerJoin(opening, eq(entry.openingId, opening.id))
    .innerJoin(company, eq(opening.companyId, company.id))
    .where(eq(entry.candidateProfileId, candidateProfileId))
    .orderBy(desc(entry.createdAt));
  return rows;
}
```

2. `get-entries-by-opening-id.ts`:

```typescript
import { db } from '../../client';
import { entry } from '../../schema/entry';
import { candidateProfile } from '../../schema/candidate-profile';
import { eq, desc } from 'drizzle-orm';

export type EntryWithCandidateProfile = {
  entry: typeof entry.$inferSelect;
  candidateProfile: Pick<typeof candidateProfile.$inferSelect, 'id' | 'displayName'>;
};

export async function getEntriesByOpeningId(
  openingId: string,
): Promise<EntryWithCandidateProfile[]> {
  const rows = await db
    .select({
      entry: entry,
      candidateProfile: { id: candidateProfile.id, displayName: candidateProfile.displayName },
    })
    .from(entry)
    .innerJoin(candidateProfile, eq(entry.candidateProfileId, candidateProfile.id))
    .where(eq(entry.openingId, openingId))
    .orderBy(desc(entry.createdAt));
  return rows;
}
```

3. `get-entry-with-snapshots.ts`:

```typescript
import { db } from '../../client';
import { entry } from '../../schema/entry';
import { opening } from '../../schema/opening';
import { company } from '../../schema/company';
import { candidateProfile } from '../../schema/candidate-profile';
import { resumeDocument } from '../../schema/resume-document';
import { skillSurveyResponse } from '../../schema/skill-survey-response';
import { eq } from 'drizzle-orm';

export type EntryWithSnapshots = {
  entry: typeof entry.$inferSelect;
  opening: typeof opening.$inferSelect;
  company: typeof company.$inferSelect;
  candidateProfile: typeof candidateProfile.$inferSelect;
  resumeDocument: typeof resumeDocument.$inferSelect | null;
  skillSurveyResponse: typeof skillSurveyResponse.$inferSelect | null;
};

export async function getEntryWithSnapshots(
  entryId: string,
): Promise<EntryWithSnapshots | null> {
  const rows = await db
    .select({
      entry: entry,
      opening: opening,
      company: company,
      candidateProfile: candidateProfile,
      resumeDocument: resumeDocument,
      skillSurveyResponse: skillSurveyResponse,
    })
    .from(entry)
    .innerJoin(opening, eq(entry.openingId, opening.id))
    .innerJoin(company, eq(opening.companyId, company.id))
    .innerJoin(candidateProfile, eq(entry.candidateProfileId, candidateProfile.id))
    .leftJoin(resumeDocument, eq(entry.resumeDocumentId, resumeDocument.id))
    .leftJoin(skillSurveyResponse, eq(entry.skillSurveyResponseId, skillSurveyResponse.id))
    .where(eq(entry.id, entryId))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    entry: row.entry,
    opening: row.opening,
    company: row.company,
    candidateProfile: row.candidateProfile,
    resumeDocument: row.resumeDocument ?? null,
    skillSurveyResponse: row.skillSurveyResponse ?? null,
  };
}
```

4. `packages/db/src/queries/index.ts` に以下を追加:

```typescript
export * from './entry/get-entries-by-candidate-profile-id';
export * from './entry/get-entries-by-opening-id';
export * from './entry/get-entry-with-snapshots';
```

**検証基準**:
- `pnpm typecheck` が全 workspace で成功すること
- `@bulr/db` から `getEntriesByCandidateProfileId` / `getEntriesByOpeningId` / `getEntryWithSnapshots` / `EntryWithSnapshots` / `EntryWithOpeningAndCompany` / `EntryWithCandidateProfile` が import できること

---

## フェーズ 2: Server Actions

### タスク 2.1 ✅: createEntry Server Action（候補者側）

**目的**: `pending_invitation_token` cookie を消費して `entry` を作成し、`invitation.consumed_at` をセットする Server Action を実装する。

**実装ファイル**:
- [ ] `apps/candidate/app/invitations/[token]/confirm/_actions/create-entry.ts` — 新規作成

**実装詳細**:

```typescript
'use server';

import { z } from 'zod';
import { nanoid } from 'nanoid';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { authedAction } from '@bulr/auth/server';
import { requireCandidate } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { entry, invitation } from '@bulr/db';
import { getPrimaryResumeDocument } from '@bulr/db/queries';
import { getLatestResponseByCandidateProfileId } from '@bulr/db/queries';

const createEntrySchema = z.object({
  token: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/),
});

export const createEntry = authedAction(
  createEntrySchema,
  async ({ token }, { userId }) => {
    const { candidateProfile } = await requireCandidate();

    // invitation 検索と検証
    const [inv] = await db
      .select()
      .from(invitation)
      .where(eq(invitation.token, token))
      .limit(1);

    if (!inv) {
      return { ok: false, error: { code: 'INVITATION_NOT_FOUND', message: '無効な招待リンクです' } } as const;
    }
    if (inv.consumedAt !== null) {
      return { ok: false, error: { code: 'INVITATION_ALREADY_CONSUMED', message: 'この招待リンクは使用済みです' } } as const;
    }

    // スナップショット参照の取得（nullable）
    const primaryResume = await getPrimaryResumeDocument(candidateProfile.id, '履歴書');
    // スキルアンケートは backend survey id を使用（既存 seam の仕様に従い surveyId を動的取得するか固定）
    // MVP: 最初に見つかった skill_survey_response を取得（surveyId は省略可能なオーバーロードが将来必要）
    // 現状の getLatestResponseByCandidateProfileId は (candidateProfileId, surveyId) を必須とするため
    // 実装時に backend survey id を DB から取得して渡す（または null を許容）
    let surveyResponseId: string | null = null;
    // backend survey id 取得の実装は実装者が確認すること（skill-survey seam の surveyId 解決が必要）

    const entryId = nanoid();

    const result = await db.transaction(async (tx) => {
      // entry INSERT
      await tx.insert(entry).values({
        id: entryId,
        candidateProfileId: candidateProfile.id,
        openingId: inv.openingId,
        invitationId: inv.id,
        resumeDocumentId: primaryResume?.id ?? null,
        skillSurveyResponseId: surveyResponseId,
        status: 'submitted',
      });

      // invitation.consumed_at を条件付き UPDATE（race condition 対策）
      const updateResult = await tx
        .update(invitation)
        .set({ consumedAt: new Date() })
        .where(and(eq(invitation.id, inv.id), isNull(invitation.consumedAt)));

      // affectedRows = 0 なら競合（他リクエストが先に消費）
      if (updateResult.rowCount === 0) {
        tx.rollback();
        return { ok: false, error: { code: 'CONCURRENT_CONFLICT', message: 'エントリー処理が競合しました。再試行してください' } } as const;
      }

      return { ok: true, data: { entryId } } as const;
    });

    if (!result.ok) return result;

    // cookie クリア
    const cookieStore = await cookies();
    cookieStore.set('pending_invitation_token', '', { maxAge: 0, path: '/' });

    return { ok: true, data: { entryId: result.data.entryId } } as const;
  }
);
```

**注意点**:
- Drizzle の `tx.rollback()` API または transaction abort 方法は Drizzle ORM 0.45.x の API に従って実装すること
- `UNIQUE(candidate_profile_id, opening_id)` 制約違反は `catch` ブロックで `DUPLICATE_ENTRY` エラーとして処理すること
- `pending_invitation_token` cookie のクリアは `__Secure-` プレフィックス付きも考慮すること（`feedback_better_auth_secure_cookie_prefix.md` 参照）
- **surveyId 解決方針**: `getLatestResponseByCandidateProfileId(candidateProfileId, surveyId)` は `surveyId` を必須引数とする。`createEntry` での解決方針は以下の通り:
  - MVP: `skill_survey` テーブルから `SELECT id FROM skill_survey WHERE job_type = 'backend' AND is_active = true LIMIT 1` で `surveyId` を取得する (Wave 2 skill-survey で投入されたバックエンド職種 1 件のみが存在する前提)
  - 取得結果が空なら `skill_survey_response_id` を `NULL` のまま entry を作成する (アンケート未投入企業もエントリー可能)
  - Wave 5+ で複数職種対応する際は、`opening.job_type → skill_survey.job_type` のマッピングで取得する seam に拡張する

**検証基準**:
- `pnpm typecheck` が全 workspace で成功すること
- Server Action が `authedAction` ラッパー経由であること
- transaction 内で entry INSERT + invitation UPDATE が行われること
- `WHERE consumed_at IS NULL` 条件が UPDATE に含まれること

---

### タスク 2.2 ✅: getResumeSignedUrlForBusiness Server Action（企業側）

**目的**: 企業ユーザーが候補者の履歴書を署名 URL 経由で安全に閲覧するための Server Action を実装する。

**実装ファイル**:
- [ ] `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/_actions/get-resume-signed-url.ts` — 新規作成

**実装詳細**:

```typescript
'use server';

import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { head } from '@vercel/blob';
import { authedAction } from '@bulr/auth/server';
import { requireCompanyUser } from '@bulr/auth/server';
import { getEntryWithSnapshots } from '@bulr/db/queries';
import { AuthError } from '@bulr/auth/server';

const getResumeSignedUrlSchema = z.object({
  entryId: z.string().min(1),
  openingId: z.string().min(1),
});

export const getResumeSignedUrlForBusiness = authedAction(
  getResumeSignedUrlSchema,
  async ({ entryId, openingId }, { userId }) => {
    const { companyId } = await requireCompanyUser();

    const entryData = await getEntryWithSnapshots(entryId);
    if (!entryData) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'エントリーが見つかりません' } } as const;
    }

    // 所有権検証: getEntryWithSnapshots 戻り値の entry.opening.companyId で直接比較
    // (追加の opening SELECT は不要 — entryData.opening は既に JOIN 取得済み)
    if (entryData.opening.companyId !== companyId) {
      throw new AuthError('FORBIDDEN');
    }

    if (!entryData.entry.resumeDocumentId || !entryData.resumeDocument) {
      return { ok: false, error: { code: 'RESUME_NOT_AVAILABLE', message: '履歴書が削除されたか未登録です' } } as const;
    }

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) throw new Error('BLOB_READ_WRITE_TOKEN is not set');

    const blob = await head(entryData.resumeDocument.blobPathname, { token: blobToken });

    return { ok: true, data: { signedUrl: blob.downloadUrl } } as const;
  }
);
```

**検証基準**:
- `pnpm typecheck` が全 workspace で成功すること
- `getEntryWithSnapshots` の戻り値 `entryData.opening.companyId` で直接所有権検証すること (追加の `opening` SELECT は不要)
- `requireCompanyUser` + `opening.company_id` の二段階所有権検証が含まれること
- `BLOB_READ_WRITE_TOKEN` がサーバーサイドのみで使用されること

---

## フェーズ 3: 候補者側 UI

### タスク 3.0 ✅: proxy.ts の matcher 拡張 (apps/business + apps/candidate)

**目的**: entry-flow で新設するルートを proxy.ts の matcher に追加し、未認証アクセスを適切にリダイレクトする。

**実装ファイル**:
- [ ] `apps/business/proxy.ts` — matcher 更新
- [ ] `apps/candidate/proxy.ts` — matcher 更新

**実装詳細**:

1. `apps/business/proxy.ts` の `config.matcher` に以下を追加:
   - `/openings/:openingId/entries` (一覧)
   - `/openings/:openingId/entries/:entryId*` (詳細)

2. `apps/candidate/proxy.ts` の `config.matcher` に以下を追加:
   - `/invitations/:token/confirm`
   - `/entries`

3. 既存の `hasSessionCookie` フォールバック (`__Secure-better-auth.session_token` ↔ `better-auth.session_token`) を継承利用すること

4. 未認証時の redirect:
   - business 系 (`/openings/:openingId/entries*`): `/sign-in`
   - candidate `/invitations/:token/confirm`: `/sign-in?token={token}` (token クエリパラメータを引き継ぎ)
   - candidate `/entries`: `/sign-in`

**注意事項**:
- DB クエリは proxy では実施しない。Server Component / Server Action 側で `requireCandidate` / `requireCompanyUser` を行うこと (CVE-2025-29927 多層防御)
- proxy.ts は UX リダイレクト層であり、セキュリティの唯一の砦ではない

**Boundary**: BusinessProxy, CandidateProxy

**Requirements**: 要件 7.3 (企業側エントリー一覧の認証ガード)、要件 8.4 (企業側エントリー詳細の認証ガード)、要件 5.4 (候補者エントリー一覧の認証ガード)、要件 4.1 (候補者確認画面の認証ガード)

**検証基準**:
- 未認証で `/openings/{openingId}/entries` にアクセスすると `/sign-in` にリダイレクトされること
- 未認証で `/openings/{openingId}/entries/{entryId}` にアクセスすると `/sign-in` にリダイレクトされること
- 未認証で `/invitations/{token}/confirm` にアクセスすると `/sign-in?token={token}` にリダイレクトされること
- 未認証で `/entries` にアクセスすると `/sign-in` にリダイレクトされること

---

### タスク 3.1 ✅: エントリー確認画面（候補者）

**目的**: `/invitations/[token]/confirm` でエントリー確認画面を実装する。

**実装ファイル**:
- [ ] `apps/candidate/app/invitations/[token]/confirm/page.tsx` — 新規作成

**実装詳細**:

1. Server Component として実装
2. `requireCandidate()` でガード
3. `pending_invitation_token` cookie から token を取得（cookie がなければエラー表示）
4. `invitation` テーブルを token で検索し、`consumed_at IS NOT NULL` なら「使用済みです」表示
5. `opening` + `company` を JOIN して会社名・募集名を表示
6. `getPrimaryResumeDocument(candidateProfile.id, '履歴書')` で履歴書の有無を表示
7. 確定ボタンは Client Component 化（`'use client'`）して `createEntry` Server Action を呼ぶ
8. 確定成功後に `/entries` へ router.push

**UI 要素（最小限）**:
- 会社名・募集名の表示
- 候補者の主履歴書の有無（「登録済み」/ 「未登録」）
- 候補者のスキルアンケート回答の有無
- 「エントリーを確定する」ボタン（Client Component）
- エラーメッセージの表示領域

**注意: `pending_invitation_token` cookie 取得時の `__Secure-` フォールバック**:

本番 HTTPS 環境では、cookie 名に `__Secure-` プレフィックスが付与される場合がある。`candidate-auth-onboarding` 7.1 が設定する `pending_invitation_token` は HttpOnly cookie のため、`NextRequest.cookies.get()` で取得する際に名前が `pending_invitation_token` か `__Secure-pending_invitation_token` のどちらかになる可能性がある。両名フォールバック必須 (project memory `feedback_better_auth_secure_cookie_prefix.md` 参照)。

実装例:
```typescript
const cookieStore = await cookies();
const tokenCookie =
  cookieStore.get('__Secure-pending_invitation_token') ??
  cookieStore.get('pending_invitation_token');
```

cookie クリア時も同じ 2 名で `delete()` すること。

> 注: `cookies().set()` シンタックスでは Next.js が自動で `__Secure-` を付けないため、Better Auth とは異なる cookie ライフサイクルを持つ。よって両名フォールバックは念のための防御策として記載している。

**検証基準**:
- `requireCandidate()` でガードされていること
- 有効な invitation がある場合のみ確定ボタンが表示されること
- 使用済み invitation の場合は「使用済みです」が表示されること

---

### タスク 3.2 ✅: 候補者エントリー一覧ページ

**目的**: `/entries` で候補者の全エントリーを一覧表示する Server Component を実装する。

**実装ファイル**:
- [ ] `apps/candidate/app/entries/page.tsx` — 新規作成

**実装詳細**:

1. Server Component として実装
2. `requireCandidate()` でガード
3. `getEntriesByCandidateProfileId(candidateProfile.id)` でデータ取得
4. テーブルまたはカードで一覧表示（企業名・募集名・エントリー日・ステータス）
5. 空の場合は Empty State メッセージを表示

**status の日本語表示**:
- `submitted` → 「書類確認中」
- `reviewed` → 「確認済み」
- `rejected` → 「不合格」
- `progressing` → 「選考中」

**検証基準**:
- `requireCandidate()` でガードされていること
- 一覧が `entry.created_at DESC` 順で表示されること
- 空の場合に Empty State が表示されること

---

## フェーズ 4: 企業側 UI

### タスク 4.1 ✅: 企業側エントリー一覧ページ

**目的**: `/openings/[openingId]/entries` で企業ユーザーがエントリー一覧を確認できる Server Component を実装する。

**実装ファイル**:
- [ ] `apps/business/app/(interviewer)/openings/[openingId]/entries/page.tsx` — 新規作成

**実装詳細**:

1. Server Component として実装
2. `requireCompanyUser()` でガード
3. `opening` テーブルを `openingId` と `companyId` で検索し、所有権確認（失敗時 `notFound()`）
4. `getEntriesByOpeningId(openingId)` でエントリー一覧取得
5. テーブルで一覧表示（候補者名・エントリー日・ステータス・詳細リンク）
6. 空の場合は「まだエントリーはありません」Empty State を表示

**検証基準**:
- `requireCompanyUser()` + opening 所有権検証が実装されていること
- 他社 opening へのアクセスが `notFound()` で弾かれること

---

### タスク 4.2 ✅: 企業側エントリー詳細ページ

**目的**: `/openings/[openingId]/entries/[entryId]` で企業ユーザーがエントリー詳細を確認できる Server Component を実装する。

**実装ファイル**:
- [ ] `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/page.tsx` — 新規作成

**実装詳細**:

1. Server Component として実装
2. `requireCompanyUser()` でガード
3. `getEntryWithSnapshots(entryId)` でデータ取得（存在しない場合 `notFound()`）
4. `entry.opening_id → opening.company_id === companyId` の所有権確認（失敗時 `notFound()`）
5. 候補者名・エントリー日・ステータスを表示
6. `entry.resumeDocumentId` が null でなければ「履歴書を確認」ボタンを表示（`getResumeSignedUrlForBusiness` を呼ぶ Client Component 部分）
7. `entry.skillSurveyResponseId` が null でなければスキルアンケート確認エリアを表示
8. 「面接セッションを作成」ボタンをプレースホルダとして表示（disabled または Coming Soon 表示）

**「履歴書を確認」ボタンの実装**:
- `'use client'` コンポーネントとして分離
- クリック時に `getResumeSignedUrlForBusiness({ entryId, openingId })` を呼ぶ
- 成功時: `window.open(signedUrl, '_blank')`
- エラー時: エラーメッセージを表示

**検証基準**:
- `requireCompanyUser()` + opening / entry 所有権検証が実装されていること
- 履歴書確認ボタンで署名 URL が発行されること
- `entry.resumeDocumentId` が null の場合はボタンが表示されないかグレーアウトされること

---

## フェーズ 5: 統合検証

### タスク 5.1: 統合 Smoke Test の実施

**目的**: エンドツーエンドのエントリーフローが正常に動作することを手動 smoke test で確認する。

**実施内容**:

1. **DB 確認**:
   - [ ] `entry` テーブルが DB に存在すること
   - [ ] `UNIQUE(candidate_profile_id, opening_id)` インデックスが存在すること
   - [ ] `entry.resume_document_id` の FK が `ON DELETE SET NULL` で定義されていること
   - [ ] `entry_status` enum が DB に存在すること

2. **エントリー確定フロー（候補者）**:
   - [ ] 有効な招待リンクからサインイン後、`/invitations/{token}/confirm` で会社名・募集名が表示される
   - [ ] 「エントリーを確定する」ボタンをクリックすると entry が作成される
   - [ ] 確定後に `/entries` にリダイレクトされる
   - [ ] 同じ招待リンクで再度 confirm にアクセスすると「使用済みです」が表示される

3. **重複エントリー防止**:
   - [ ] 同一候補者が同一 opening に 2 回エントリーを試みると DUPLICATE_ENTRY エラーが返る

4. **候補者エントリー一覧**:
   - [ ] `/entries` でエントリー一覧（企業名・募集名・日付・ステータス）が表示される
   - [ ] 未認証でのアクセスが `/sign-in` にリダイレクトされる

5. **企業側エントリー一覧・詳細**:
   - [ ] `/openings/{openingId}/entries` でエントリー一覧が表示される
   - [ ] `/openings/{openingId}/entries/{entryId}` で候補者詳細が表示される
   - [ ] 「履歴書を確認」ボタンで署名 URL が発行され PDF が開く
   - [ ] 他社 opening へのアクセスが 404 になる

6. **ビルドとタイプチェック**:
   - [ ] `pnpm build` が全 packages と apps で成功すること
   - [ ] `pnpm typecheck` が全 workspace で成功すること

---

## タスク依存グラフ

```
タスク 1.1 (entry スキーマ)
  └── タスク 1.2 (migration 生成・適用)
       └── タスク 1.3 (クエリ関数実装)
            ├── タスク 2.1 (createEntry Server Action)
            │    ├── タスク 3.0 (proxy.ts matcher 拡張) ─────────────┐
            │    └── タスク 3.1 (エントリー確認画面) ←──────────────┘
            │         └── タスク 3.2 (候補者エントリー一覧)
            └── タスク 2.2 (getResumeSignedUrlForBusiness)
                 ├── タスク 4.1 (企業側エントリー一覧) ←─────────────┘
                 └── タスク 4.2 (企業側エントリー詳細)
                      └── タスク 5.1 (統合 Smoke Test)
```

タスク 3.0 は 2.1 / 2.2 と並列実装可能。タスク 4.1 と 4.2、タスク 3.1 と 3.2 はそれぞれ並列実装可能（共通依存タスク完了後）。

---

## 実装上の注意事項

1. **Drizzle transaction の rollback**: `tx.rollback()` の挙動は Drizzle ORM 0.45.x の API ドキュメントを確認すること。transaction が例外を throw することで rollback される場合はエラーを throw する方式を使うこと

2. **skill survey id の解決**: `getLatestResponseByCandidateProfileId` は `(candidateProfileId, surveyId)` を必須引数とする。`createEntry` で surveyId を取得するには、`skill_survey` テーブルから `job_type = 'backend'` で取得するか、定数として扱う。MVP では backend 固定で問題ないが、実装時に確認すること

3. **`pending_invitation_token` cookie のクリア**: 本番 HTTPS では `__Secure-` プレフィックスが付与される（`feedback_better_auth_secure_cookie_prefix.md` 参照）。cookie クリア時は両方の名前パターン（`pending_invitation_token` と `__Secure-pending_invitation_token`）を削除すること

4. **`packages/db/src/queries/index.ts` の export**: 実装時に `packages/db/src/queries/index.ts` ファイルの現状を確認し、既存 export との整合性を保つこと

5. **`authedAction` の `ctx` の型**: `ctx.userId` は `authedAction` が提供する。`candidateProfileId` は `requireCandidate()` を body 内で呼び出して取得すること（`candidateAction` は Wave 2 スコープ外の設計）

6. **企業側プロキシ設定**: `apps/business/proxy.ts` の matcher に `/openings/[openingId]/entries/*` が含まれているか確認し、未認証時リダイレクトが機能することを確認すること
