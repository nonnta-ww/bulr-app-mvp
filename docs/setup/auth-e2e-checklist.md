# authentication 7.x — E2E 検証チェックリスト

> `.kiro/specs/authentication/tasks.md` の 7.1〜7.6 に対応する手動 E2E 検証手順。本ドキュメントは作業時の現場チェックリストとして使用する。
>
> 各シナリオが OK になり次第、対応する `tasks.md` のチェックボックスを `[x]` に更新する。

## 事前準備

```bash
# dev server を起動
pnpm --filter @bulr/web dev
```

`.env.local` に以下が設定されていることを確認:

- `DATABASE_URL` — ローカル Docker Postgres or Neon dev branch
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32` で生成済み
- `BETTER_AUTH_URL=http://localhost:3020`
- `NEXT_PUBLIC_APP_URL=http://localhost:3020`
- `RESEND_API_KEY` — テストドメイン用
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` — 管理画面用
- `ADMIN_ALLOWED_EMAILS` — 自分のメールアドレスを含むカンマ区切り

---

## 7.1 Magic Link サインイン E2E

- [ ] 一度サインアウトし、Cookie をクリア（DevTools → Application → Cookies）
- [ ] `http://localhost:3020/sign-in` で自分のメールを入力 → 送信
- [ ] Resend からメール受信
  - 件名: `[bulr] サインインリンク / Sign-in link`
  - 送信元: `bulr <onboarding@resend.dev>`
- [ ] メール内ボタンクリック → `/interviews` にリダイレクト
- [ ] ローカル DB を確認:

  ```bash
  psql $DATABASE_URL -c 'SELECT id, email FROM "user" ORDER BY "createdAt" DESC LIMIT 1;'
  psql $DATABASE_URL -c 'SELECT * FROM session ORDER BY "createdAt" DESC LIMIT 1;'
  psql $DATABASE_URL -c 'SELECT * FROM user_profile ORDER BY created_at DESC LIMIT 1;'
  ```

  3 レコード全て存在し、`user_profile.display_name` にメールローカル部が入っている

---

## 7.2 Magic Link 期限切れ・使い切り

- [ ] `/sign-in` から再度メール送信
- [ ] **16 分待ってから**メール内リンクをクリック → エラーページ表示（期限切れ）
- [ ] 別途新規送信 → クリックして成功 → 同じリンクを再度クリック → エラー表示（使い切り）

> **代替**: 16 分待てない場合は DB で `verification` テーブルの `expires_at` を手動で過去日時に書き換えてもよい。

---

## 7.3 Magic Link レート制限

- [ ] サインアウト状態で `/sign-in` から同じメールアドレスに**短時間で 4 回連続**送信を試みる
- [ ] 4 回目のフォーム submit で「短時間に複数回のリクエストがあったため...」エラー表示
- [ ] レート制限テーブルを確認:

  ```bash
  psql $DATABASE_URL -c "SELECT key, count, window_start FROM rate_limit WHERE key LIKE 'email:%' ORDER BY window_start DESC LIMIT 3;"
  ```

  該当キーの count が想定通り増えていること

---

## 7.4 proxy.ts UX リダイレクト + Basic 認証

- [ ] サインアウト状態（Cookie クリア）で `http://localhost:3020/interviews/foo` を訪問 → `/sign-in` リダイレクト
- [ ] `http://localhost:3020/admin/_health` を訪問 → ブラウザに Basic 認証ダイアログが表示される
- [ ] 不正なユーザー名/パスワードでキャンセル → 401 エラーページ（DevTools Network で `WWW-Authenticate` ヘッダー確認）
- [ ] 正しい credentials（`.env.local` の `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`）で pass through → 次のページが表示される

---

## 7.5 `/admin/_health` 3 ケース検証

`.env.local` の `ADMIN_ALLOWED_EMAILS` に自分のメールが含まれることを確認。

- [ ] **(a)** Basic 認証通過 + 未サインイン状態で `/admin/_health` → `/sign-in` リダイレクト
- [ ] **(b)** 一度 `ADMIN_ALLOWED_EMAILS` に**含まれない**別メールでサインイン → `/admin/_health` 訪問で「FORBIDDEN」表示

  > 代替: 環境変数を一時的に `ADMIN_ALLOWED_EMAILS=other@example.com` のように変更し dev server 再起動 → 自分のメールでサインイン → `/admin/_health` 訪問

- [ ] **(c)** `ADMIN_ALLOWED_EMAILS` に**含まれる**自分のメールでサインイン → `/admin/_health` 訪問で「OK: admin authenticated」+ メール表示

---

## 7.6 多層防御（CVE-2025-29927 シミュレーション）

- [ ] `apps/web/proxy.ts` を一時的に修正: `config.matcher = []`（空配列）にして proxy.ts を実質無効化
- [ ] dev server 再起動
- [ ] サインアウト状態で `/admin/_health` を訪問 → proxy.ts は飛ばされるが、Server Component の `requireAdmin()` が `UNAUTHORIZED` を throw → `/sign-in` リダイレクトされる
- [ ] **検証後、`apps/web/proxy.ts` を元の matcher に戻す**（必ず！）

---

## 完了報告フォーマット

```
7.1: OK / NG（補足）
7.2: OK / NG（補足）
7.3: OK / NG（補足）
7.4: OK / NG（補足）
7.5: OK / NG（補足）
7.6: OK / NG（補足）
```

NG があれば該当のみ未チェックのまま残し、別途修正タスクに分ける。
