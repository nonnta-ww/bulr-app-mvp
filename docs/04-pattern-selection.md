# 質問選定の仕様

セッション作成時にどの評価パターンを何個出題するか、各ターンで次の質問候補がどう生成されるかをまとめる。

## 全体像

質問の決定は **2 段階** に分かれる。

| 段階 | 担当 | 何を決めるか | 実装 |
|---|---|---|---|
| 1. パターン選定 | 純関数（決定論的） | セッションで扱う評価パターン 8〜12 個 | `selectPlannedPatterns` |
| 2. 質問文生成 | LLM（Claude Sonnet 4.6） | 各ターンの次の質問候補 3 つ | `proposeNextQuestions` |

経歴サマリー（`backgroundSummary`）はキーワードマッチで段階 1 のカテゴリ配分に影響するのみ。具体的なパターン選択や質問文の生成内容には直接の影響はない。

---

## 段階 1: パターン選定（セッション作成時）

**実装**: `apps/web/lib/queries/select-planned-patterns.ts`
**呼び出し元**: `apps/web/lib/actions/create-session.ts`
**保存先**: `interview_session.planned_pattern_codes`（`string[]`）

### 定数

| 定数 | 値 | 意味 |
|---|---|---|
| `MIN_PATTERNS` | 8 | 1 セッションで選定するパターンの下限 |
| `MAX_PATTERNS` | 12 | 1 セッションで選定するパターンの上限 |

### カテゴリと既定配分

全 6 カテゴリで合計 10 件をデフォルト配分する。

| カテゴリ | 既定本数 |
|---|---|
| `design` | 3 |
| `trouble` | 2 |
| `performance` | 1 |
| `security` | 1 |
| `organization` | 1 |
| `ai` | 2 |

### キーワードブースト辞書

`backgroundSummary` を `toLowerCase()` した文字列に対して `includes()` で部分一致判定する。ヒット数に応じて該当カテゴリのスコアが加算される。

| カテゴリ | 主要キーワード |
|---|---|
| **ai** | `llm`, `gpt`, `chatgpt`, `claude`, `gemini`, `openai`, `anthropic`, `ai`, `ml`, `機械学習`, `人工知能`, `rag`, `embedding`, `ベクトル`, `エージェント`, `agent`, `プロンプト`, `prompt`, `fine-tuning`, `ファインチューニング`, `生成ai`, `生成 ai` |
| **performance** | `パフォーマンス`, `performance`, `高負荷`, `スケール`, `scaling`, `キャッシュ`, `cache`, `レイテンシ`, `latency`, `スループット`, `throughput`, `ボトルネック`, `bottleneck`, `p99`, `p999`, `負荷試験`, `大量データ`, `バッチ`, `クエリ最適化`, `インデックス` |
| **security** | `セキュリティ`, `security`, `脆弱性`, `vulnerability`, `認証`, `auth`, `認可`, `authorization`, `個人情報`, `pii`, `暗号化`, `encryption`, `コンプライアンス`, `compliance`, `gdpr`, `障害対応`, `インシデント`, `クレデンシャル`, `credential`, `アクセス制御` |
| **organization** | `チームリード`, `tech lead`, `テックリード`, `マネージャー`, `manager`, `メンバー育成`, `採用`, `面接`, `オンボーディング`, `onboarding`, `コードレビュー`, `開発プロセス`, `アジャイル`, `スクラム`, `scrum`, `合意形成`, `要件定義`, `組織`, `organization`, `リファクタリング` |
| **trouble** | `障害`, `incident`, `outage`, `デバッグ`, `debug`, `トラブル`, `ポストモーテム`, `postmortem`, `本番`, `production`, `復旧`, `メモリリーク`, `memory leak`, `不整合`, `データ破損` |
| **design** | `アーキテクチャ`, `architecture`, `マイクロサービス`, `microservice`, `モノリス`, `monolith`, `api設計`, `api design`, `スキーマ設計`, `ドメイン設計`, `ddd`, `マルチテナント`, `multitenant`, `非同期`, `async`, `メッセージキュー`, `kafka`, `rabbitmq` |

### 配分決定アルゴリズム

