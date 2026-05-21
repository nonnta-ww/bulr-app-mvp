# 環境変数リファレンス

multi-env-infrastructure スペックに対応した環境変数の一覧と設定ガイドです。

---

## 変数一覧

| 変数名 | 用途 | 公開可否 | Vercel 登録先 | 値の取得元 |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL 接続文字列 | サーバー専用 | Production / Preview / Development (※要注意) | Neon コンソール → Connection String |
| `BETTER_AUTH_SECRET` | セッション署名・暗号化キー | サーバー専用 | Production / Preview / Development | `openssl rand -base64 32` で生成 |
| `BETTER_AUTH_URL` | BetterAuth のベース URL | サーバー専用 | Production / Preview / Development | デプロイ先 URL (例: `https://example.com`) |
| `RESEND_API_KEY` | メール送信 API キー | サーバー専用 | Production / Preview のみ（ローカルは Mailpit を使用） | Resend ダッシュボード → API Keys |
| `SMTP_HOST` | ローカル Mailpit SMTP ホスト | サーバー専用 | **登録しない**（ローカル専用） | `localhost` 固定 |
| `SMTP_PORT` | ローカル Mailpit SMTP ポート | サーバー専用 | **登録しない**（ローカル専用） | `1026`（bulr プロジェクト） |
| `NEXT_PUBLIC_APP_URL` | フロントエンドが参照するアプリ URL | **公開可** (クライアントに露出) | Production / Preview / Development | デプロイ先 URL (例: `https://example.com`) |
| `ANTHROPIC_API_KEY` | Claude API 認証キー | サーバー専用 | Production / Preview / Development | Anthropic Console → API Keys |
| `OPENAI_API_KEY` | OpenAI API 認証キー | サーバー専用 | Production / Preview / Development | OpenAI Platform → API Keys |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob ストレージ アクセストークン | サーバー専用 | Production / Preview / Development | Vercel ダッシュボード → Storage → Blob |
| `CRON_SECRET` | Vercel Cron ジョブ認証シークレット | サーバー専用 | Production / Preview / Development | `openssl rand -base64 32` で生成 |
| `ADMIN_ALLOWED_EMAILS` | 管理者として許可するメールアドレス (カンマ区切り) | サーバー専用 | Production / Preview / Development | 手動設定 (例: `admin@example.com`) |

---

## DATABASE_URL の設定に関する重要事項

> [!WARNING]
> **誤った DATABASE_URL の登録は本番データベースを破壊するリスクがあります。**
>
> - **Production 環境** には必ず Neon の **production ブランチ** の接続文字列を登録すること。
> - **Preview 環境** には必ず Neon の **dev ブランチ** (または専用の preview ブランチ) の接続文字列を登録すること。
>
> **誤って production URL を Preview に登録すると、Preview デプロイ時のマイグレーションや操作が本番 DB を直接破壊するリスクがあります。** Vercel の Environment 設定画面で "Production", "Preview", "Development" のチェックボックスを必ず確認してから保存してください。

### 環境別の接続文字列の分け方

```
Production  → Neon プロジェクト > Branches > main (または production)
Preview     → Neon プロジェクト > Branches > dev (または preview 専用ブランチ)
Development → Neon プロジェクト > Branches > dev (または各自のローカル DB)
```

---

## サーバー専用変数について

**`NEXT_PUBLIC_` プレフィックスを持たないすべての変数はサーバー専用です。**

これらの変数はクライアントサイドのバンドルに含まれず、ブラウザからアクセスできません。クライアントコンポーネントや `"use client"` スコープ内でこれらの変数を参照しないでください。参照するとビルドエラーまたは `undefined` になります。

| 区分 | 例 | 説明 |
|---|---|---|
| サーバー専用 | `DATABASE_URL`, `BETTER_AUTH_SECRET`, etc. | Next.js サーバーコンポーネント・Route Handler・Server Action でのみ使用可 |
| クライアント公開 | `NEXT_PUBLIC_APP_URL` | ブラウザにも露出するため、機密情報を含めないこと |

---

## 環境変数を追加する際のチェックリスト

環境変数を新たに追加する場合は、以下をすべて実施すること。

- [ ] Vercel ダッシュボードの Environment Variables に登録する (対象環境を正しく選択)
- [ ] ルートの `.env.example` を更新する (値はダミーまたは説明文にする)
- [ ] `apps/web/.env.local.example` を更新する (値はダミーまたは説明文にする)
- [ ] 追加した変数が `NEXT_PUBLIC_` を持つ場合、意図的にクライアント公開することをレビューで確認する
- [ ] CI/CD (GitHub Actions 等) で参照している場合は、対応する Secret/Variable も追加する
