# Resend セットアップ

タスク 2.5 — メール送信サービス（Resend）の設定手順

---

## 概要

Bulr MVP では、ユーザーへの通知メール（アカウント確認・パスワードリセットなど）の送信に **Resend** を利用します。  
Stage 1 では Resend のテストドメイン（`onboarding@resend.dev`）を送信元として使用します。カスタムドメイン認証は Stage 2 で対応します。

---

## 1. アカウント作成

1. [https://resend.com/signup](https://resend.com/signup) にアクセスし、メールアドレス・パスワードを入力してサインアップする
2. プランは **Free プラン** を選択（100 通/日、3,000 通/月まで無料）
3. メール認証リンクをクリックしてアカウントを有効化する

---

## 2. API キー取得

1. Resend ダッシュボードにログインし、左メニューの **API Keys** をクリックする
2. **Create API Key** ボタンをクリックする
3. キー名（例: `bulr-mvp-production`）を入力し、権限は **Full Access** を選択して作成する
4. 表示された API キーをコピーする（画面を閉じると再表示できないため必ず保存すること）

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 3. 送信元ドメインについて（Stage 1）

Stage 1 では、Resend が提供するテストドメインをそのまま使用します。

| 項目 | 値 |
|------|-----|
| 送信元アドレス | `onboarding@resend.dev` |
| カスタムドメイン設定 | Stage 2 で実施（DNS 認証が必要） |

> **注意:** Resend のテストドメインはデフォルトで利用可能ですが、受信者によってはスパムフォルダに入る場合があります。Stage 2 でカスタムドメイン（`noreply@bulr.app` など）を設定することを推奨します。

---

## 4. Vercel 環境変数の登録

Vercel プロジェクトに API キーを登録します。**Production** と **Preview** の両環境に設定してください。

1. [Vercel ダッシュボード](https://vercel.com) を開き、対象プロジェクトを選択する
2. **Settings** → **Environment Variables** に移動する
3. 以下の値を追加する

| 項目 | 値 |
|------|-----|
| Name | `RESEND_API_KEY` |
| Value | `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`（取得したキー） |
| Environment | `Production` と `Preview` の両方にチェック |

4. **Save** をクリックして保存する

---

## 5. ローカル環境への設定

ローカル開発環境用に `.env.local` に追記します。

```bash
# .env.local
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> `.env.local` は `.gitignore` に含まれていることを確認してください。絶対にリポジトリにコミットしないでください。

---

## 6. 完了確認

以下のコマンドでテストメールを送信して動作確認します。

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer $RESEND_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "onboarding@resend.dev",
    "to": ["your-email@example.com"],
    "subject": "Resend セットアップ確認",
    "html": "<p>Resend の設定が完了しました。</p>"
  }'
```

レスポンスに `"id"` フィールドが含まれていれば成功です。

```json
{
  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

---

## 関連タスク

- タスク 2.6: OpenAI セットアップ → [openai.md](./openai.md)
- タスク 2.7: Anthropic セットアップ → [anthropic.md](./anthropic.md)
