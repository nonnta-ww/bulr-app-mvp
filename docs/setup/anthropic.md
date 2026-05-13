# Anthropic セットアップ

タスク 2.7 — AI 評価エンジン（Anthropic Claude API）の設定手順

---

## 概要

Bulr MVP では、セッション録音の評価・分析に **Anthropic Claude API**（`claude-sonnet-4-6` モデル）を利用します。  
Claude は音声文字起こし結果を基にプローブ分析・評価レポートを生成するコアコンポーネントです。  
従量課金制のため、事前に Billing 情報の登録と使用量上限の設定が必要です。

---

## 1. アカウント作成・Billing 登録

1. [https://console.anthropic.com](https://console.anthropic.com) にアクセスし、アカウントを作成する
2. ログイン後、左メニューの **Billing** に移動する
3. **Add payment method** をクリックし、クレジットカード情報を登録する
4. 初回クレジット（無料枠）が付与されている場合でも、継続利用には支払い方法の登録が必要

---

## 2. API キー取得

1. [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) にアクセスする（**Settings** → **API Keys**）
2. **Create Key** をクリックする
3. キー名（例: `bulr-mvp-production`）を入力して作成する
4. 表示された API キーをコピーする（画面を閉じると再表示できないため必ず保存すること）

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 3. Claude API の利用前提

| 項目 | 詳細 |
|------|------|
| 使用モデル | `claude-sonnet-4-6` |
| 主な用途 | セッション評価・プローブ分析・レポート生成 |
| 入力トークン料金 | $3.00 / 1M トークン（2025 年時点） |
| 出力トークン料金 | $15.00 / 1M トークン（2025 年時点） |
| API エンドポイント | `POST https://api.anthropic.com/v1/messages` |

> **Stage 1 コスト試算:** 70 セッション × プローブ分析・評価処理 → 月額 **$150〜300** を見込んでください。  
> コンテキスト長・プロンプト設計によって変動するため、初月は実使用量をモニタリングしてください。

---

## 4. 使用量上限（Usage Limit）の設定

コスト超過を防ぐため、使用量上限とアラートを設定します。

1. [https://console.anthropic.com/settings/limits](https://console.anthropic.com/settings/limits) にアクセスする（**Settings** → **Limits**）
2. 以下の設定を行う

| 設定項目 | 推奨値 | 説明 |
|----------|--------|------|
| Monthly spend limit（警告） | $300 | 月額 $300 で警告メール送信 |
| Monthly spend limit（停止） | $500 | 月額 $500 で API リクエストをブロック |

> Stage 1 の想定コスト（$150〜300）に対し、$300 で警告・$500 で停止の設定を推奨します。  
> 停止上限に達するとすべての API リクエストがブロックされるため、サービス継続性を考慮して余裕を持たせてください。

---

## 5. Vercel 環境変数の登録

Vercel プロジェクトに API キーを登録します。**Production** と **Preview** の両環境に設定してください。

1. [Vercel ダッシュボード](https://vercel.com) を開き、対象プロジェクトを選択する
2. **Settings** → **Environment Variables** に移動する
3. 以下の値を追加する

| 項目 | 値 |
|------|-----|
| Name | `ANTHROPIC_API_KEY` |
| Value | `sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`（取得したキー） |
| Environment | `Production` と `Preview` の両方にチェック |

4. **Save** をクリックして保存する

---

## 6. ローカル環境への設定

ローカル開発環境用に `.env.local` に追記します。

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> `.env.local` は `.gitignore` に含まれていることを確認してください。絶対にリポジトリにコミットしないでください。

---

## 7. 完了確認

以下のコマンドで Claude API への疎通を確認します。

```bash
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 64,
    "messages": [
      {
        "role": "user",
        "content": "セットアップの確認テストです。「設定完了」とだけ返答してください。"
      }
    ]
  }'
```

レスポンスに `"content"` フィールドが含まれていれば成功です。

```json
{
  "id": "msg_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "設定完了"
    }
  ],
  "model": "claude-sonnet-4-6",
  "stop_reason": "end_turn"
}
```

---

## 関連タスク

- タスク 2.5: Resend セットアップ → [resend.md](./resend.md)
- タスク 2.6: OpenAI セットアップ → [openai.md](./openai.md)
