# Vercel Blob セットアップ

対象タスク: task 2.8

---

## Vercel Blob ストア作成

1. Vercel ダッシュボードで `bulr-web` プロジェクトを開く
2. **Storage** タブをクリック
3. **"Create Database"** を選択し、**Blob** を選ぶ
4. Store Name に `bulr-audio` を入力して作成する（単一ストア）

> Vercel は Blob ストア作成後、`BLOB_READ_WRITE_TOKEN` を自動的にプロジェクトの環境変数（**Production / Preview 両方**）に追加する。手動での設定は不要。

---

## 利用前提（Stage 1）

- 無料枠（**1 GB / 月**）内での利用を前提とする
- 音声ファイルの保存期間は **30 日**
- 30 日を超えたファイルの自動削除は、後続の **assessment-engine spec** で実装する Cron ジョブ（`/api/cron/audio-purge`）が担う

---

## 完了確認方法

| 確認項目 | 確認箇所 |
|---|---|
| Blob ストア `bulr-audio` が作成されていること | Vercel ダッシュボード → `bulr-web` → Storage タブ |
| `BLOB_READ_WRITE_TOKEN` が Production に設定されていること | Vercel ダッシュボード → `bulr-web` → Settings → Environment Variables |
| `BLOB_READ_WRITE_TOKEN` が Preview に設定されていること | 同上（Environment の列で "Preview" にチェックが入っていること） |
