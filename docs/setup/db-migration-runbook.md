# 本番 DB マイグレーション適用 runbook

本番（Neon production branch）へマイグレーションを適用するときの実践手順。
`docs/setup/drizzle-kit.md` の標準フロー（`generate → review → migrate`）を前提に、
**実運用で踏みやすい落とし穴と検証**を加えたもの。新規マイグレーションでも再利用すること。

> 標準フローの基本は [drizzle-kit.md](./drizzle-kit.md) を参照。本書はその「本番適用」を安全に行うための補足 runbook。

---

## 0. 前提と落とし穴（必読）

- **接続は DIRECT（非プール）URL を使う。** drizzle-kit は `DIRECT_URL > DATABASE_URL` の順で接続する（`packages/db/drizzle.config.ts`）。Neon の **pooled (`-pooler` 付き)** URL は migration コマンドで不安定（prepared statement / advisory lock / トランザクション跨ぎ）。必ず **Direct connection** を使う。
- **`.env.local` の env 上書きの罠。** `.env.local` 末尾に複数行のシェル例（`DATABASE_URL=...` 等）があり、dotenv がそれを拾って意図しない URL で上書きすることがある。**drizzle-kit / psql 実行時は `DIRECT_URL` と `DATABASE_URL` を両方インラインで明示**すること（後述コマンド参照）。
- **`__drizzle_migrations` 追跡テーブルの状態に注意。** DB を過去に `drizzle-kit push` で構築していると追跡テーブルが空（または欠落）。その状態で `drizzle-kit migrate` を実行すると **0000 から全マイグレーションを再適用**しようとし、既存オブジェクト衝突で失敗・ハングする。→ **適用前に必ず追跡状態を確認**し、空なら psql 直接適用へ切り替える（後述 3B）。
- **`push` を本番に直接実行することは禁止**（[drizzle-kit.md](./drizzle-kit.md) の警告参照）。

---

## 1. 安全策（推奨）

Neon はブランチを即時作成できる。**本番のコピーブランチを作って先にリハーサル**してから本番へ。
最低でも PITR（Point-in-Time Restore）が有効なことを確認しておく。

---

## 2. DIRECT URL を入手

Neon ダッシュボード → 対象プロジェクト → Connection string → **「Direct connection」**（`-pooler` の付かない方）をコピー。

```bash
export PROD_DIRECT_URL='postgresql://<user>:<pass>@<ep>.<region>.aws.neon.tech/<db>?sslmode=require'
```

> Vercel から取得する場合は `vercel env pull` が `.env.local` を上書きするため**事前 backup 必須**。ダッシュボード直取りが安全。

---

## 3. 現状確認（read-only・無変更）

```bash
# 対象テーブルの現在のインデックス
psql "$PROD_DIRECT_URL" -c "SELECT indexname FROM pg_indexes WHERE tablename = '<table>' ORDER BY indexname;"

# 追跡テーブルの状態（これで方式が決まる）
psql "$PROD_DIRECT_URL" -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY id;" 2>&1 | tail -5
```

判定：

- **(A) 追跡テーブルがあり、直前のマイグレーションまで記録済み** → 3A（`drizzle-kit migrate` が新規分だけ綺麗に当たる）
- **(B) テーブルが無い／空／古い（push 構築）** → 3B（対象 SQL を psql で直接適用）

### 3-pre. 制約が壊れないか事前チェック（UNIQUE を追加する場合は必須）

新規 UNIQUE インデックスを作るマイグレーションでは、重複があると CREATE が失敗する。先に確認：

```bash
psql "$PROD_DIRECT_URL" -c "SELECT count(*) - count(DISTINCT <col>) AS dup FROM <table>;"  # → 0 を確認
```

### 3A. 追跡が健全：drizzle-kit migrate

```bash
cd packages/db
DIRECT_URL="$PROD_DIRECT_URL" DATABASE_URL="$PROD_DIRECT_URL" pnpm exec drizzle-kit migrate
```

→ 未適用分のみ適用され、追跡テーブルにも記録される（理想）。

### 3B. 追跡が空／push 構築：psql で対象 SQL を直接適用

