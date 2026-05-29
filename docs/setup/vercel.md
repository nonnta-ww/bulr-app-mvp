# Vercel プロジェクトセットアップ（3 アプリ構成）

bulr-app-mvp を **3 つの独立した Vercel プロジェクト**として運用するための runbook。

| アプリ | Vercel プロジェクト | Custom Domain |
|---|---|---|
| candidate（受験者） | `bulr-mvp-candidate` | `bulr.net` |
| business（企業/面接官） | `bulr-mvp-business` | `bz.bulr.net` |
| admin（管理者） | `bulr-mvp-admin` | `admin.bulr.net` |

設計の背景は [`/.kiro/specs/multi-app-deployment/`](../../.kiro/specs/multi-app-deployment/) を参照。本ドキュメントは「再現可能な操作手順」に特化する。

---

## 前提

- Vercel Pro plan（商用利用と Team scope のため、Hobby 不可）
- GitHub リポジトリ `bulr-app-mvp` への connect 権限
- Cloudflare で `bulr.net` ゾーン管理権限
- Neon Postgres プロジェクトに **Production / Preview の 2 ブランチ**作成済み（[`neon.md`](./neon.md) 参照）
- `packages/auth/src/server.ts` に `resolveBaseUrl()` 実装済み（env > VERCEL_URL fallback）

---

## Step 1: Vercel 3 プロジェクトを新規作成

3 アプリ分（candidate / business / admin）を **同じリポジトリから別プロジェクトとして** import する。

### 1.1 共通設定

| 項目 | 値 |
|---|---|
| Source | GitHub `bulr-app-mvp` |
| Framework Preset | Next.js |
| Production Branch | `main` |
| Install Command | （Vercel 自動: pnpm-lock.yaml 検出） |
| Build Command | デフォルト（Vercel が Turborepo を自動検出） |
| Output Directory | デフォルト（`.next`） |
| Node.js Version | 24.x |

### 1.2 プロジェクト別設定

| 項目 | bulr-mvp-candidate | bulr-mvp-business | bulr-mvp-admin |
|---|---|---|---|
| Project Name | `bulr-mvp-candidate` | `bulr-mvp-business` | `bulr-mvp-admin` |
| **Root Directory** | `apps/candidate` | `apps/business` | `apps/admin` |

> ⚠️ **Root Directory に末尾スペースを絶対に入れない**。例: `apps/candidate ` のような trailing space があると `vercel --prod` が `The provided path does not exist` で失敗する。Vercel UI 側の表示ではスペースが見えないので、Settings → General で必ず実値を確認する。

### 1.3 確認

- 3 プロジェクトが Vercel ダッシュボードに表示される
- business プロジェクトの **Cron Jobs** に `audio-purge`（`0 18 * * *`）が自動登録されている（`apps/business/vercel.json` を Vercel が自動検出）
- candidate / admin の Cron Jobs は空

---

## Step 2: 環境変数を登録

### 2.1 登録ルール

| 表記 | 意味 |
|---|---|
| `*` | Production / Preview 両方に登録 |
| `P` | Production のみ（Preview は VERCEL_URL フォールバック等で動く） |
| `—` | 未登録 |

### 2.2 共有変数（3 プロジェクト共通）

| Variable | candidate | business | admin | 値 |
|---|---|---|---|---|
| `DATABASE_URL` | `*` | `*` | `*` | Production = Neon production branch（pooled） / Preview = Neon dev branch（pooled） |
| `BETTER_AUTH_SECRET` | `*` | `*` | `*` | `openssl rand -base64 32` を **3 回**生成（プロジェクトごとに別値、防御深化） |
| `ANTHROPIC_API_KEY` | `*` | `*` | `*` | Anthropic Console。3 プロジェクト同一値 |
| `RESEND_API_KEY` | `*` | `*` | `*` | Resend ダッシュボード。3 プロジェクト同一値 |

