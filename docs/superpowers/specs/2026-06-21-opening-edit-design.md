# 募集（opening）編集機能 設計

## 目的

`apps/business` の `/openings/` 配下に、既存の募集（opening）を編集する機能を追加する。
現状は新規作成（`/openings/new`）と詳細閲覧（`/openings/:id`）のみで、作成後の修正手段がない。

## スコープ

- 編集可能項目: `title` / `description` / `status` の3項目（新規作成フォームと同一）。
- 入口: ①詳細ページ（`/openings/:id`）の編集ボタン、②一覧ページ（`/openings`）の編集リンク。
- 認可: 自社（`companyId` 一致）の opening のみ編集可。他社のものは `notFound()`。

非スコープ: 募集の削除、項目追加、ステータス専用トグル UI。

## アプローチ: フォーム共通化

`CreateOpeningForm` は title/description/status を持ち、内部で `createOpening` を呼ぶ。
編集はバリデーション・項目とも同型のため、共通の `OpeningForm` に汎用化して重複を避ける。

## 構成

| 種別 | パス | 内容 |
|---|---|---|
| 共通フォーム | `openings/_components/opening-form.tsx` | `mode`（'create' \| 'edit'）・`defaultValues`・`openingId?` を受け取る Client Component。ボタン文言（作成する／保存する）と送信アクションを mode で切替。zod スキーマは既存（title 1–200字、description ≤5000字、status enum）を流用。 |
| 既存フォーム | `openings/_components/create-opening-form.tsx` | `OpeningForm mode="create"` を呼ぶ薄いラッパーに置換（既存 import 互換維持）。 |
| 編集ページ | `openings/[openingId]/edit/page.tsx` | Server Component。`requireCompanyUser` で認証＋`id AND companyId` で opening 取得、無ければ `notFound()`。現在値を `OpeningForm` の `defaultValues` に渡す。パンくず＋カード枠は `new/page.tsx` に倣う。 |
| 更新アクション | `openings/[openingId]/_actions/update-opening.ts` | `authedAction(schema, ...)`。`requireCompanyUser` で `companyId` 取得 → `id AND companyId` で対象存在確認（無ければ `AuthError('NOT_FOUND')`）→ `db.update(opening).set({ title, description, status, updatedAt: new Date() })` → `revalidatePath('/openings')` と `/openings/:id` → `redirect('/openings/:id')`。`update-entry-status.ts` のパターンに準拠。 |
| 入口①詳細 | `[openingId]/page.tsx` | タイトル／ステータス行に「編集」リンク（`/openings/:id/edit`）を追加。 |
| 入口②一覧 | `openings/page.tsx` | アクション列の「詳細」に並べて「編集」リンクを追加。 |

## データフロー

編集ページ表示時に DB から現在値取得 → フォーム初期値に反映 → 送信で
`updateOpening({ openingId, title, description, status })` → 所有確認後 `db.update` →
`revalidatePath` → 詳細ページへ `redirect`。

## エラー / 認可

- 編集ページ・更新アクションの双方で `companyId` 一致を検証。不一致・不在は失敗扱い（ページは `notFound()`、アクションは `AuthError`）。
- バリデーション失敗時はフォームにエラー表示（既存 `create-opening-form.tsx` の `FormMessage` / `errorMessage` 機構を流用）。

## テスト

- `update-opening.ts` のユニットテスト: (1) 自社 opening を更新できる、(2) 他社 opening は拒否、(3) 存在しない opening は拒否、(4) `updatedAt` が更新される。既存 Server Action テストのモック方式に合わせる。
- 既存テスト（全体スイート）が緑のままであることを確認。