対象マイグレーション `packages/db/drizzle/<番号>_<suffix>.sql` の中身を、`BEGIN; … COMMIT;` で囲んで流す（`--> statement-breakpoint` は除いて各文を実行）。`-v ON_ERROR_STOP=1` で途中失敗時に確実に中断させる。

```bash
psql "$PROD_DIRECT_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
-- ここに対象 .sql の各文を貼る
COMMIT;
SQL
```

（任意）以後 drizzle-kit migrate を使いたい場合は、追跡テーブルに適用済みとして backfill しておくと次回から整合する。push 運用を続けるなら不要。

---

## 4. 適用後の検証

```bash
# 期待するインデックス構成になっているか
psql "$PROD_DIRECT_URL" -c "SELECT indexname FROM pg_indexes WHERE tablename = '<table>' ORDER BY indexname;"
# 行数が不変か（インデックス操作のみなら必ず不変）
psql "$PROD_DIRECT_URL" -c "SELECT count(*) FROM <table>;"
```

---

## 5. デプロイ順序（スキーマと実行コードの整合）

旧コードと新コードでスキーマ前提が違う場合、**マイグレーションとデプロイのタイミングを揃える**。
旧コードが消えた制約に依存していると、適用直後〜デプロイ完了までの窓で旧コードが失敗する。

推奨：

1. **メンテ短窓**：マイグレーション適用 → 直後に新コードをデプロイ（インデックス操作のみなら秒で完了し窓は最小）。
2. もしくはデプロイパイプラインにマイグレーションを組み込み、コード切替と同期させる。

ロールバックは逆操作（新インデックスを drop し旧制約を再作成）で可能。

---

## 付録: self-analysis-history（migration `0014_naive_tomas`）

spec `self-analysis-history`（自己分析の履歴・追記型化）の本番適用メモ。**まだ本番未適用なら本書 3〜5 に従って適用すること。**

- **内容**: インデックスのみ（DROP×2 / CREATE×3）。データ変更なし・高速。
  - DROP `skill_survey_response_candidate_survey_idx`（旧 UNIQUE）
  - DROP `self_analysis_candidate_survey_idx`（旧 UNIQUE）
  - CREATE `skill_survey_response_candidate_survey_submitted_idx`（非UNIQUE: candidate, survey, submitted_at）
  - CREATE **UNIQUE** `self_analysis_source_response_idx`（source_response_id）
  - CREATE `self_analysis_candidate_survey_submitted_idx`（非UNIQUE: candidate, survey, source_submitted_at）
- **3-pre 事前チェック（必須）**:
  ```bash
  psql "$PROD_DIRECT_URL" -c "SELECT count(*) - count(DISTINCT source_response_id) AS dup FROM self_analysis;"  # → 0
  ```
- **3B 直接適用 SQL**（追跡テーブルが空の場合）:
  ```bash
  psql "$PROD_DIRECT_URL" -v ON_ERROR_STOP=1 <<'SQL'
  BEGIN;
  DROP INDEX "skill_survey_response_candidate_survey_idx";
  DROP INDEX "self_analysis_candidate_survey_idx";
  CREATE INDEX "skill_survey_response_candidate_survey_submitted_idx"
    ON "skill_survey_response" USING btree ("candidate_profile_id","skill_survey_id","submitted_at");
  CREATE UNIQUE INDEX "self_analysis_source_response_idx"
    ON "self_analysis" USING btree ("source_response_id");
  CREATE INDEX "self_analysis_candidate_survey_submitted_idx"
    ON "self_analysis" USING btree ("candidate_profile_id","skill_survey_id","source_submitted_at");
  COMMIT;
  SQL
  ```
- **デプロイ整合（重要）**: 旧コードは `skill_survey_response` を `onConflict(candidate, survey)` で upsert、新コードは append-only insert＋`self_analysis` を `onConflict(source_response_id)`。旧 UNIQUE 削除（migration）と新コードデプロイは揃えること（本書 5）。
- **ローカル検証の経緯**: ローカル Docker Postgres は push 構築で `__drizzle_migrations` が空のため、ローカルでは生成済み `0014` SQL を psql 直接適用して検証済み（行数不変・新 UNIQUE 重複0）。本番も同様に 3B で適用する可能性が高い。
