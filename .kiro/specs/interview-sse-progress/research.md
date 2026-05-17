# Gap Analysis: interview-sse-progress

> 実施日: 2026-05-16
> 対象: `.kiro/specs/interview-sse-progress/requirements.md` v3
> 目的: 既存コードベースとの差分を可視化し、実装方針の判断材料を提供する

---

## 1. 現状調査サマリー

### 1.1 既存資産

| 領域 | 既存資産 | 場所 |
|------|----------|------|
| API ルート | `POST /api/interview/turns/next` (491 行、JSON 同期返却) | `apps/web/app/api/interview/turns/next/route.ts` |
| クライアントランナー | `InterviewSessionRunner` (mode state machine) | `apps/web/app/(interviewer)/interviews/_components/interview-session-runner.tsx` |
| 録音/待機 UI | `RecordingState` (録音モードと「処理中...」スピナー) | `apps/web/app/(interviewer)/interviews/_components/recording-state.tsx` |
| LLM 関数群 | `analyzeTurn` / `splitInterviewerCandidate` / `aggregatePatternCoverage` / `proposeNextQuestions` ほか | `packages/ai/src/functions/` |
| UI スタイル | Tailwind CSS v4 ベース、shadcn/ui 部品は不使用、Tailwind ユーティリティで card/spinner/badge を直書き | 各 `_components/*.tsx` |

### 1.2 既存の処理フェーズ（route.ts ベース）

| フェーズ | 処理 | コード位置 | 失敗時の挙動 |
|----------|------|------------|--------------|
| 認証/検証 | Auth, FormData parse, MIME, Zod, ownership, 冪等性チェック, レート制限事前 | L34-162 | 即座 4xx 返却 |
| 冪等性ヒット | 既存 turn を取得して即返却 | L115-142 | （成功扱い、JSON 即返） |
| Core 9-12 | `uploadToBlob` | L177-179 | 503 |
| Core 13 | `transcribeAudio`（Whisper） | L182 | 503 |
| Core 14-15 | `createLlmContext` + `splitInterviewerCandidate` | L186-210 | 503 |
| Core 16-18 | `analyzeTurn` + 履歴ロード + パターン判定 | L218-246 | 503 |
| Core 19 | DB トランザクション（turn insert + rate limit increment） | L249-312 | 503 |
| Prepare-1a | `aggregatePatternCoverage`（遷移） | L334-391 | 個別 try/catch（応答は止めない） |
| Prepare-1b | `aggregatePatternCoverage`（完了） | L395-449 | 個別 try/catch |
| Prepare-2 | `proposeNextQuestions` | L452-487 | 個別 try/catch |

### 1.3 既存のクライアント挙動

| 状態 | 表示 | 場所 |
|------|------|------|
| `mode === 'recording'` | `RecordingState` 全面 | `interview-session-runner.tsx` レンダー部 |
| `mode === 'loading'` | スピナー + 「処理中...」（最小 UI） | 同 L395-420 周辺 |
| `mode === 'choosing'` | `ProposalChoiceState`（直前ターンの transcript・分析サマリー・3 候補） | 同 |
| エラー時 (503) | Toast 「処理に失敗しました。同じ録音で再試行できます」+ `setMode('recording')` | 同 L210-215 |

### 1.4 ストリーミング資産の不在

- `ReadableStream`、`TransformStream`、`text/event-stream`、`EventSource`、AI SDK の `streamText` / `streamObject` / `createUIMessageStream` の使用箇所はゼロ
- LLM 関数はすべて `Promise<Result>` の async 関数（トークンストリーム未対応）
- 既存の参考実装が無いため、本機能で **プロジェクト初の SSE/ストリーミングルートを導入** することになる

---

## 2. Requirement-to-Asset マップ

