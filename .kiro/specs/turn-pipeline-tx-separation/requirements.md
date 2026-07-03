# Requirements Document

## Introduction

ライブ面接キャプチャの `TurnPipeline` は現在、`pg_advisory_xact_lock` が確保する単一 DB トランザクションの内側で、ターン確定（segment claim + `interview_turn` insert）と LLM 解析編成（話者分離 / ターン分析 / パターンカバレッジ集約 / 次質問生成）を一括で実行している。LLM 呼び出し（遅く・失敗しうる）がロック内に同居しているため、(1) 転写取り込みがロック待ちで滞留しコネクションプール枯渇を招く、(2) 1 ターンの LLM 失敗がバッチ全体（確定済みターン・コスト上限カウント）をロールバックし無限リトライとコスト保護失効を生む、(3) 同一バッチの直前ターンが後続ターンの解析コンテキストから欠落し分析品質が静かに劣化する、という問題がある。

本仕様は「ターン確定（トランザクショナルで高速・冪等）」と「LLM 解析編成（トランザクション境界の外で at-least-once・ターン単位のエラー隔離付き）」を分離し、上記 3 問題を解消することを目的とする。外部から観測可能な振る舞い（ライブ画面の更新・レポート内容）と既存の冪等性契約は不変に保つ。

## Boundary Context

- **In scope**:
  - `TurnPipeline` のターン確定と LLM 解析編成のトランザクション境界分離
  - LLM 解析編成のロック外・at-least-once 実行、ターン単位のエラー隔離と再試行上限
  - セッション単位 LLM 呼び出し上限の、失敗・再試行に対する実効性維持
  - 同一セッションの先行ターンを後続ターンの解析コンテキストに反映
  - `segmenter-tick` と `finalize-session` への解析編成フェーズ接続
- **Out of scope**:
  - LLM プロンプトの内容変更
  - キャプチャ状態機械（`capture_status`）の遷移変更
  - ターン分割ロジック（`evaluate`）の入出力変更
  - ライブ状態 API のクライアント向けレスポンス契約の変更
- **Adjacent expectations**:
  - 元スペック `realtime-interview-capture` が定めるライブ状態・レポート・冪等性（`turn_fingerprint`、`pattern_coverage` upsert、post_batch 一意制約）契約に準拠する。
  - 転写取り込み経路（recall webhook / chunks route）と `finalize-session` は本パイプラインの解析状態を前提に動作する。

## Requirements

### Requirement 1: 転写取り込みの非ブロッキング化

**Objective:** ライブ面接を進行する面接官として、AI 解析の実行中でも転写取り込みが滞らないようにしたい。そうすればライブ転写が更新され続け、セッションが停滞しない。

#### Acceptance Criteria

1. When 転写セグメントの永続化要求が到達したとき, the TurnPipeline shall LLM 解析の完了を待たずにセグメントを永続化する。
2. While あるセッションの LLM 解析が実行中である間, the TurnPipeline shall 同一セッションの新規転写セグメントの受理と永続化を継続できるようにする。
3. If LLM 呼び出しが数十秒応答しない場合, then the TurnPipeline shall 転写取り込み経路をその LLM 呼び出しの完了待ちでブロックしない。

### Requirement 2: ターン確定と解析の障害隔離

**Objective:** 運用者として、あるターンの解析失敗が他ターンを巻き戻さないようにしたい。そうすれば単一の不正入力がセッション全体を破損・停滞させない。

#### Acceptance Criteria

1. If あるターンの LLM 解析が失敗した場合, then the TurnPipeline shall 既に確定済みの他ターン（segment claim と `interview_turn`）をロールバックしない。
2. If あるターンの LLM 解析が失敗した場合, then the TurnPipeline shall そのターンを後続の解析機会で再試行可能な状態として保持する。
3. When 複数ターンが解析待ちであるとき, the TurnPipeline shall 各ターンを独立に解析し、1 ターンの失敗が他ターンの解析継続を妨げないようにする。

### Requirement 3: コスト上限の実効性

**Objective:** 運用者として、セッション単位の LLM 呼び出し上限が再試行下でも守られるようにしたい。そうすれば暴走した再試行が予算を超過しない。

#### Acceptance Criteria