> `OPENAI_API_KEY` / `WHISPER_PROVIDER` は OpenAI キー取得後に business に追加（Wave 1 では deferred、本番では Whisper 機能が 500 を返すが他は正常）。

### 2.3 プロジェクト固有変数

| Variable | candidate | business | admin | 値 |
|---|---|---|---|---|
| `BETTER_AUTH_URL` | `P` `https://bulr.net` | `P` `https://bz.bulr.net` | `P` `https://admin.bulr.net` | Preview 未登録、`resolveBaseUrl()` が `VERCEL_URL` から組み立てる |
| `NEXT_PUBLIC_APP_URL` | `P` `https://bulr.net` | `P` `https://bz.bulr.net` | `P` `https://admin.bulr.net` | 同上 |
| `BLOB_STORAGE_PROVIDER` | — | `*` `vercel-blob` | — | ローカル開発のみ `local-fs` |
| `ADMIN_ALLOWED_EMAILS` | — | — | `*` | カンマ区切り CSV |
| `BUSINESS_BASE_URL` | — | — | `*` `https://bz.bulr.net` | Preview も Production 値固定（cross-app link 用） |

### 2.4 Vercel が自動付与する変数（登録不要）

| Variable | 付与契機 |
|---|---|
| `CRON_SECRET` | business で Cron 登録時に自動 inject |
| `BLOB_READ_WRITE_TOKEN` | business に Blob ストア接続時に自動 inject（Step 3.1） |
| `VERCEL_URL` / `VERCEL_ENV` | 全 deploy で自動付与 |

### 2.5 CLI 一括登録（任意）

UI 経由ではなく CLI で一気に登録する場合、以下のパターン:

```bash
# プロジェクトに link
cd apps/candidate && vercel link --yes --project bulr-mvp-candidate

# Production env を追加（非対話）
echo "$VALUE" | vercel env add KEY production --yes
# Preview env は git-branch を空文字で「全 Preview branches」を指定する必要あり
echo "$VALUE" | vercel env add KEY preview "" --yes
```

> `vercel env add KEY preview --yes` は CLI v54+ で `action_required: git_branch_required` を返す。空文字の git-branch を 3 番目の引数として渡すと「全 Preview branches」になる。

### 2.6 ⚠️ Turborepo env 列挙の必須対応

Vercel に env を登録しただけでは Turborepo がビルドプロセスから strip してしまう。**`turbo.json` の `build.env` に追加する env を必ず列挙する**。

```jsonc
// turbo.json
{
  "tasks": {
    "build": {
      "env": [
        "DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL",
        "NEXT_PUBLIC_APP_URL", "ANTHROPIC_API_KEY", "RESEND_API_KEY",
        "BLOB_STORAGE_PROVIDER", "BLOB_READ_WRITE_TOKEN",
        "ADMIN_ALLOWED_EMAILS", "BUSINESS_BASE_URL",
        "CRON_SECRET", "VERCEL_URL", "VERCEL_ENV"
        // 新 env 追加時はここにも追記する
      ]
    }
  }
}
```

未列挙の env は build 中に `undefined` になり、`Error: Failed to collect configuration for /_not-found: DATABASE_URL is not defined` のように Production ビルドが失敗する。Vercel build log の Turborepo Warning（"missing from turbo.json"）が出ていたらこれが原因。

---

## Step 3: Vercel Blob ストア接続（business のみ）

### 3.1 ストア作成 + business への自動 link

```bash
cd apps/business
vercel blob create-store bulr-audio \
  --access private \
  --yes \
  --environment production --environment preview
```

これで:
- `bulr-audio`（private、iad1 region）が作成される
- bulr-mvp-business プロジェクトに自動 link
- `BLOB_READ_WRITE_TOKEN` が Production / Preview 両方の env に自動 inject