| 要件 ID | 要件サマリー | 既存資産 | 差分 | タグ |
|---------|--------------|----------|------|------|
| R1.1 | 4 ステップをリスト表示 | スピナーのみ | ステップリスト UI コンポーネントが必要 | **Missing** |
| R1.2 | ステップ完了で「完了」状態に更新 | 単一の mode 遷移のみ | ステップごとの状態管理 + イベントハンドラが必要 | **Missing** |
| R1.3 | 処理中ステップを視覚的に強調 | 既存スピナー | 強調表示パターン（既存の Tailwind ユーティリティで実装可） | **Missing** |
| R1.4 | 全完了で候補選択画面に遷移 | JSON レスポンス到着で `setMode('choosing')` | 「complete」イベント受信を契機に遷移するよう変更 | **Modification** |
| R1.5 | 冪等性ヒット時は 4 ステップ完了表示後に遷移 | サーバーは即座に既存データを返す | ストリーム上で「全ステップ完了」イベント列を即送信 → クライアント側で順次表示 | **New** |
| R2.1 | 失敗通知 | Toast on 503 | Toast 自体は流用可。トリガーをストリームの `error` イベントに変更 | **Modification** |
| R2.2 | 接続断の検知 | fetch の catch 節 | ストリームが `complete`/`error` イベント未受信のまま終了したケースの判定が必要 | **New** |
| R2.3 | 同録音データで録音画面復帰 | `setMode('recording')` + turnId 保持 | ロジックは流用可 | **Modification** |
| R2.4 | 再試行で重複登録なし | サーバーの冪等性チェック既存 | 変更不要、ストリーム化後も同じ振る舞い | **Existing** |
| R3.1 | 候補選択画面のデータ同一 | JSON で turn/proposal/transcript を返す | `complete` イベントに同じペイロードを載せる | **Modification** |
| R3.2 | 「次の質問の準備」部分失敗を許容 | Prepare-1a/1b/2 の個別 try/catch | ロジック維持。失敗はストリーム上に通知せず、proposal 欠落として `complete` に含める | **Existing**（要設計確認） |

### 2.1 不足ケイパビリティ要約

- ✗ **サーバー側**: SSE/ストリーミング応答パターン
- ✗ **クライアント側**: `fetch` + `ReadableStream` 読み取りロジック、SSE フレームパーサ
- ✗ **UI**: 進捗ステップリストコンポーネント
- ✗ **エラー処理**: ストリーム途絶検知（terminal イベント不在の判定）

### 2.2 制約・前提条件

- 現状の冪等性保証（`turnId` 一意 + DB ユニーク制約 + 既存 turn 検出）は維持必須（R2.4, R3.1, R3.2 が依存）
- 既存の `withRetry` ヘルパー（route.ts L21-28）はストリーム化後も流用可。ただしリトライ中はクライアントへ進捗イベントが送れない時間が伸びる点に留意
- `runtime = 'nodejs'` 必須（OpenAI / Anthropic / Whisper 各 SDK が Node 依存）。本ルートは既に `nodejs` 指定済み
- Vercel デプロイ前提だが、Hobby/Pro いずれも `maxDuration` デフォルト 300 秒（2026-02 時点）で 30-40 秒の処理に十分な余裕あり

---

## 3. 実装アプローチ選択肢

### Option A: 既存ファイルをそのまま拡張（最小変更）

**構成**:
- `route.ts` を ReadableStream 返却に書き換え（既存の try/catch 構造を維持しつつ各ポイントで `controller.enqueue`）
- `interview-session-runner.tsx` の fetch 部を stream リーダーに置き換え + 進捗 state 追加
- 「処理中...」スピナー部分（同ファイル L395-420 周辺）に直接ステップリストを書き込む

**Trade-offs**:
- ✅ 新ファイル不要、最速で動く
- ✅ 既存パターン継承（同じ場所に同じ責務）
- ❌ `interview-session-runner.tsx` がさらに肥大（既に 400+ 行）
- ❌ 進捗 UI と既存 UI が同じファイルに混在し、再利用性ゼロ
- ❌ ステップリストコンポーネントとして将来 `finalize` でも使うなら抽出しなおしが必要

### Option B: 完全分離（新ルート + 新コンポーネント）

**構成**:
- `apps/web/app/api/interview/turns/next/v2/route.ts` を新設（既存ルートは残す）
- `StreamingInterviewSessionRunner.tsx` を新規作成（既存ランナーは残す）
- `InterviewProgressSteps.tsx` を新規コンポーネントとして作成
- フィーチャーフラグや片方を選ぶ仕組みでロールアウト

**Trade-offs**:
- ✅ 安全なロールアウト（既存ルート/ランナーをそのまま残せる）
- ✅ 完全な責務分離
- ❌ コードベースに重複 API + 重複ランナーが残る（テクニカルデビット）
- ❌ どちらに依存するか曖昧になる期間が生じる
- ❌ 既存ルートの呼び出し元は `interview-session-runner.tsx` のみで、フィーチャーフラグの恩恵が小さい

