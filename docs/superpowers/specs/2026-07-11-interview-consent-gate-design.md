# 設計メモ — interview-consent-gate（Wave 7 本番投入 gate）

- 日付: 2026-07-11
- ステータス: brainstorming 合意済み（spec 化前の設計メモ）
- 想定 spec 名: `interview-consent-gate`
- 位置づけ: Wave 6+ の「次の1手」= #1 Wave 7 本番投入（Recall）のうち、**唯一の spec 相当コードスライス**。env 実キー接続と遅延実測は ops として spec 外で進める。

## 背景と意思決定の経緯

### Wave 6+ 発散の結論

Wave 6+ 保留候補（スカウト/L3年収査定/マッチング/模擬面接の音声対応/マルチテナント本格化）を〈事業インパクト × 実装コスト × 前提充足〉で発散した結果、候補は3つの塊に分かれた。

- **時期尚早クラスタ**（スカウト/マッチング/L3査定/マルチテナント）: いずれも「候補者プール・実データ・有料企業の実需」を共通のブロッカーとして持ち、検証で実データが溜まる前に着手すると砂上の楼閣。今回は全て見送り。
- **built を validated に変える**（Wave 7 本番投入・対面パス先行・セルフサーブ企業オンボーディング）: bulr 最大の未解決リスク「作ったが一度も実世界で回っていない」を潰す系統。特に Wave 7 は収益の背骨なのに実面接ゼロ。
- **積んだ資産を"払う側"に見せる**（候補者パスポート）: 既存資産再利用でインパクト/コスト比は最良だが、収益は間接。

次の1手として **#1 Wave 7 本番投入（Recall）** を選択。

### 対面パスを主役にしない判断（Recall 採用の根拠）

対面パス（`mic_chunk`）は端末マイク1本の連続録音を Whisper に流すのみで、**話者分離を行っていない**（`transcript_segment.speaker_role='unknown'`, [apps/business/app/api/interview/capture/chunks/route.ts](../../../apps/business/app/api/interview/capture/chunks/route.ts)）。話者の帰属は `splitInterviewerCandidate`（[packages/ai/src/functions/split-interviewer-candidate.ts](../../../packages/ai/src/functions/split-interviewer-candidate.ts)）が**テキスト内容から LLM で事後推測**するもので、音響的な話者分離ではない。

bulr の評価は「候補者発話の真贋・判断力」を測るのが核であり、話者帰属が曖昧だと評価の根が揺らぐ。対面パスを Recall 並みにするには話者分離対応 STT（Deepgram diarization 等）の自前組み込み ＝「Recall のようなものを作る」に帰着するため、割に合わない。よって **Recall を本番検証の主役**とし、対面パスは Recall が使えない対面向けの劣化フォールバックとして温存する。

### #1 の内訳と spec スライスの切り出し

| #1 の内訳 | 種別 | spec 要否 |
|---|---|---|
| Recall 実キー接続（`RECALL_API_KEY` 等） | ops/env | 不要 |
| 実面接での遅延実測（research.md 実値更新） | ops/検証 | 不要 |
| **consent ゲートの実装（明示同意モデル化）** | **コード** | **spec 相当（本メモの対象）** |
| 実運用で発覚する堅牢化 | コード | 走らせるまで未知 |

## 解く問題：consent ゲートが vacuous な理由

ゲート自体はコードに存在する（[apps/business/app/(interviewer)/interviews/[sessionId]/_actions/start-capture.ts:113](../../../apps/business/app/(interviewer)/interviews/[sessionId]/_actions/start-capture.ts)）:

```ts
if (sess.consent_obtained_at === null) { /* 開始拒否 CONSENT_REQUIRED */ }
```

しかしスキーマ（[packages/db/src/schema/interview-session.ts:41](../../../packages/db/src/schema/interview-session.ts)）が:

```ts
consent_obtained_at: timestamp('consent_obtained_at', { withTimezone: true }).notNull().defaultNow()
consent_version:     text('consent_version').notNull().default('ja-v1')
```

`notNull().defaultNow()` により行作成時に必ず `now()` が入り、`consent_obtained_at` は決して null にならない。よって `=== null` 分岐は**到達不能なデッドコード**で、全セッションが作成と同時に「同意済み」となり、実際には候補者から誰も同意を取っていない。これが Req 1.6 / Req 7.5 を骨抜きにしている vacuous の正体。

## 同意モデルの決定：案C・ハイブリッド

**機構は面接官アテステーションで今実装し、consent 記録スキーマは候補者セルフ同意を後付けできる形に設計する。**

