# ローカル開発環境のセットアップ

## 前提条件

| ツール | バージョン | 確認コマンド |
|---|---|---|
| **Docker Desktop** | 最新版 | `docker --version` |
| **Node.js** | 22 以上 | `node --version` |
| **pnpm** | 10 以上 | `pnpm --version` |

---

## セットアップ手順

### 1. 依存パッケージをインストール

```bash
pnpm install
```

### 2. 環境変数ファイルを作成

```bash
cp .env.example .env.local
```

### 3. `.env.local` に値を設定

`.env.local` を開き、以下のキーを設定してください。

**ローカル Docker DB（自動設定済み）**:

```dotenv
DATABASE_URL=postgresql://bulr:dev_password@localhost:5433/bulr_dev
```

**ご自身で設定が必要なキー**:

| 変数 | 取得方法 |
|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` で生成 |
| `RESEND_API_KEY` | [Resend Dashboard](https://resend.com) → API Keys |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com) → API Keys |
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com) → API Keys |
| `CRON_SECRET` | `openssl rand -base64 32` で生成 |
| `ADMIN_BASIC_AUTH_PASSWORD` | 任意のパスワード |

`BLOB_READ_WRITE_TOKEN` は Vercel Blob ストア作成後に自動付与されるため、ローカル開発では空のままで OK（Blob を使う機能をテストする場合のみ設定）。

### 4. `apps/web/.env.local` をシンボリックリンクに設定

Next.js は各アプリディレクトリの `.env.local` のみを読み込みます。root の `.env.local` 1 ファイルで管理するため、シンボリックリンクを作成します。

```bash
ln -sf ../../.env.local apps/web/.env.local
```

> リンク先は `.gitignore` の `.env*.local` パターンで除外されるため、リポジトリにはコミットされません。  
> clone 直後に 1 回だけ実行すれば、以降は root の `.env.local` を編集するだけで反映されます。

### 5. Docker コンテナを起動

```bash
pnpm db:up
```

PostgreSQL 17 コンテナが起動します（port 5433）。初回は image の pull に数十秒かかる場合があります。

### 6. DB スキーマを適用

```bash
pnpm --filter @bulr/db push
```

### 7. アプリを起動

```bash
pnpm dev
```

---

## 動作確認

| サービス | URL |
|---|---|
| **web アプリ** | http://localhost:3000 |
| **DB（直接接続）** | `psql postgresql://bulr:dev_password@localhost:5433/bulr_dev` |

---

## DB コマンド早見表

| コマンド | 動作 |
|---|---|
| `pnpm db:up` | コンテナ起動（データ保持） |
| `pnpm db:down` | コンテナ停止（データ保持） |
| `pnpm db:reset` | データ削除してコンテナ再作成 |
| `pnpm --filter @bulr/db push` | スキーマをローカル DB に反映（履歴なし） |
| `pnpm --filter @bulr/db generate` | マイグレーション SQL を生成（本番向け） |

---

## クラウド DB（Neon）への切り替え

`DATABASE_URL` を Neon dev branch の接続文字列に変更するだけで切り替えられます。

```dotenv
# ローカル Docker
DATABASE_URL=postgresql://bulr:dev_password@localhost:5433/bulr_dev

# Neon dev branch に切り替える場合
DATABASE_URL=postgresql://<user>:<pass>@<host>-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

詳細は [`docs/setup/neon.md`](./neon.md) を参照してください。

---

## 関連ドキュメント

- [`docs/setup/README.md`](./README.md) — セットアップ手順インデックス
- [`docs/setup/neon.md`](./neon.md) — Neon DB のセットアップ
- [`docs/setup/env-vars.md`](./env-vars.md) — 環境変数一覧