1. When LLM 呼び出しが実行されるとき, the TurnPipeline shall その呼び出しをセッション単位の上限カウントに計上する。
2. If LLM 呼び出しが失敗した場合, then the TurnPipeline shall 上限カウントの計上を巻き戻さず計上済みのまま保持する。
3. While セッションの LLM 呼び出しが上限（元スペックの 150 回/セッション）に達している間, the TurnPipeline shall 追加の LLM 呼び出しを行わない。

### Requirement 4: ポイズンターンの再試行停止

**Objective:** 運用者として、恒久的に失敗するターンが無限に再試行されないようにしたい。そうすればリソースを消費し続けるループを防げる。

#### Acceptance Criteria

1. When あるターンの解析が失敗するたびに, the TurnPipeline shall そのターンの再試行回数を記録する。
2. If あるターンの再試行回数が上限に達した場合, then the TurnPipeline shall そのターンをそれ以上再試行せず失敗として確定する。
3. If あるターンが失敗として確定した場合, then the TurnPipeline shall セッション全体の進行（他ターンの確定・解析・最終化）を妨げない。

### Requirement 5: 解析コンテキストの正確性

**Objective:** 面接官として、各ターンの解析がセッションの先行ターンを踏まえて行われるようにしたい。そうすれば後続質問の解析品質が静かに劣化しない。

#### Acceptance Criteria

1. When あるターンの LLM 解析を行うとき, the TurnPipeline shall 同一セッションで先に確定した直近ターンを解析コンテキストに含める。
2. When 同一の解析処理で複数ターンを連続処理するとき, the TurnPipeline shall 先行ターンの確定結果を後続ターンのコンテキストに反映する。

### Requirement 6: 冪等性の維持

**Objective:** 運用者として、at-least-once 処理が重複ターンや二重コストを生まないようにしたい。そうすれば再試行が安全になる。

#### Acceptance Criteria

1. When 同一の発話に対してターン確定が複数回試行されたとき, the TurnPipeline shall `turn_fingerprint` により重複する `interview_turn` を生成しない。
2. When 同一ターンの解析編成が複数回（並行 tick を含む）起動されたとき, the TurnPipeline shall 当該ターンの解析を高々 1 回だけ実行し、`pattern_coverage` と質問候補に重複や不整合を生じさせない。
3. While あるターンの解析が進行中である間, the TurnPipeline shall 別の実行が同一ターンの解析を二重に開始しないようにする。

### Requirement 7: ライブ画面の無回帰

**Objective:** 面接官として、ライブ画面が従来どおりカバレッジ・質問候補・転写を表示し続けるようにしたい。そうすれば本リファクタが操作体験に影響しない。

#### Acceptance Criteria

1. When ターンの解析が完了したとき, the LiveState API shall 更新後のカバレッジ・質問候補・転写をライブ画面へ反映する。
2. The LiveState API shall 分離前と同一の形状・意味を持つライブ状態を返し、クライアント側の変更を不要にする。

### Requirement 8: 最終化時の解析保証

**Objective:** 運用者として、最終化時に未解析のターンが残らないようにしたい。そうすればレポートが全ターンを反映する。

#### Acceptance Criteria

1. When セッションが最終化されるとき, the SessionFinalizer shall 未解析（pending / 途中）のターンの解析を完了させてからレポートを生成する。
2. If 最終化時に一部ターンの解析が上限到達等で完了できない場合, then the SessionFinalizer shall 解析済みのターンに基づきレポート生成を継続する（best-effort、元スペック 5.5 準拠）。

### Requirement 9: 後方互換とスコープ外の不変性

**Objective:** メンテナーとして、本リファクタが既存の振る舞い契約を保持するようにしたい。そうすれば安全な内部変更になる。

#### Acceptance Criteria

1. The TurnPipeline shall キャプチャ状態機械（`capture_status` の遷移）を変更しない。
2. The TurnPipeline shall ターン分割ロジック（`evaluate`）の入出力を変更しない。
3. The TurnPipeline shall LLM プロンプトの内容を変更しない。
4. When 既存テストスイート（`turn-pipeline.test.ts` / `e2e-scenarios.test.ts` 等）を実行したとき, the TurnPipeline shall 分離後も全テストを pass させる（変更はテスト構造の追随に限る）。
