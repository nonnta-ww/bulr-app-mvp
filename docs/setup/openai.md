# OpenAI セットアップ

タスク 2.6 — 音声文字起こしサービス（OpenAI Whisper API）の設定手順

---

## 概要

Bulr MVP では、ユーザーの音声録音を文字起こしするために **OpenAI Whisper API**（`whisper-1` モデル）を利用します。  
Whisper API は従量課金制のため、事前に Billing 情報の登録と使用量上限の設定が必要です。

---

## 1. アカウント作成・Billing 登録

1. [https://platform.openai.com/signup](https://platform.openai.com/signup) にアクセスし、アカウントを作成する
2. ログイン後、右上のアカウントメニューから **Billing** に移動する
3. **Add payment method** をクリックし、クレジットカード情報を登録する
4. 初回クレジット（無料枠）が付与されている場合でも、Whisper API の継続利用には支払い方法の登録が必要

---

## 2. API キー取得

1. [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) にアクセスする
2. **Create new secret key** をクリックする
3. キー名（例: `bulr-mvp-production`）を入力して作成する
4. 表示された API キーをコピーする（画面を閉じると再表示できないため必ず保存すること）

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 3. Whisper API の利用前提

| 項目 | 詳細 |
|------|------|
| 使用モデル | `whisper-1` |
| 対応フォーマット | mp3, mp4, mpeg, mpga, m4a, wav, webm |
| 最大ファイルサイズ | 25 MB / リクエスト |
| 料金 | $0.006 / 分（2024 年時点） |
| API エンドポイント | `POST https://api.openai.com/v1/audio/transcriptions` |

> **Stage 1 コスト試算:** 70 セッション × 平均 30 分音声 = 2,100 分 → 約 **$12.60**  
> バッファを含めると月額 **$20〜50** を見込んでください。

---

## 4. 使用量上限（Usage Limit）の設定

コスト超過を防ぐため、使用量上限を設定します。

1. [https://platform.openai.com/settings/organization/limits](https://platform.openai.com/settings/organization/limits) にアクセスする（**Settings** → **Limits**）
2. **Monthly budget** を設定する

| 設定項目 | 推奨値 |
|----------|--------|
| Monthly budget（上限） | $100 |
| Email notification threshold | $50 |

> Stage 1 の想定コスト（$20〜50）に対し、月 $50〜100 の上限設定を推奨します。上限に達すると API リクエストがブロックされるため、余裕を持った設定にしてください。

---

## 5. Vercel 環境変数の登録

Vercel プロジェクトに API キーを登録します。**Production** と **Preview** の両環境に設定してください。

1. [Vercel ダッシュボード](https://vercel.com) を開き、対象プロジェクトを選択する
2. **Settings** → **Environment Variables** に移動する
3. 以下の値を追加する

| 項目 | 値 |
|------|-----|
| Name | `OPENAI_API_KEY` |
| Value | `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`（取得したキー） |
| Environment | `Production` と `Preview` の両方にチェック |

4. **Save** をクリックして保存する

---

## 6. ローカル環境への設定

ローカル開発環境用に `.env.local` に追記します。

```bash
# .env.local
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> `.env.local` は `.gitignore` に含まれていることを確認してください。絶対にリポジトリにコミットしないでください。

---

## 7. 完了確認

以下のコマンドでテスト音声ファイルを文字起こしして動作確認します。

```bash
# テスト用の短い音声ファイルを用意（例: test.mp3）
curl -X POST https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F file="@test.mp3" \
  -F model="whisper-1" \
  -F language="ja"
```

レスポンスに `"text"` フィールドが含まれていれば成功です。

```json
{
  "text": "文字起こしされたテキストがここに表示されます。"
}
```

---

## 関連タスク

- タスク 2.5: Resend セットアップ → [resend.md](./resend.md)
- タスク 2.7: Anthropic セットアップ → [anthropic.md](./anthropic.md)
