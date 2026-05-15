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
DATABASE_URL=postgresql://bulr:dev_password@localhost:5434/bulr_dev
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

### 4. `.env.local` をシンボリックリンクに設定

Next.js と drizzle-kit はそれぞれ異なるディレクトリから環境変数を読み込みます。root の `.env.local` 1 ファイルで管理するため、以下の 2 つのシンボリックリンクを作成します。

```bash
# Next.js 用（apps/web が .env.local を読み込む）
ln -sf ../../.env.local apps/web/.env.local

# drizzle-kit 用（packages/db が .env を読み込む）
ln -sf ../../.env.local packages/db/.env
```

> `.env*.local` と `.env` はどちらも `.gitignore` で除外されるため、リポジトリにはコミットされません。  
> clone 直後に 1 回だけ実行すれば、以降は root の `.env.local` を編集するだけで両方に反映されます。

### 5. Docker コンテナを起動

```bash
pnpm db:up
```

PostgreSQL 17 と Mailpit が同時に起動します。初回は image の pull に数十秒かかる場合があります。

| サービス | ポート | 用途 |
|---|---|---|
| PostgreSQL 17 | 5434 | ローカル DB |
| Mailpit SMTP | 1026 | メール送信のキャプチャ |
| Mailpit Web UI | 8026 | 受信メールの確認（http://localhost:8026） |
| Whisper | 9000 | 音声テキスト化（ローカル） |

Magic Link など認証メールは Mailpit が自動でキャプチャします。Resend API キーはローカル開発では不要です。詳細は [`docs/setup/mailpit.md`](./mailpit.md) を参照してください。

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
| **web アプリ** | http://localhost:3020 |
| **Mailpit（メール受信確認）** | http://localhost:8026 |
| **DB（直接接続）** | `psql postgresql://bulr:dev_password@localhost:5434/bulr_dev` |

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
DATABASE_URL=postgresql://bulr:dev_password@localhost:5434/bulr_dev

# Neon dev branch に切り替える場合
DATABASE_URL=postgresql://<user>:<pass>@<host>-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

詳細は [`docs/setup/neon.md`](./neon.md) を参照してください。

---

## ローカル音声ストレージ

ローカル開発で `BLOB_READ_WRITE_TOKEN` が無い場合、ファイルシステムベースのストレージに切り替えられます。

```dotenv
# .env.local
BLOB_STORAGE_PROVIDER=local-fs
LOCAL_BLOB_DIR=./tmp/audio
```

`apps/web/` を作業ディレクトリとして `dev` 実行するため、相対パスは `apps/web/tmp/audio/` に解決されます。`tmp/` は `.gitignore` で除外済み。

Vercel Blob を使う場合は `BLOB_STORAGE_PROVIDER=vercel-blob`（または未設定）+ `BLOB_READ_WRITE_TOKEN=...` を設定。

---

## ローカル Whisper（音声テキスト化）

`OPENAI_API_KEY` を使わずに Docker 上の Whisper サービスへ音声テキスト化を任せられます。

```dotenv
# .env.local
WHISPER_PROVIDER=local-docker
WHISPER_LOCAL_ENDPOINT=http://localhost:9000
WHISPER_MODEL=small
```

`pnpm db:up` で起動する `whisper` サービス（ポート 9000）が transcribe リクエストを受け付けます。初回ターン処理はモデルダウンロード（small で約 500MB）のため数十秒かかる場合があります。2 回目以降はキャッシュ（`whisper_models` ボリューム）から読み込みます。

| モデル | サイズ | メモリ目安 | 日本語精度の目安 |
|---|---|---|---|
| tiny | 75MB | 1GB | 検証用途のみ |
| base | 150MB | 1GB | 簡易デモ |
| small | 500MB | 2-3GB | 個人開発・E2E（推奨） |
| medium | 1.5GB | 4-6GB | 精度重視 |
| large-v3 | 3GB | 8-10GB | 本番相当 |

OpenAI API を使う場合は `WHISPER_PROVIDER=openai`（または未設定）+ `OPENAI_API_KEY=...` を設定。

---

## 関連ドキュメント

- [`docs/setup/README.md`](./README.md) — セットアップ手順インデックス
- [`docs/setup/neon.md`](./neon.md) — Neon DB のセットアップ
- [`docs/setup/env-vars.md`](./env-vars.md) — 環境変数一覧
