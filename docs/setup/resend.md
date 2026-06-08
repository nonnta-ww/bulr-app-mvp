# Resend セットアップ

タスク 2.5 — メール送信サービス（Resend）の設定手順

---

## 概要

Bulr MVP では、ユーザーへの通知メール（マジックリンク・アカウント確認など）の送信に **Resend** を利用します。  
Stage 1 では Resend のテストドメイン（`onboarding@resend.dev`）を送信元として使用します。

> ⚠️ **本番で実ユーザーにメールを送るには「ドメイン検証 + `EMAIL_FROM_ADDRESS` 設定」が必須です。**
> テストドメイン（`onboarding@resend.dev`）のままだと、**Resend アカウント所有者のメール以外への送信が 500 で失敗**します（magic link が届かずログイン不可）。手順は [§7 本番ドメイン検証（実ユーザー解放に必須）](#7-本番ドメイン検証実ユーザー解放に必須) を参照。

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

## 7. 本番ドメイン検証（実ユーザー解放に必須）

> **これが未対応だと、本番で「所有者以外のメールアドレス」へのマジックリンクが 500 になりログインできません。** 一般ユーザーに開放する前に必ず実施すること。

### 症状（このセクションが必要なサイン）

`/api/auth/sign-in/magic-link` が **500**。本番ログに以下が出る：

```
[Better Auth] Error: [resend] メール送信失敗:
You can only send testing emails to your own email address (xxx@example.com).
To send emails to other recipients, please verify a domain at resend.com/domains,
and change the `from` address to an email using this domain.
```

= **Resend がテストモード（ドメイン未検証）**で、アカウント所有者宛にしか送れていない。

### 仕組み（送信元アドレスの決まり方）

`packages/auth/src/email/resend.ts`:

```ts
export const FROM_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS ?? 'bulr <onboarding@resend.dev>';
```

- `EMAIL_FROM_ADDRESS` 未設定 → テストドメイン `onboarding@resend.dev`（所有者宛しか送れない）
- **検証済みドメインのアドレスを `EMAIL_FROM_ADDRESS` に設定**すれば、任意の受信者へ送れる

### 手順

**① Resend で送信ドメインを検証**
1. [resend.com/domains](https://resend.com/domains) → **Add Domain** で `bulr.net`（または送信専用に `send.bulr.net` 等のサブドメイン）を追加
2. 表示される DNS レコード（**SPF / DKIM**、任意で **DMARC**）を **Cloudflare（`bulr.net` ゾーン）** に登録
3. Resend 側のステータスが **Verified** になるまで待つ（DNS 伝播で数分〜）

**② `EMAIL_FROM_ADDRESS` を Vercel 本番 env に設定**
- 値の例：`bulr <noreply@bulr.net>`（①で検証したドメインのアドレスにすること）
- **3プロジェクト（`bulr-mvp-candidate` / `bulr-mvp-business` / `bulr-mvp-admin`）すべての Production**（必要なら Preview も）に設定。auth メールはどのアプリも `@bulr/auth` 経由なので3つとも必要。
- CLI 例：
  ```bash
  printf 'bulr <noreply@bulr.net>' | vercel env add EMAIL_FROM_ADDRESS production   # 各アプリ dir で
  ```

**③ 再デプロイ**（env 反映のため）
- 各プロジェクトを Redeploy（dashboard or `vercel --prod`）。

### 検証
- **所有者以外のメールアドレス**で本番ログイン → magic link が届けば成功。
- 失敗時は本番ログ（`vercel logs https://bulr.net --json`）の `[resend] メール送信失敗` 文面を確認。

### テスト用ワークアラウンド（ドメイン未検証でも確認したいとき）
- **Resend アカウント所有者のメール**でログインすればテストモードでも送信可能。DB / auth / session の動作確認はこれで切り分けられる（送れない＝ドメイン未検証が原因と確定）。

---

## 関連タスク

- タスク 2.6: OpenAI セットアップ → [openai.md](./openai.md)
- タスク 2.7: Anthropic セットアップ → [anthropic.md](./anthropic.md)
