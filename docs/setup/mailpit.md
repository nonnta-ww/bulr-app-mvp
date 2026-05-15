# Mailpit — ローカルメール受信確認

ローカル開発環境でのメール送信テスト用ツール。Magic Link メールを実際の受信箱に送らずにキャプチャして確認できる。

---

## 概要

| 項目 | 内容 |
|---|---|
| ツール | [Mailpit](https://github.com/axllent/mailpit) |
| 用途 | ローカル SMTP サーバー + Web UI でメールをキャプチャ |
| SMTP ポート | 1026（ホスト側）→ 1025（コンテナ内） |
| Web UI | http://localhost:8026 |
| Docker イメージ | `axllent/mailpit:latest` |

> **ポート割り当てについて**: 複数プロジェクトで Mailpit を使用する際の競合を避けるため、本プロジェクトではホスト側ポートを 1026/8026 に設定しています（デフォルトの 1025/8025 は他プロジェクト用として空けてあります）。

---

## 動作の仕組み

`apps/web/lib/email/resend.ts` の `sendEmail()` 関数が送信先を切り替えます。

```
SMTP_HOST が設定されている場合  → nodemailer 経由で Mailpit (localhost:1026) に送信
SMTP_HOST が設定されていない場合 → Resend API で実際のメール送信
```

ローカルでは `.env.local` に `SMTP_HOST=localhost` が設定されているため、自動的に Mailpit 経由になります。Resend API キーは不要です。

---

## セットアップ

Docker Compose に組み込み済みのため、追加インストールは不要です。

```bash
pnpm db:up   # Mailpit + PostgreSQL を同時起動
```

---

## メール確認手順

1. `pnpm dev` でアプリを起動
2. `/sign-in` で自分のメールアドレスを入力して送信
3. http://localhost:8026 にアクセス → Magic Link メールが届いている
4. メール内の「サインイン」ボタンをクリックして認証フローを確認

---

## 環境変数

| 変数 | ローカル値 | 説明 |
|---|---|---|
| `SMTP_HOST` | `localhost` | 設定するとMailpit経由になる。Vercel には登録しない |
| `SMTP_PORT` | `1026` | ホスト側の SMTP ポート番号 |

これらは **ローカル専用**です。Vercel（Production / Preview）には登録しないでください。

---

## 関連ドキュメント

- [`docs/setup/local.md`](./local.md) — ローカル環境全体のセットアップ手順
- [`docs/setup/resend.md`](./resend.md) — 本番メール送信（Resend）のセットアップ
