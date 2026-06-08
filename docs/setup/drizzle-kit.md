# drizzle-kit 運用手順

対象タスク: task 2.10

---

## dev branch への反映

開発中のスキーマ変更を dev branch に即座に反映する場合は `push` を使用する。マイグレーション履歴は残らないため、試行錯誤に適している。

1. `.env.local` の `DATABASE_URL` を **dev branch** の接続文字列に設定する
2. 以下のコマンドを実行する

```bash
pnpm --filter @bulr/db push
```

- スキーマが dev branch に**直接反映**される
- マイグレーション履歴（SQL ファイル）は生成されない
- 開発中の試行錯誤用途に限定して使用する

---

## production branch への反映

本番環境への反映は必ず `generate` → レビュー → `migrate` の順で行う。

> **実運用の落とし穴と検証込みの手順は [db-migration-runbook.md](./db-migration-runbook.md) を参照。**
> 特に「DIRECT(非プール) URL を使う」「`.env.local` の env 上書き回避（`DIRECT_URL`/`DATABASE_URL` をインライン明示）」「`__drizzle_migrations` が空（push 構築）の場合は `migrate` が全再適用で失敗する → psql 直接適用へ切替」「UNIQUE 追加時の重複事前チェック」「デプロイ順序」は本番適用前に必読。

### 1. スキーマを確定する（dev branch で作業）

dev branch でスキーマの変更を完了させる。

### 2. マイグレーションファイルを生成する

1. `.env.local` の `DATABASE_URL` を **dev branch** の接続文字列に設定する
2. 以下のコマンドを実行する

```bash
pnpm --filter @bulr/db generate
```

- `packages/db/drizzle/<番号>_<suffix>.sql` 形式の SQL ファイルが生成される
- ファイル名（番号・suffix）は drizzle-kit が自動決定する（ハードコードしない）

### 3. レビューしてマージする

生成された SQL ファイルを git コミットし、PR を作成してレビューを受ける。

### 4. production branch に適用する

PR マージ後、`.env.local` の `DATABASE_URL` を一時的に **production branch** の接続文字列に切り替えて以下を実行する。

```bash
pnpm --filter @bulr/db migrate
```

実行後、`.env.local` を元の dev branch URL に戻す。

---

## 警告

> **本番 DB（production branch）に対して `push` を直接実行することは禁止。**
> 必ず `generate` → レビュー → `migrate` の順で進めること。
> `push` はマイグレーション履歴を残さずスキーマを上書きするため、本番環境での使用は取り返しのつかないデータ損失につながる可能性がある。

---

## 本スペックにおける検証範囲

> 初回スキーマの確定は **assessment-pattern-seed** および **assessment-engine** spec で実施する。本スペック（multi-env-infrastructure）では、`drizzle.config.ts` が `DATABASE_URL` を正しく読み取れること（設定ファイルの疎通確認）のみを検証対象とする。

---

## 完了確認方法

| 確認項目 | 確認箇所 |
|---|---|
| `drizzle.config.ts` が `DATABASE_URL` を読み取れること | `pnpm --filter @bulr/db push` を dev branch URL で実行してエラーなく完了すること |
| `generate` コマンドが動作すること | `pnpm --filter @bulr/db generate` を実行して SQL ファイルが生成されること |
