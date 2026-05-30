# Research Log — company-and-opening

## Discovery Scope

**Feature Type**: Extension（既存 Wave 1/2 基盤への追加）  
**Discovery Process**: Integration-focused（light discovery + codebase analysis）

---

## Codebase Analysis

### 調査済みファイル

- `packages/auth/src/guards.ts` — `requireUser` / `requireAdmin` / `requireCandidate` パターンを確認。`requireCompanyUser` は `requireUser()` 呼び出し + `user_profile.company_id IS NOT NULL` チェックで同一パターンで実装可能
- `packages/auth/src/safe-action.ts` — `authedAction` / `adminAction` パターンを確認。`companyAction` を導入せず `authedAction + 内部 requireCompanyUser` で対応（Wave 2 で `candidateAction` を導入しなかった決定と対称）
- `packages/auth/src/errors.ts` — `AuthErrorCode` union に追加する形で `'COMPANY_NOT_ASSOCIATED'` を追加する
- `packages/auth/src/server-entry.ts` — `requireCandidate` の re-export パターンを確認。同パターンで `requireCompanyUser` を追加
- `packages/db/src/schema/user-profile.ts` — `{ withTimezone: true }` なし（`defaultNow()` のみ）。既存スキーマとの一貫性を考慮しつつ、新規カラム `company_id` は単純な nullable FK として追加
- `packages/db/src/schema/candidate-profile.ts` — Wave 2 での `{ withTimezone: true }` 非使用を確認。ただし brief.md の制約に従い新規テーブルは `{ withTimezone: true }` 統一とする
- `apps/business/app/(interviewer)/interviews/` — 既存ルート構造を確認。`/openings` は `(interviewer)` グループ配下に配置する

### 既存 convention の確認

| 項目 | 確認済み convention |
|------|-------------------|
| PK 生成 | `nanoid()` で生成後 INSERT（既存テーブル全般） |
| timestamp | 新規テーブルは `{ withTimezone: true }` 統一（brief.md 制約） |
| Server Action | `authedAction(schema, handler)` パターン |
| DB クエリ | `packages/db` の Drizzle client (`db`) を直接使用 |
| 所有権チェック | `WHERE id = X AND owner_id = userId` のインラインクエリ |
| ルートグループ | `(interviewer)/` 配下でアプリ内ルートを管理 |

---

## Architecture Pattern Evaluation

### candidateAction vs authedAction + 内部 requireCompanyUser

**選択**: `authedAction` + 内部 `requireCompanyUser` パターン（`companyAction` 非導入）

**理由**:
- Wave 2 の `candidateAction` 非導入決定（design.md §candidateAction — Wave 2 スコープ外の明示）と対称的
- 企業向け Server Action が `company_id` を必要とするケースは `requireCompanyUser()` を handler 内で呼ぶだけで解決
- 3 つ以上の Server Action が同一パターンを共有するようになった時点で `companyAction` 導入を検討する（Wave 4+ の判断）

### URL 構築方式

**選択**: Server Action 内でインライン構築、DB には token のみ保存

**理由**:
- `CANDIDATE_BASE_URL` は環境変数であり、本番 / dev / preview 環境で異なる
- URL 全体を DB に保存すると環境依存が発生し、URL 変更時に DB 更新が必要になる
- token から URL を再構築する方が一貫性が高い（brief.md 制約 §招待リンクの取り扱い）

---

## Key Design Decisions

| 決定 | 内容 | 理由 |
|------|------|------|
| requireCompanyUser 位置 | `packages/auth/src/guards.ts` | 既存 guard 関数と同一ファイル。`packages/auth → packages/db` 依存方向を維持 |
| companyAction 非導入 | `authedAction + 内部 requireCompanyUser` | Wave 2 の candidateAction 非導入決定との対称性 |
| `consumed_at` seam | nullable + 本 spec では更新しない | Wave 3 `entry-flow` が entry 作成時に設定する。Wave 3 OOS の明示 |
| token 生成 | `crypto.randomBytes(32).toString('base64url')` | 256bit entropy、URL-safe、Wave 2 `/invitations/[token]` regex 互換 |
| expires_at | nullable、MVP は NULL 運用 | 有効期限判定 UI は本 spec スコープ外 |
| status enum | Postgres `pgEnum` | Drizzle の型安全 enum、既存 Wave 1/2 の convention |
| CopyUrlButton | `'use client'` 単独コンポーネント | `navigator.clipboard` は browser API のため Server Component に混在させない |

---

## Risks and Mitigations

| リスク | 対策 |
|--------|------|
| token UNIQUE 衝突（確率は天文学的に低いが） | DB の UNIQUE 制約でエラーが発生 → Server Action がエラーを伝播して UI に表示。リトライロジックは MVP スコープ外 |
| `CANDIDATE_BASE_URL` 未設定 | Server Action 内で `if (!candidateBaseUrl) throw new Error(...)` で fail-loud。`turbo.json` への追加で Vercel ビルド時も検出可能 |
| user_profile.company_id migration の non-destructive 確認 | nullable FK のため既存レコードへの影響なし。`drizzle-kit push` 後に既存 user_profile レコードが NULL で残ることを確認 |
| 企業ユーザーが手動 DB 操作なしに company に所属できない | Wave 4 `admin-operations` が管理 UI を提供する予定。本 spec では手動 DB 操作を前提とする |