### Option C: ハイブリッド（既存ルートをストリーム化 + UI を分離）✅ 推奨

**構成**:
- `route.ts` を破壊的に ReadableStream 返却に変更（API パスは維持）
- `InterviewProgressSteps.tsx` を新規コンポーネントとして作成（再利用可能な進捗 UI）
- `interview-session-runner.tsx` の fetch 部を stream リーダーに置き換え + `<InterviewProgressSteps step={...} />` を `mode === 'loading'` 時に表示
- `recording-state.tsx` は変更なし（録音モードの責務のみ）

**Trade-offs**:
- ✅ 重複コード/ルートを残さない、API パスは維持
- ✅ 進捗 UI は独立コンポーネントとして将来再利用可（`finalize` 等）
- ✅ `interview-session-runner.tsx` の肥大化を進捗 UI 側へ逃がせる
- ❌ 既存ルートの破壊的変更なので、リリース時に同時デプロイが必須（v2 を経由しない）
- ❌ ロールバックは git revert のみ（フィーチャーフラグ無し）

---

## 4. 工数 / リスク評価

| 項目 | 評価 | 根拠 |
|------|------|------|
| 工数 | **M（3-5 日）** | サーバー SSE 化 ~0.5d / クライアント stream リーダー ~1d / `InterviewProgressSteps` ~0.5d / エラー&冪等性エッジケース ~1d / 手動 + 統合テスト ~1d |
| リスク | **Medium** | 新パターン（既存ストリーム実装ゼロ）だが Vercel 公式 + Next.js 公式の整備されたパターンに乗れる。冪等性ヒット時のイベント送出順序とストリーム途絶検知が要注意ポイント。Vercel タイムアウトは余裕あり。AI SDK 既存利用なので置換不要 |

---

## 5. 設計フェーズへの推奨事項

### 5.1 推奨アプローチ

**Option C（ハイブリッド）** を採用。理由:
- 既存ルートの呼び出し元が単一（`interview-session-runner.tsx` のみ）であり、API パスを維持しても呼び出し側の整合性を取りやすい
- 進捗 UI コンポーネントを切り出すことで、将来 `finalize` の進捗表示にも再利用できる余地を残せる
- v2 路線は MVP 段階の負債を増やすだけになりやすい（呼び出し元が複数あれば話は別）

### 5.2 設計フェーズで決定すべき事項

| # | 決定事項 | 候補 |
|---|----------|------|
| D1 | ストリームのワイヤーフォーマット | (a) SSE `text/event-stream`（推奨）/ (b) NDJSON `application/x-ndjson` |
| D2 | イベントスキーマ | `{type, step, payload?}` の Zod スキーマ定義（`progress` / `complete` / `error` の 3 種が最小） |
| D3 | ステップ粒度のマッピング | サーバー側 7 チェックポイント（upload/transcribe/split/analyze/insert/transition/proposals）→ ユーザー向け 4 ステップ（音声アップロード/文字起こし/回答分析/次質問準備）への集約ルール |
| D4 | 冪等性ヒット時のイベント送出 | (a) 4 つの `progress` を 0ms で連射 → `complete` / (b) `complete` 単発 → クライアント側で 4 ステップを「即完了」表示 |
| D5 | Prepare 部分失敗の通知方針 | (a) `complete` ペイロード内で `proposal: null` 等で表現（既存挙動と互換）/ (b) 別途 `partial_failure` イベントを送出 |
| D6 | クライアント側の SSE パーサ | (a) 自前実装（30 LoC、依存ゼロ、推奨）/ (b) `@microsoft/fetch-event-source` |
| D7 | AbortController の伝播 | クライアント unmount → fetch abort → サーバー側 LLM 呼び出しを `req.signal` で中断するか否か（要件 Out of scope に「キャンセル不可」とあるため、abort はクリーンアップのみで可） |
| D8 | レスポンスヘッダ | `Cache-Control: no-cache, no-transform`、`X-Accel-Buffering: no`、`Connection: keep-alive`（Vercel エッジバッファリング回避） |

### 5.3 Research Needed（設計時にさらに調査・確認）

