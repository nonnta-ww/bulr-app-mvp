# Vercel Cron と CRON_SECRET セットアップ

対象タスク: task 2.9

---

## CRON_SECRET の生成

以下のコマンドで最低 32 バイトのランダム値を生成する。

```bash
openssl rand -base64 32
```

---

## 環境変数の登録

### Vercel（Production / Preview）

1. Vercel ダッシュボード → `bulr-web` → **Settings → Environment Variables**
2. 変数名 `CRON_SECRET`、値に生成した値を入力
3. **Production** と **Preview** の両方にチェックを入れて保存する

### ローカル

`.env.local` に以下を追記する。

```env
CRON_SECRET=<生成した値>
```

---

## vercel.json の Cron 定義

`vercel.json` に以下を追加することで Cron を定義する。

```json
{
  "crons": [
    {
      "path": "/api/cron/audio-purge",
      "schedule": "0 18 * * *"
    }
  ]
}
```

- スケジュール `0 18 * * *` は **UTC 18:00 = JST 03:00** に毎日実行される
- Vercel Cron が呼び出す際、**自動的に `Authorization: Bearer <CRON_SECRET>` ヘッダを付与する**
- route handler 側での `CRON_SECRET` 検証は **assessment-engine spec の責務**であり、本スペックでは実装しない

> **注記**: 本スペック完了時点では `/api/cron/audio-purge` の route handler は未実装のため、Cron 呼び出しは **404** になる。これは assessment-engine spec が完了するまでの一時状態として許容する。

---

## 完了確認方法

| 確認項目 | 確認箇所 |
|---|---|
| `CRON_SECRET` が Production に設定されていること | Vercel ダッシュボード → `bulr-web` → Settings → Environment Variables |
| `CRON_SECRET` が Preview に設定されていること | 同上（"Preview" にチェックが入っていること） |
| `CRON_SECRET` がローカルに設定されていること | `.env.local` を確認 |
| `vercel.json` に Cron 定義が記載されていること | リポジトリルートの `vercel.json` を確認 |