1. **デフォルト配分から開始**: `CATEGORY_DEFAULT_COUNTS` をコピー
2. **キーワードブースト**: スコアが高いカテゴリから順に、他カテゴリ（2 件以上残っているもの）から 1 件を移して +1 する
3. **`ai` カテゴリ最低 1 件保証**: もし 0 件になっていれば 1 件確保する（他から 1 件移す）
4. **合計を 8〜12 件に収める**
   - 合計が `MIN_PATTERNS` 未満 → 不足分を `design` に追加
   - 合計が `MAX_PATTERNS` 超過 → 末尾カテゴリから順に削減（最低 1 件は残す）

### パターンの具体的な選択

カテゴリごとの配分本数が決まったら、`assessment_pattern` テーブルから以下の条件で取得する。

```ts
patterns
  .filter((p) => p.category === category && p.is_active)
  .slice(0, count)
  .map((p) => p.code);
```

つまり **同カテゴリ内ではシードデータの先頭から本数分** を取る。ランダム性はない。

### フォールバック

最終的な選定件数が `MIN_PATTERNS` を下回った場合、残りの有効パターン（既に選ばれていないもの）で補充する。それでも超過した場合は `MAX_PATTERNS` でトリムする。

### 特徴

- **決定論的**: 同じ入力なら必ず同じ結果になる
- **LLM 非依存**: 純関数のみ
- **文脈は読まない**: キーワード部分一致のみ、否定文や類義語は考慮しない

---

## 段階 2: 質問文生成（各ターン後）

**実装**: `packages/ai/src/functions/propose-next-questions.ts`
**呼び出し元**:
- `apps/web/app/api/interview/turns/next/route.ts`（ターン完了時の Prepare フェーズ）
- `apps/web/app/api/interview/proposal/regenerate/route.ts`（候補再生成エンドポイント）
**保存先**: `question_proposal` テーブル

### 出力スキーマ

```ts
{
  candidates: [
    { text: string; intent: 'deep_dive' | 'meta_cognition' | 'next_pattern'; pattern_id?: string },
    // ... 必ず 3 つ ...
  ]
}
```

### 制約（Zod スキーマで強制）

| 制約 | 値 |
|---|---|
| 候補数 | **常に 3 つ**（`.length(3)`） |
| 質問テキスト長 | 1〜500 文字 |
| 最低 1 つは `intent: 'next_pattern'` | `.refine()` で強制 |
| 残り 2 つは `deep_dive` または `meta_cognition` | プロンプトで指示 |

### Intent の意味

| intent | 説明 |
|---|---|
| `deep_dive` | 現在のパターンを深掘りする質問 |
| `meta_cognition` | 自己認識・振り返りを促す質問 |
| `next_pattern` | 未完了の別パターンへ遷移する質問 |

### LLM へ渡すコンテキスト

```
## セッション状態
- ターン数: {turnCount}
- 経過時間: {elapsedMinutes} 分

## 予定パターン
  - [{code}] {title}（{category}）
  - ...

## 完了済みパターン
  - {pattern_code}: L{level_reached}まで完了（詰まり: {stuck_type}）
  - ...
```

加えて `buildSystemPrompt` がインタビュワープロフィール・候補者情報・現パターン状態を system プロンプトに埋め込む（採用推奨禁止・プロンプトインジェクション防御を含む）。

### 失敗時のフォールバック

`validateAndFallback` で Zod 検証に失敗した場合は `SAFE_PROPOSAL_FALLBACK` の安全な既定候補を返す。

### 候補数の調整

時間・残りパターン数・進捗に応じた **個数の動的調整はない**。常に 3 候補固定。

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `apps/web/lib/queries/select-planned-patterns.ts` | 段階 1: パターン選定純関数 |
| `apps/web/lib/actions/create-session.ts` | セッション作成 Server Action |
| `packages/ai/src/functions/propose-next-questions.ts` | 段階 2: 質問候補生成 |
| `apps/web/app/api/interview/turns/next/route.ts` | ターン完了 → 次質問生成 SSE エンドポイント |
| `apps/web/app/api/interview/proposal/regenerate/route.ts` | 候補再生成エンドポイント |
| `packages/db/src/schema/...` | `assessment_pattern` / `interview_session` / `question_proposal` テーブル |
