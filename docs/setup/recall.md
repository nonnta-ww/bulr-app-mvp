# Recall.ai セットアップ

リアルタイム面接キャプチャ（spec: `realtime-interview-capture`）で使う **Recall.ai** ボット連携の設定手順。**apps/business 専用**。

---

## 概要

bulr business のオンライン面接キャプチャは、Recall.ai のミーティングボットが Zoom / Google Meet / Microsoft Teams に参加し、ライブトランスクリプトを webhook で受け取る構成です。

連携は **REST API を直接呼び出す方式**で実装されており（[`apps/business/lib/capture/recall-client.ts`](../../apps/business/lib/capture/recall-client.ts)）、ボットの設定（録音・転写プロバイダ・webhook 宛先）はすべて `createBot` の API リクエスト内で都度指定します。そのため **Recall ダッシュボードで事前設定が必須なのは Webhooks の1本だけ**です。

### ダッシュボードメニュー別の要否

| メニュー | 要否 | 理由 |
|---|---|---|
| **API Keys** | ✅ 必要 | `RECALL_API_KEY` を取得 |
| **Webhooks** | ✅ 必要 | status webhook を1本登録し、Signing Secret を取得（後述 §3） |
| **transcript** | △ 確認のみ | プロバイダはコードが API で指定（既定 `deepgram_streaming`、Recall 経由課金）。アカウントで利用可能か確認するだけ |
| **bot-setup** | ❌ 不要 | ボット設定は `createBot` の API ペイロードで都度指定 |
| **calendar integration** | ❌ 不要 | カレンダー/ATS 連携は Non-Goal（将来 spec）。会議 URL は面接官が UI で手入力 |
| **Desktop Recording SDK** | ❌ 不要 | オンライン＝サーバー側ボット、対面＝ブラウザの MediaRecorder。Desktop SDK は不使用 |

---

## 1. API キー取得

1. [https://www.recall.ai/](https://www.recall.ai/) → Dashboard にログイン
2. **API Keys** → キーを発行してコピー
3. リージョンを確認（API ベース URL とダッシュボードのリージョンは一致させること）

```
RECALL_API_KEY=your-recall-api-key-here
```

---

## 2. 環境変数一覧（apps/business）

すべて `turbo.json` の `build.env` に登録済み。値を Vercel（Production / Preview）と `.env.local` に設定します。

| 変数 | 用途 | 値 / 取得元 |
|---|---|---|
| `RECALL_API_KEY` | ボット参加・退出・録音取得 | Dashboard → API Keys |
| `RECALL_API_BASE_URL` | リージョン別 API **ホスト** | `https://us-west-2.recall.ai`（**末尾に `/api/v1` を付けない** — §5 参照） |
| `RECALL_WEBHOOK_SECRET` | status webhook の Svix 署名検証 **＋** transcript webhook の URL トークン HMAC（**1本で兼用**） | Dashboard → Webhooks → Signing Secret（`whsec_...`） |
| `CAPTURE_TRANSCRIPT_PROVIDER` | STT プロバイダ | `deepgram_streaming`（既定。Recall 経由課金なので別途契約不要） |
| `BUSINESS_BASE_URL` | transcript webhook URL 構築用（サーバー専用） | 本番 URL 例: `https://bz.bulr.net` |
| `NEXT_PUBLIC_APP_URL` | `BUSINESS_BASE_URL` 未設定時のフォールバック | 同上 |

> `RECALL_WEBHOOK_SECRET` は [`recall-webhook-verify.ts`](../../apps/business/lib/capture/recall-webhook-verify.ts) で2役を担います。①status webhook の Svix 署名検証、②transcript webhook URL に埋め込むトークンの HMAC キー。Webhooks の Signing Secret を1つ設定すれば両方が動きます。

---

## 3. Webhooks の登録（ダッシュボードでの唯一の手作業）

Recall は status webhook を **Svix** 経由で配信します。これだけはダッシュボードでエンドポイント登録が必要です。

1. Dashboard → **Webhooks** → エンドポイントを追加
2. **Endpoint URL**（status webhook）:
   ```
   https://bz.bulr.net/api/webhooks/recall
   ```
   （`BUSINESS_BASE_URL` のホストに `/api/webhooks/recall` を付けたもの）
3. **購読イベント（4つ）** — [`route.ts`](../../apps/business/app/api/webhooks/recall/route.ts) の `SUBSCRIBED_EVENTS` と一致させる:
   - `bot.in_call_recording` → `recording` へ遷移
   - `bot.call_ended` → 終了処理（finalize）起動
   - `bot.done` → 終了処理（finalize）起動
   - `bot.fatal` → `failed` へ遷移
4. 表示される **Signing Secret（`whsec_...`）** を `RECALL_WEBHOOK_SECRET` に設定

### transcript webhook はダッシュボード登録不要

リアルタイムトランスクリプト用の `/api/webhooks/recall/transcript` は、`createBot` 時に `realtime_endpoints` へ**実行時に動的生成した URL** を渡します（[`start-capture.ts`](<../../apps/business/app/(interviewer)/interviews/[sessionId]/_actions/start-capture.ts>)）。ダッシュボードでの登録は不要です。

URL 形式（自動生成）:
```
https://bz.bulr.net/api/webhooks/recall/transcript?token=<sessionId>.<hmac>
```
`token` はセッション単位の HMAC で、DB ルックアップなしに検証されます。

---

## 4. ローカル開発時の注意（トンネル必須）

webhook は Recall → 自サーバーへの **inbound** 通信です。`BUSINESS_BASE_URL` は**公開到達可能な HTTPS** である必要があります。

ローカルで実機確認する場合:
1. ngrok 等でトンネルを立てる（例: `ngrok http 3000`）
2. 払い出された HTTPS URL を `BUSINESS_BASE_URL` に設定
3. 同じ URL + `/api/webhooks/recall` を Recall ダッシュボードの Endpoint URL にも登録

> トンネルなしのローカルでは status / transcript webhook が一切届かず、ボットが会議に参加してもキャプチャ状態が `bot_joining` から進みません。

---

## 5. ⚠️ `RECALL_API_BASE_URL` は「ホストのみ」

`RECALL_API_BASE_URL` には **`/api/v1` を含めない**でください。コード側（[`recall-client.ts`](../../apps/business/lib/capture/recall-client.ts)）が `${baseUrl}/api/v1/bot/` のようにパスを付与します。

| | 値 | 結果 |
|---|---|---|
| ✅ 正 | `https://us-west-2.recall.ai` | `.../api/v1/bot/` |
| ❌ 誤 | `https://us-west-2.recall.ai/api/v1` | `.../api/v1/api/v1/bot/` → **404 でボット作成失敗** |

---

## 6. 完了確認

1. API キーの疎通（ホストのみの URL を使うこと）:
   ```bash
   curl -s -H "Authorization: Token $RECALL_API_KEY" \
     "$RECALL_API_BASE_URL/api/v1/bot/?limit=1"
   ```
   `200` で JSON が返れば API キー・ベース URL は OK。
2. Webhook 疎通: 実セッションで会議 URL を入力してキャプチャ開始 → ボットが会議に参加し、capture_status が `bot_joining → recording` に進めば status webhook が届いている。
3. ライブ転写が画面に出れば transcript webhook（URL トークン）も OK。
4. 失敗時は Vercel ログ（`[webhook/recall]` プレフィックス）で署名検証失敗・遷移拒否を確認。

---

## 関連

- spec: `.kiro/specs/realtime-interview-capture/`（design.md / research.md に方式選定の根拠）
- 実装: `apps/business/lib/capture/`、`apps/business/app/api/webhooks/recall/`