- **R1**: 音声 FormData サイズが Vercel Functions のリクエスト body 上限 4.5MB を超えるシナリオは現行実装で発生しうるか（現在は 50MB まで許容している点と整合性取れているか確認）
- **R2**: `withRetry` のリトライ中はクライアントへの進捗イベント送出が止まる。タイムアウト感を悪化させるなら、リトライ前に「再試行中」イベントを emit するか
- **R3**: パフォーマンス改善（ユーザーが並行で実施予定）の結果、ステップ粒度や所要時間が大きく変わる可能性がある。設計確定前にパフォーマンス調査の結論を待てるか
- **R4**: 冪等性ヒット時、サーバー側で既存 `proposal` が無い（前回 Prepare-2 失敗）ケースのストリーム表現
- **R5**: 既存の `withRetry` のリトライ 1 回のみ仕様は維持して問題ないか（ストリーム化後も同じ動作）

### 5.4 設計時に避けるべきアンチパターン

- ❌ Route Handler 内で `await` してから `Response` を返す（バッファリングされる）。必ず `ReadableStream.start()` 内で全処理を行う
- ❌ AI SDK の `createUIMessageStream` を本ルートで使う（チャット UI 前提のスキーマで本用途には過剰）
- ❌ `EventSource` を使う（POST + FormData のため不可）
- ❌ ステップ粒度を 7 段階のまま UI に出す（要件 R1.1 で 4 ステップと明示済み）

---

# Performance Analysis Addendum

> 実施日: 2026-05-16
> 対象: `POST /api/interview/turns/next` の現状ボトルネックと改善余地
> 目的: SSE 設計フェーズに先立って、実装で取り得る最適化と SSE 仕様への影響を可視化する

## 6. 現状のホットパス分解

| # | フェーズ | コード位置 | 推定時間 | 主犯 |
|---|----------|-----------|---------|------|
| A | Auth + Zod + 検証 | L34-98 | <50ms | - |
| B | session ownership 取得 | L101-112 | 20-50ms | DB 1 query |
| C | 冪等性チェック | L115-142 | 20-50ms | DB query（早期 return あり） |
| D | レート制限 pre-check | L148-162 | 80-200ms | **4 連 sequential read** |
| E | uploadToBlob | L177-179 | 50ms (local-fs) / 200-1500ms (Vercel Blob) | I/O |
| F | transcribeAudio (Whisper) | L182 | **5-15s** | local-docker `small`（CPU） |
| G | currentPattern 取得 | L186-190 | 20-50ms | DB |
| H | createLlmContext + buildLlmContext | L192-199 | ~100ms | DB 4 queries（並列） |
| I | splitInterviewerCandidate | L202-210 | **3-6s** | Sonnet 4.6 LLM |
| J | analyzeTurn | L224-232 | **4-8s** | Sonnet 4.6 LLM |
| J' | loadRecentTurns(10) | L218-222 | 20-50ms | DB |
| K | DB transaction (insert + 4 連 rate-limit upsert) | L249-312 | 100-300ms | DB |
| L | Prepare-1a 遷移 coverage | L332-391 | 0 / **3-6s + 3 query** | LLM（条件付き） |
| M | Prepare-1b 完了 coverage | L395-449 | 0 / **3-6s + 2 query** | LLM（条件付き） |
| N | Prepare-2 次質問提案 | L452-487 | **3-6s + ctx 再構築 + loadRecentTurns(1000)** | LLM |

**典型ホットパス（L/M 不発時）**: 約 **24 秒下限、35-40 秒上限**
**全フェーズ動作時**: 約 **40-50 秒**

## 7. 改善余地一覧（インパクト順）

| Rank | 施策 | 削減 | 工数 | リスク | SSE 仕様との関係 |
|------|------|------|------|--------|------------------|
| 1 | **Whisper を Groq `whisper-large-v3-turbo` に切替** | **5-14s** | S（半日） | 低 | なし（Core 短縮） |
| 2 | **Prepare をクリティカルパス外へ（SSE 2-stage）** | 3-12s（体感） | M | 低 | **SSE 仕様の D5 にそのまま反映** |
| 3 | **split + analyze を 1 LLM 呼び出しに融合** | 3-6s | M | 中 | R1.1 のステップ数が 4→3 に変わる |
| 4 | **前ターンで生成した提案を投機的表示**（A1 と組み合わせ） | 3-6s（2 ターン目以降） | M | 低 | A1 と整合 |
| 5 | **splitIC を Haiku 4.5 に切替** | 2-3s | S | 低 | なし |
| 6 | **`withRetry` を AI SDK 呼び出しから除去**（QW5） | 0-12s（テールレイテンシ） | S | 低 | R5 が解消 |
| 7 | **その他 Quick Wins**（QW1/QW2/QW3/QW6） | 0.4-0.8s | S | 低 | なし |
| 8 | **L+M を Promise.all で並列化**（両方発火時） | 3-6s | S | 低 | SSE で 2 つのイベントが交互送出される |

