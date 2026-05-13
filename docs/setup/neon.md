# Neon データベースセットアップ

Bulr MVP の multi-env-infrastructure spec に対応した Neon PostgreSQL のセットアップ手順です。

---

## 1. Neon プロジェクト作成（Free プラン）

1. [Neon Console](https://console.neon.tech/) にログインする
2. 「New Project」をクリックし、以下の設定でプロジェクトを作成する
   - **Project name**: `bulr`
   - **Region**: `Asia Pacific (Tokyo)` または `Asia Pacific (Osaka)`
   - **PostgreSQL version**: 16（デフォルト）
3. 作成すると `production` ブランチ（プライマリブランチ）が自動生成される

---

## 2. dev ブランチの作成

`production` ブランチから分岐した `dev` ブランチを作成する。

1. Neon Console でプロジェクト `bulr` を開く
2. 左メニューの **Branches** タブを選択する
3. 右上の「**Create branch**」ボタンをクリックする
4. 以下を設定して「Create branch」で確定する
   - **Branch name**: `dev`
   - **Parent branch**: `production`
   - **Include data up to**: そのまま（現在の HEAD）

これで `production` と `dev` の 2 ブランチ構成が完成する。

---

## 3. 各ブランチの DATABASE_URL 取得

ブランチごとに接続文字列（DATABASE_URL）を取得し、それぞれ対応する環境に登録する。

### 接続文字列の確認方法

1. Neon Console → **Branches** タブ → 対象ブランチを選択する
2. 右側の「**Connection Details**」パネルを開く
3. 「**Pooled connection**」を選択する（Vercel サーバーレス環境では Pooler 経由が推奨）
4. 表示された接続文字列をコピーする

### 登録先一覧

| ブランチ | 接続文字列の用途 | 登録先 |
|---|---|---|
| `production` | Vercel 本番環境 | Vercel → Settings → Environment Variables → **Production** の `DATABASE_URL` |
| `dev` | Vercel Preview 環境 | Vercel → Settings → Environment Variables → **Preview** の `DATABASE_URL` |
| `dev` | ローカル開発 | `.env.local` の `DATABASE_URL` |

---

## 4. 警告: ブランチと環境の対応を厳守すること

> **Production には `production` ブランチの URL のみ、Preview には `dev` ブランチの URL のみを登録する。**

誤ったブランチの URL を登録すると、本番データを開発環境から参照・更新するリスクが生じる。
Vercel の環境変数設定では「**Environment**」のチェックボックスを必ず確認し、意図しない環境への登録を防ぐこと。

---

## 5. drizzle-kit migrate（unpooled 接続）について

`drizzle-kit migrate` など DDL を実行するマイグレーションツールは、Pooler（PgBouncer）経由では動作しないことがある。その場合は **Direct（unpooled）接続文字列** を使用する。

- 「Connection Details」で「**Direct connection**」を選択し、接続文字列を取得する
- unpooled URL は **マイグレーション実行時のみ**使用し、アプリケーションコードには引き続き pooled URL を使用する
- Stage 1 ではまず pooled 接続から開始し、マイグレーションエラーが発生した時点で Owner が unpooled への切り替えを判断する

---

## 6. 完了確認

以下をすべて確認したら、セットアップ完了とみなす。

- [ ] Neon Console に `bulr` プロジェクトが作成されている
- [ ] `production` ブランチが存在する（自動作成）
- [ ] `dev` ブランチが `production` から分岐して存在する
- [ ] Vercel の **Production** 環境変数 `DATABASE_URL` に `production` ブランチの Pooled URL が設定されている
- [ ] Vercel の **Preview** 環境変数 `DATABASE_URL` に `dev` ブランチの Pooled URL が設定されている
- [ ] ローカルの `.env.local` の `DATABASE_URL` に `dev` ブランチの Pooled URL が設定されている
- [ ] アプリケーションがローカルで起動し、データベースへの接続が成功する