> ⚠️ **`.env.local` 上書き注意**: `vercel blob create-store --yes` は実行時に暗黙の `vercel env pull` を走らせて `apps/business/.env.local` を Vercel 側の値で上書きする。ローカル dev 用の値（`BETTER_AUTH_URL=http://localhost:3021` 等）が失われるので、**事前に backup する**:
>
> ```bash
> cp apps/business/.env.local /tmp/business.env.local.bak
> vercel blob create-store ...   # 上書きされる
> /bin/cp /tmp/business.env.local.bak apps/business/.env.local   # 復元
> ```
>
> （zsh の `cp` は `-i` alias で interactive になるので `/bin/cp` を使う。）

### 3.2 確認

```bash
vercel blob list-stores --all
# bulr-audio が「Projects: bulr-mvp-business」で表示されればOK

vercel env ls | grep BLOB
# BLOB_READ_WRITE_TOKEN が Production / Preview に存在すればOK
```

---

## Step 4: Cloudflare DNS + Custom Domain

### 4.1 Vercel 側で Custom Domain 追加

```bash
cd apps/candidate && vercel domains add bulr.net
cd ../business   && vercel domains add bz.bulr.net
cd ../admin      && vercel domains add admin.bulr.net
```

> CLI v54+ では `vercel domains add <domain> <project>` の 2 引数形式は廃止。各アプリの `.vercel/` がある dir から 1 引数で実行する。

実行後、Vercel が DNS 設定要件を案内する（`A bulr.net 76.76.21.21` 等）。`vercel domains inspect <domain>` でも確認できる。

### 4.2 Cloudflare DNS レコード

Cloudflare ダッシュボード → `bulr.net` ゾーン → DNS → Records で追加:

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| **A** | `@` | `76.76.21.21` | **DNS only**（gray cloud） | Auto |
| **CNAME** | `bz` | `cname.vercel-dns.com` | **DNS only** | Auto |
| **CNAME** | `admin` | `cname.vercel-dns.com` | **DNS only** | Auto |

> ⚠️ **Proxy on（orange cloud）は禁止**。SSL ハンドシェイク失敗 / Vercel cert 発行不可 / 二重キャッシュなどが起きる。

### 4.3 Cloudflare SSL/TLS

- **SSL/TLS → Overview → Encryption mode = Full (strict)**

### 4.4 確認

```bash
# DNS 伝播
dig +short bulr.net A           # Vercel anycast IP が返る
dig +short bz.bulr.net CNAME    # cname.vercel-dns.com または <hash>.vercel-dns-*.com
dig +short admin.bulr.net CNAME

# Vercel が SSL 発行完了したか（数分〜数十分）
curl -sI https://bulr.net/sign-in      # HTTP 200
curl -sI https://bz.bulr.net/sign-in   # HTTP 200
curl -sI https://admin.bulr.net/sign-in  # HTTP 200
```

3 つすべて 200 で、`content-security-policy` ヘッダがアプリごとに異なる（business は `api.anthropic.com` 等を含む）ことを確認。

---

## Step 5: Production 動作検証

### 5.1 自動確認できる項目

| # | 項目 | 確認 |
|---|---|---|
| 1 | 3 ドメインの HTTP 200 | `curl -sI https://{bulr.net,bz.bulr.net,admin.bulr.net}/sign-in` |
| 2 | 3 プロジェクトの最新 deploy Ready | 各 app dir で `vercel ls \| head -4` |
| 3 | Cron が business にのみ登録 | `cd apps/business && vercel crons list`（`audio-purge`） + candidate / admin で空 |
| 4 | Cron auth 動作 | `curl -sI https://bz.bulr.net/api/cron/audio-purge` → 401 |

### 5.2 ブラウザ手動確認

