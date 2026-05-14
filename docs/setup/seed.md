# assessment_pattern シード投入手順

## 前提

`DATABASE_URL` が `.env.local` に設定済みであること。設定方法は [`multi-env-infrastructure` spec のセットアップドキュメント](./env-vars.md) を参照してください。

---

## 1. 初回マイグレーション手順

### 1-1. マイグレーション SQL を生成する

```bash
pnpm --filter @bulr/db generate
```

`packages/db/drizzle/*_assessment_patterns.sql` の glob パターンに一致するマイグレーションファイルが生成されます。ファイル名の連番は drizzle-kit が自動決定するため、ハードコードしないでください。

### 1-2. 出力 SQL をレビューする

生成された `packages/db/drizzle/*_assessment_patterns.sql` を開き、以下のカラムが正しく定義されていることを確認してください。

- `id` (text, primary key)
- `code` (text, unique not null)
- `category` (enum: `design` / `trouble` / `performance` / `security` / `organization` / `ai`)
- `title`, `description`, `ai_perspective` (text not null)
- `expected_scope_min`, `expected_scope_max` (integer not null)
- `level_1_intro`, `level_2_focus`, `level_3_focus`, `level_4_focus` (text not null)
- `signals` (text[] not null)
- `is_active` (boolean not null default true)
- `created_at`, `updated_at` (timestamp not null default now)

問題がなければ、この SQL ファイルを git にコミットして PR を作成し、レビューを受けてください。

### 1-3. dev branch にスキーマを反映する（開発環境）

```bash
pnpm --filter @bulr/db push
```

`.env.local` の `DATABASE_URL` が dev branch（またはローカル Docker DB）を指している状態で実行してください。`assessment_pattern` テーブルが DB に作成されます。

---

## 2. シード投入手順

マイグレーションが完了したら、以下のコマンドでシードデータを投入します。

```bash
pnpm seed:patterns
```

このコマンドは `scripts/seed-assessment-patterns.ts` を実行します。`DATABASE_URL` が指すブランチ（dev または production）に対して、57 件のパターンデータを **idempotent upsert**（`INSERT ... ON CONFLICT (code) DO UPDATE`）で投入します。同じデータを 2 回以上実行してもレコードは重複しません。

投入完了後、スクリプトはカテゴリ別件数と総数をログ出力します。

```
assessment_pattern: total = 57
category: design = 15, trouble = 12, performance = 8, security = 8, organization = 8, ai = 6
```

---

## 3. 検証クエリ

投入後、以下の SQL で件数を確認してください。

### 総件数の確認

```sql
SELECT COUNT(*) FROM assessment_pattern;
```

期待値: **57**

### カテゴリ別件数の確認

```sql
SELECT category, COUNT(*) FROM assessment_pattern GROUP BY category;
```

期待値:

| category     | count |
|--------------|-------|
| design       | 15    |
| trouble      | 12    |
| performance  | 8     |
| security     | 8     |
| organization | 8     |
| ai           | 6     |

---

## 4. production 投入手順

本番ブランチへの投入は必ず以下の順序で行ってください。

### 4-1. `DATABASE_URL` を本番ブランチに切り替える

`.env.local` の `DATABASE_URL` を production branch の接続文字列に変更します。

```dotenv
# 本番ブランチの例
DATABASE_URL=postgresql://<user>:<pass>@<host>-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

### 4-2. マイグレーションを適用する

```bash
pnpm --filter @bulr/db migrate
```

`drizzle.__drizzle_migrations` に適用履歴が記録されます。`push` は本番環境では使用しないでください。

### 4-3. シードを投入する

```bash
pnpm seed:patterns
```

投入後は必ず[検証クエリ](#3-検証クエリ)で件数を確認してください。

### 4-4. `DATABASE_URL` を dev branch に戻す

作業完了後、`.env.local` の `DATABASE_URL` を dev branch の接続文字列に戻してください。

---

## 5. 注記

### マイグレーションファイル名はハードコードしない

マイグレーションファイルは `packages/db/drizzle/*_assessment_patterns.sql` の glob で参照してください。drizzle-kit が自動採番するため、連番（例: `0001_`）をドキュメントや設定ファイルにハードコードしないようにしてください。

### Markdown ドキュメントが真実、TypeScript シードは転記物

パターン定義の真実は以下の Markdown ドキュメントにあります。

- `docs/02-questionnaire-patterns.md` — パターンの状況・説明・射程
- `docs/03-probe-logic.md` — 4 段階質問テンプレ・真贋シグナル・AI 観点問い

`packages/db/src/seeds/patterns/` 配下の TypeScript シードファイルはこれらの転記物です。将来 Markdown とシードの間で差分が発生した場合は、**Markdown を正として** TypeScript シードを更新してください。

### `is_active` は upsert の SET 句から除外されている

`pnpm seed:patterns` を実行しても、既存レコードの `is_active` フラグは上書きされません。運用中に手動で `is_active = false` に設定したレコード（廃止パターン）は、シード再投入後も `false` のまま保護されます。
