# Vercel プロジェクトセットアップ

## 前提

- Vercel アカウント（Hobby プラン）
- GitHub リポジトリ `bulr-app-mvp` へのアクセス権

---

## 1. Vercel プロジェクト `bulr-web` 作成手順

### 1.1 リポジトリの Import

1. [Vercel Dashboard](https://vercel.com/dashboard) にログインする
2. **Add New... → Project** をクリックする
3. **Import Git Repository** セクションで GitHub を選択し、`bulr-app-mvp` リポジトリを選択して **Import** をクリックする

### 1.2 プロジェクト設定

Import 画面で以下の通り設定する。

| 項目 | 値 |
|------|-----|
| Project Name | `bulr-web` |
| Root Directory | `apps/web` |
| Framework Preset | Next.js |
| Install Command | `pnpm install` |
| Build Command | Vercel デフォルト（空欄のまま） |
| Output Directory | Next.js デフォルト（`.next`、空欄のまま） |

> **Root Directory の変更方法**
> 「Root Directory」フィールドの右にある **Edit** をクリックし、`apps/web` と入力して確定する。

### 1.3 デプロイの実行

設定を確認後、**Deploy** ボタンをクリックする。初回ビルドが完了すると Production URL が発行される。

---

## 2. 環境変数の登録

環境変数の一覧と説明は [`docs/setup/env-vars.md`](./env-vars.md) を参照すること。

### 2.1 登録手順

1. Vercel Dashboard で `bulr-web` プロジェクトを開く
2. **Settings → Environment Variables** に移動する
3. 各変数を以下のルールで登録する

### 2.2 Production / Preview の使い分け

| Environment | 用途 | 対象ブランチ |
|-------------|------|-------------|
| **Production** | 本番環境向けの値（本番 DB・本番 API キーなど） | `main` |
| **Preview** | PR プレビュー・ステージング向けの値 | `main` 以外の全ブランチ |
| **Development** | ローカル開発（`vercel env pull` で取得） | ローカル |

> - シークレット値（API キー等）は Vercel の **Sensitive** オプションを有効にして登録する。
> - Production と Preview で異なる値が必要な変数は、Environment を個別に選択して登録する。

---

## 3. GitHub 連携

Vercel と GitHub を連携すると、以下のデプロイが自動的にトリガーされる。

| イベント | デプロイ種別 | URL |
|----------|-------------|-----|
| `main` ブランチへの push | **Production デプロイ** | `https://bulr-web.vercel.app/` |
| Pull Request のオープン・更新 | **Preview デプロイ** | `https://bulr-web-<hash>.vercel.app/`（PR ごとにユニーク） |

### 3.1 連携の確認

- Pull Request を作成すると、GitHub の Checks 欄に Vercel ボットがコメントを投稿し、Preview URL が表示される。
- `main` へのマージ後は Vercel Dashboard の **Deployments** タブで Production デプロイのステータスを確認できる。

---

## 4. 完了確認

以下の手順でセットアップが正常に完了していることを確認する。

1. `main` ブランチに任意のコミットを push する
2. [Vercel Dashboard](https://vercel.com/dashboard) → `bulr-web` → **Deployments** を開く
3. 最新のデプロイが **Ready** ステータスになっていることを確認する
4. Production URL `https://bulr-web.vercel.app/` にアクセスし、HTTP 200 が返ることを確認する

```bash
# curl でステータスコードを確認する場合
curl -o /dev/null -s -w "%{http_code}\n" https://bulr-web.vercel.app/
# 期待値: 200
```
