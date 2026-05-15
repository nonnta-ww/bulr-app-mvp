# セットアップ手順インデックス

## 環境マッピング規約

本プロジェクトは **Stage 1 では 2 環境構成** を採用する。staging 環境は設けない。

| 環境名 | ホスティング | 用途 |
|--------|-------------|------|
| local | ローカル開発マシン | 開発・デバッグ |
| preview | Vercel Preview（Pull Request ごと自動生成） | レビュー・動作確認 |
| production | Vercel Production | 本番公開 |

> **注意:** staging 環境は Stage 1 のスコープ外である。必要に応じて Stage 2 以降で追加を検討する。

---

## ローカル開発環境セットアップ

Docker を使ったローカル開発環境の構築手順は [`./local.md`](./local.md) を参照してください。

---

## クラウドサービスセットアップ（Owner 手動実施前提）

すべての手順は **Owner が手動実施する**。本スペックでは自動化スクリプトを提供しない。

以下のチェックリストを上から順に実施すること。

- [ ] 1. Neon プロジェクト作成 + dev / production ブランチ作成 → [`./neon.md`](./neon.md)
- [ ] 2. Resend アカウント作成 + `RESEND_API_KEY` 取得 → [`./resend.md`](./resend.md)
- [ ] 3. OpenAI アカウント作成 + `OPENAI_API_KEY` 取得 → [`./openai.md`](./openai.md)
- [ ] 4. Anthropic アカウント作成 + `ANTHROPIC_API_KEY` 取得 → [`./anthropic.md`](./anthropic.md)
- [ ] 5. Vercel プロジェクト `bulr-web` 作成 → [`./vercel.md`](./vercel.md)
- [ ] 6. Vercel Blob ストア `bulr-audio` 作成 → [`./vercel-blob.md`](./vercel-blob.md)
- [ ] 7. `CRON_SECRET` 生成 + Vercel 登録 → [`./cron.md`](./cron.md)
- [ ] 8. すべての環境変数を Vercel に登録 → [`./env-vars.md`](./env-vars.md)
- [ ] 9. CI 動作確認 → [`./ci.md`](./ci.md)
- [ ] 10. drizzle-kit 初回 push（初回スキーマ確定は後続 spec） → [`./drizzle-kit.md`](./drizzle-kit.md)

---

## サブドキュメント一覧

| ドキュメント | 内容 |
|-------------|------|
| [`./neon.md`](./neon.md) | Neon PostgreSQL プロジェクトおよびブランチのセットアップ手順 |
| [`./mailpit.md`](./mailpit.md) | ローカル開発用メールキャプチャツール（Mailpit）の概要と使い方 |
| [`./resend.md`](./resend.md) | Resend メール配信サービスのアカウント作成と API キー取得手順 |
| [`./openai.md`](./openai.md) | OpenAI アカウント作成と API キー取得手順 |
| [`./anthropic.md`](./anthropic.md) | Anthropic アカウント作成と API キー取得手順 |
| [`./vercel.md`](./vercel.md) | Vercel プロジェクト `bulr-web` の作成と設定手順 |
| [`./vercel-blob.md`](./vercel-blob.md) | Vercel Blob ストア `bulr-audio` の作成手順 |
| [`./cron.md`](./cron.md) | `CRON_SECRET` の生成および Vercel への登録手順 |
| [`./env-vars.md`](./env-vars.md) | Vercel 環境変数の一覧と登録手順 |
| [`./ci.md`](./ci.md) | GitHub Actions CI パイプラインの動作確認手順 |
| [`./drizzle-kit.md`](./drizzle-kit.md) | drizzle-kit を使用した初回スキーマ push 手順 |