- 面接官アテステーション＝面接官が「候補者から録音同意を口頭で得た」を明示チェックし、時刻・同意文版・アテスター識別を記録。業界標準（BrightHire/Metaview も口頭同意＋録音告知が基本）であり、Stage 1 MVP の「同意取得済みチェック」の正統進化。MVP 最小・外部依存なし。
- ハイブリッドの肝＝`consent_method` enum と `consent_actor_id` により、将来 `candidate_self_service`（候補者本人がリンクで同意）を enum 追加＋動線追加のみで載せられる形にしておく。今回は候補者セルフ同意の動線は作らない。

却下：案A のみ（拡張フックを持たず後で作り直し）、案B 単独（候補者側フロー・トークン・entry 連携でコスト高、MVP 逸脱）。

## 設計

### スコープ

**スコープ内**
- 同意を「既定値」から「意図的な行為」へ（スキーマ migration）
- 面接官アテステーションによる同意取得アクション＋UI
- versioned な同意文（ja-v1）の実体と提示
- 既存ゲート（`start-capture`）を到達可能・有効化
- consent 記録を候補者セルフ同意を後付けできる形に設計

**非ゴール**
- 候補者セルフ同意フローの実装（案B）— スキーマは受け入れ可能にするが動線は作らない
- 同意の撤回/取り消しフロー
- 削除請求対応（データオーナーシップ、別）
- 同意文の法務レビュー（product/legal タスク、コード外）
- ja-v1 以外の多言語版の起稿（版管理の器は作るが中身は ja-v1 のみ）

### データモデル（migration）

| 列 | 変更 | 意味 |
|---|---|---|
| `consent_obtained_at` | **nullable ＋ default 撤去** | null = 未同意。ゲートが初めて意味を持つ |
| `consent_version` | 同意行為時にスナップショット（既定 `ja-v1` は維持可） | 同意した同意文の版 |
| `consent_method`（新・enum, nullable） | 値 `'interviewer_attestation'`。将来 `'candidate_self_service'` を追加可 | 取得方法 |
| `consent_actor_id`（新・text, nullable） | アテストした面接官ID（将来は候補者ID） | provenance の拡張フック |

- **既存行の扱い**: 実同意は1件も存在しないため、migration で既存セッションの `consent_obtained_at` を null に落とす（全て未同意へ）。テストデータのみなので破壊的でなく、むしろ正しい状態。
- **session 作成（session-from-entry）**: default 撤去後は consent 列に触れず null のままにする＝作成直後は未同意。実装時に作成コードが consent 列を明示書き込みしていないか要確認。

### 同意取得フローとゲート

```
entry → session作成（consent=null）
   → [同意ステップ] 面接官が同意文(ja-v1)を確認＋「候補者から録音同意を口頭で得た」を明示チェック＋確定
        → recordConsent(sessionId, version) Server Action
             sets: obtained_at=now, version, method='interviewer_attestation', actor_id=面接官ID
   → capture開始（既存ゲート if consent_obtained_at===null で拒否 ← いま到達可能に）
```

- 新 Server Action `recordConsent`: `requireSessionOwnership` → 4列を原子的に set。冪等（既に同意済みなら no-op で ok）。
- UI: `capture-start-panel` の `consentObtained` prop（既存）を実状態へ配線。未同意なら開始ボタン群を disable し、同意ステップ（同意文表示＋チェック＋確定）を前置。
- ゲート本体（`start-capture.ts`）は**無改修で有効化**される（null 分岐が初めて到達可能に）。

### 同意文（versioned document）

- ja-v1 の同意文実体を **apps/business にアプリローカル**で持つ（ブランド/文面は package でなく app 側＝依存方向の原則に整合）。版→ドキュメントの registry を置き、UI が現行版を描画。
- 内容の要素: 録音対象・利用目的・保持期間（音声30日自動削除は既存 cron と整合）・データの扱い・（将来）削除請求窓口。**文言の法務確定はコード外タスク**として明示。

### エラー処理・テスト・境界

- 未同意で capture 開始 → `CONSENT_REQUIRED`（既存）を UI が同意ステップへ誘導。
- `recordConsent` の非所有セッション → 403。再同意 → 冪等。
- テスト: ゲート到達性（null→拒否／set→許可）、`recordConsent`（set・所有権・冪等）、migration（既存行 null 化）、パネルの disable/同意文表示。
- **再検証トリガー**: interview-session スキーマに consent 列追加 → session-from-entry / entry 作成の consent 非書き込みを確認。`consent_obtained_at` を読む箇所は現状ゲートのみ（null 対応済み）。

## 次のステップ

本メモ合意後、`/kiro-discovery` で brief/roadmap を起こし spec 化へ進む（いきなり実装しない）。ops 側（Recall 実キー接続・実面接遅延実測）は spec 外で並行。