### 7.1 Whisper プロバイダ比較

| プロバイダ | 30秒音声のレイテンシ | コスト | 備考 |
|-----------|--------------------|---------|------|
| local-docker `small`（CPU） | 5-15s（コールド +20-60s） | $0 | 開発時推奨。日本語品質は十分 |
| OpenAI `whisper-1` | 2-5s | $0.006/分 ≈ $0.18/面接 | 安定、互換性高い |
| Groq `whisper-large-v3-turbo` | **0.2-0.5s**（164-247× リアルタイム） | $0.04/時 ≈ $0.00067/分 ≈ **$0.02/面接** | 最速、Whisper-1 より品質も上 |

### 7.2 LLM モデル選定の余地

| 関数 | スキーマ | 推論負荷 | Haiku 4.5 候補? | 削減 |
|------|---------|---------|----------------|------|
| splitInterviewerCandidate | 文字列 2 つ | 軽（話者分割） | **Yes** | -2〜-3s |
| analyzeTurn | 10+ フィールド + enum | 中 | リスクあり、A/B 必要 | -2〜-4s（採用なら） |
| aggregatePatternCoverage | 5 次元スコア集約 | 中-高 | **No**（評価品質重視 + ホットパス外） | - |
| proposeNextQuestions | 3 候補生成 | 中 | **Yes**（投機実行なら） | -2〜-3s |

## 8. Quick Wins 詳細（route.ts）

| ID | 場所 | 問題 | 修正 | 削減 |
|----|------|------|------|------|
| QW1 | L459 | `loadRecentTurns(1000).length` で件数だけ取得 | `SELECT COUNT(*)` | 20-200ms |
| QW2 | L396-400 | M で `currentPattern` を再 fetch（G で取得済み） | 外側スコープから再利用 | 20-50ms |
| QW3 | L154-162 | レート制限 4 連 sequential read | `Promise.all` | 60-150ms |
| QW5 | L21-28 `withRetry` | 全 6 LLM 呼び出しに二重リトライ（AI SDK 側で既にリトライしている） | upload/transcribe のみ維持、AI 呼び出しから除去 | 0-12s（テール） |
| QW6 | L456-458 | N で LlmContext 全体を再構築（4 query） | 必要時のみ `boundCtx.completedCoverage` をパッチ | 100-200ms |

## 9. SSE 仕様との相互作用（重要）

パフォーマンス調査の結果、SSE 仕様の未決定事項に直接の答えが出ました：

| 影響先 | 答え |
|--------|------|
| **D5（Prepare 部分失敗の通知方針）** | 推奨施策 #2 を採用するなら、Prepare はそもそもクリティカルパス外 → `core_complete` 即時 → 後追いで `proposal_ready` イベント、という設計が自然 |
| **R3（パフォーマンス調査の結果待ち）** | 解決。施策 #1 と #3 以外（#2 など）は SSE 設計と密結合。**SSE 仕様の D3/D5 を最終化するときに施策 #2 の有無を組み込む必要あり** |
| **R5（withRetry 仕様）** | QW5 で解消。AI SDK 呼び出しからは除去、upload/transcribe のみ維持 |
| **R1.1（4 ステップ表示）** | 施策 #3（split+analyze 融合）を採用するなら 3 ステップに変更が必要。当面は 4 ステップ維持 |

## 10. 実装方針（ユーザー承認済み）

ユーザー方針:
- ローカル開発は `local-docker` 維持（時間がかかるのは許容、コスト 0）
- 本番/動作確認には Groq / OpenAI を選択可能に
- Quick Wins バンドルを併せて適用
- SSE 設計フェーズに進む前に、施策 #1（Groq 選択肢追加）と #3 相当の Quick Wins のみを先行実装