| # | 項目 | 手順 |
|---|---|---|
| 5 | candidate Magic Link | `https://bulr.net/sign-in` でメール送信 → 受信メールの link が `https://bulr.net/...` を含む → クリックでサインイン完了 |
| 6 | business Magic Link | 同上、`https://bz.bulr.net/...` |
| 7 | admin Magic Link | 同上、`https://admin.bulr.net/...`（`ADMIN_ALLOWED_EMAILS` に含まれるメールのみ） |
| 8 | admin → business cross-app | admin でセッション詳細 → 「面接官向けレポートを別タブで開く」 → `https://bz.bulr.net/interviews/[id]/report` に到達 |
| 9 | Preview deploy | 任意の PR を作成 → GitHub Checks に 3 Preview URL → 各 URL `/sign-in` 200 → Preview からの Magic Link が Preview URL を指す（VERCEL_URL フォールバック） |

---

## Step 6: 旧プロジェクト廃止（該当する場合のみ）

Wave 1 移行時、旧 `bulr-app-mvp-web`（apps/web 単一構成）がある場合に実施。

```bash
# 旧プロジェクトに link → env を控え
cd /tmp && mkdir vercel-backup && cd vercel-backup
vercel link --project bulr-app-mvp-web
vercel env pull .env.old-project.backup
```

`.env.old-project*.backup` をローカル保管（`.gitignore` 済み）。新 3 プロジェクトで env 登録 + Production deploy 成功 + 動作検証完了したのちに、旧プロジェクトを **Settings → General → Delete Project** で削除。

> Amendment (2026-05-26): 旧プロジェクトが未デプロイ placeholder（Custom Domain も Blob ストアも紐づいていない）の場合、24-72h rollback 猶予は不要 → 新規 3 プロジェクト作成前に削除して構わない（クリーンスレート方式）。

---

## Troubleshooting

### Production deploy が失敗: `Error: ... DATABASE_URL is not defined`

Turborepo が env を strip している。Step 2.6 を参照して `turbo.json` の `build.env` に必要な env を追加。Vercel build log の `Warning - the following environment variables are set on your Vercel project, but missing from "turbo.json"` で見分けがつく。

### `vercel --prod` が `The provided path does not exist`

- **末尾スペース**: Settings → General → Root Directory に trailing space が無いか確認
- **CWD 間違い**: 各 app の `.vercel/` が `apps/<app>/.vercel/` にあれば、`apps/<app>` から `vercel --prod` を実行。リポジトリルートから実行する場合は `apps/<app>/.vercel/` を `./.vercel/` に一時 cp してから実行する

### `vercel --prod` が `File size limit exceeded (100 MB)`

CLI が `.turbo/cache/*.tar.zst` 等の大ファイルをアップロードしている。`.vercelignore` を repo root に置いて以下を除外:

```
node_modules
.next
.turbo
dist
.git
.kiro/
.claude/
.superpowers/
.vercel
```

### Custom Domain 追加で `Your project's latest production deployment has errored`

旧 Vercel project の deploy が失敗状態のまま。env 登録 + `turbo.json` 修正後に新しい Production deploy を成功させてから再試行（最も簡単な手段: `git push` で main または Production Branch にコミットを乗せて Vercel auto-deploy をトリガ）。

### SSL 証明書が発行されない

- **DNS 伝播待ち**: `dig` で正しい target を返すまで数分〜数十分待つ
- **Cloudflare proxy**: 必ず DNS only（gray cloud）。Proxy on だと cert 発行失敗
- **Cloudflare SSL モード**: Full (strict) であること
- **CAA レコード**: 旧 CAA レコードが `letsencrypt.org` を除外していると発行失敗。Cloudflare で確認

### Magic Link が Preview URL ではなく Production URL を含む

`BETTER_AUTH_URL` を Preview にも登録してしまっている。Preview から削除し、`resolveBaseUrl()` の `VERCEL_URL` フォールバックを使う前提に戻す（`packages/auth/src/server.ts`）。

### admin で `/sessions` が全員拒否される

`ADMIN_ALLOWED_EMAILS` が admin プロジェクトに未登録、または書式が不正（CSV 区切り、全角カンマ NG）。Vercel UI で確認して Production / Preview 両方に登録。