採用する施策:
- ✅ **施策 #1**: Groq Whisper を新規プロバイダとして追加（既存の openai / local-docker は維持し、`WHISPER_PROVIDER=groq` で切替可能に）
- ✅ **Quick Wins**: QW1, QW2, QW3, QW5, QW6 を route.ts に適用
- ⏸ **施策 #2 / #3 / #4 / #5**: SSE 設計フェーズで再評価（特に施策 #2 は SSE 設計の中核になる）

---

# Design Phase Synthesis

> 実施日: 2026-05-16
> 対象: `.kiro/specs/interview-sse-progress/design.md`
> 目的: 設計時に適用した 3 つの synthesis レンズ（Generalization / Build vs Adopt / Simplification）の判断と理由を記録する

## 11. Generalization

- **採用**: イベントスキーマを `progress` / `complete` / `error` の汎用 3 種に統一し、`step` フィールドのみ列挙型で固定
- **理由**: 将来 `finalize` 等の他エンドポイントでも同じパターン（多段処理 + 進捗表示）が想定されるため、ワイヤーフォーマットを再利用しやすくする。ただし本仕様の実装スコープは `turns/next` 専用に限定し、汎用ストリーミング基盤の抽出は行わない（YAGNI）
- **不採用**: 「汎用 ProgressBar コンポーネント」化。本機能では 4 ステップ固定の用途しかないため、`InterviewProgressSteps` として用途特化させ、ステップ定義（ラベル・順序）を内部に持たせる

## 12. Build vs Adopt

| 領域 | 判断 | 理由 |
|------|------|------|
| SSE プロトコル | **Adopt** | W3C 標準。Vercel/Next.js 公式パターンで動作確認済み |
| Web Streams API | **Adopt** | Web 標準、Node.js 20+ 標準対応 |
| Zod | **Adopt**（既存依存流用） | プロジェクト内で広く使用、追加コストなし |
| `@microsoft/fetch-event-source` | **Reject** | 5KB 追加・約2年メンテナンス停止。本用途では POST + reconnect 不要のため自前 30 LOC パーサで十分 |
| AI SDK の `createUIMessageStream` | **Reject** | チャットプロトコル前提のオピニオン強い。本用途は単純な進捗送出のみで過剰 |
| カスタムストリーミング基盤ライブラリ | **Build minimal** | `parseSseStream` を 30-50 LOC の単一汎用ジェネレータとして実装。ライブラリ化はせず |

## 13. Simplification

設計から除外した要素と理由:

| 除外要素 | 理由 |
|---------|------|
| キャンセル機能（AbortController による in-flight 処理中断） | 要件で Out of scope 指定。`AbortController` は unmount クリーンアップのみに使用 |
| ジョブ ID + GET 再取得パターン | MVP 段階で再開機能は不要。接続断時は同 turnId で再 POST すれば冪等性チェックで既存データが返る |
| 経過秒数表示 / サブプログレスバー | 質問4で「ステップ名のみ」と明示確認 |
| 施策 #2（Prepare クリティカルパス外）の本設計での採用 | R1.4「全ステップ完了で遷移」と矛盾するため、別仕様で要件改訂を経て将来反復 |
| サーバー / クライアントを跨ぐコード共有用パッケージ化 | 本機能の影響範囲が `apps/web` 内に閉じるため `apps/web/lib/interview/` にローカル配置 |

## 14. 重要な設計判断: 施策 #2 を本設計で採用しない理由

パフォーマンス調査では施策 #2（Prepare をクリティカルパス外へ）が最大の体感改善（3-12 秒）と評価された。しかし本設計では非採用とした：

1. **要件と矛盾**: R1.4「全 4 ステップ完了で候補選択画面に遷移」を厳格に守る場合、「prepare ステップ完了」を待たずに遷移させる UX は要件改訂が必要
2. **wall clock 改善でカバー可能**: Groq 切替（5-14 秒削減）+ Quick Wins により typical 12-15 秒に短縮見込み。これは進捗表示のメリットを十分実感できる範囲
3. **複雑性増加**: 施策 #2 は `core_ready` イベント追加と、choosing 画面側で proposal 後追い反映ロジックが必要。MVP リリース後のフィードバックを見てから判断する方が安全
4. **後方互換変更が容易**: 本設計のイベントスキーマに `core_ready` を追加するのは破壊的変更でなく、将来 SSE 仕様の minor revision で対応可能

将来採用する場合は、本仕様の Revalidation Trigger 「施策 #2 の採用」が発火し、要件改訂 → 設計改訂のサイクルを再実施する。
