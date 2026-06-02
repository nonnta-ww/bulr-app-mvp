# Brief: mock-interview

## Problem
エンジニア候補者は面接に不安があり、実務判断力を問う面接形式に慣れていない。本番のエントリー前に低リスクで練習できる場がない。bulr にとっては、二面市場の成立を待たずに候補者単独で価値を持つ「engagement hook」が必要で、候補者プール形成の起点になる。

## Current State
- `assessment-engine`（Stage 1）が BtoB 面接アシスタント中核を提供：57 パターン × 4 段階深掘り × 5 次元ルーブリック、録音・SSE 進捗・面接後レポート。これは**企業の面接官向け**で、候補者は使えない。
- 候補者向けの模擬面接・自己練習機能は存在しない。57 パターン資産が候補者面では未活用。
- 候補者基盤（`candidate-auth-onboarding` の `candidate_profile` / Magic Link、`skill-survey` の回答）は整備済み。

## Desired Outcome
候補者が bulr.net（`apps/candidate`）の `/mock-interview` で、AI が面接官役を務めるテキスト模擬面接を行い、bulr の 57 パターン・4 段階深掘り・5 次元ルーブリックに紐づく**形成的フィードバック**（スコアではなく成長示唆）を受け取れる。月次クォータ（3 回/候補者）でコストを抑制。評価ステークがない練習空間として機能する。

## Approach
`packages/ai/mock/` に BtoB 面接エンジンとは**別系統**の LLM 関数を新設（パターン/ルーブリック定義は `packages/ai/interview` の既存資産を共有・参照）。`mock_interview` テーブル（候補者所有）でセッションとクォータを管理。テキストチャット UI を `apps/candidate/app/mock-interview/` に実装。クォータはサーバー側で月次回数を検査して enforce。出力は「bulr らしさ」（57 パターン準拠の質問・段階深掘り・bulr 語彙のフィードバック）を保ち、汎用 AI コーチの「ただ褒める」挙動を避ける。

## Scope
- **In**:
  - `mock_interview` テーブル（`candidate_profile` FK・候補者所有、`pattern_code`、開始/終了時刻、`turn_count`、`formative_feedback` JSONB、`metadata` に LLM コスト推定）
  - `packages/ai/mock/`：`conductMockInterview`（面接官役・次質問生成）／`generateFormativeFeedback`（5 次元ルーブリック + 4 段階構造に沿った形成的フィードバック生成）
  - テキストチャット UI：`/mock-interview`（**候補者が 57 パターン一覧から選択**して開始。skill-survey 回答があれば推奨を上位表示＝任意）／`/mock-interview/[sessionId]`（チャット）／`/mock-interview/[sessionId]/result`（フィードバック表示）
  - API：`/api/mock-interview/turns/next`（ユーザーターン→LLM ターン）／`/api/mock-interview/finalize`（終了→フィードバック生成）
  - **月次クォータ = 3 回/候補者**（サーバー側で `mock_interview` 当月件数を検査。上限到達時は新規セッション作成を拒否し UI に「今月の上限に達しました」を表示）
  - 各セッションに LLM コスト推定を記録（admin-operations が集計するためのフック）
- **Out**:
  - 音声・録音（テキスト専用 MVP。音声は Wave 5+ で `packages/ai/whisper` + MediaRecorder を再利用）
  - スコア・ランキング・ピア比較（L1 棚卸し方針：ツール利用 ≠ 市場価値。数値評価しない）
  - 候補者によるパターン authoring・自由質問のパターン昇格（Wave 5+）
  - スケジューリング・人間コーチ割当
  - LLM コスト/クォータの**監視ダッシュボード**（→ admin-operations が所有）

## Boundary Candidates
- データ層：`mock_interview` スキーマ + migration + クエリ（候補者所有、クォータ件数取得）
- AI 層：`packages/ai/mock/` の 2 関数（conduct / feedback）— `packages/ai/interview` のパターン/ルーブリック定義を共有参照
- 候補者 UI：パターン選択・チャット・結果表示の 3 画面 + 2 API
- クォータ enforcement：月次件数検査ロジック（サーバー側ガード）

## Out of Boundary
- BtoB 面接エンジン（`assessment-engine` の 5 LLM 関数・状態 A/B・interview_session/turn/coverage/report スキーマ）には触れない
- assessment_pattern マスタの編集（読み取り専用で消費）
- admin 側のコスト監視・クォータ管理 UI（admin-operations）
- 候補者向け課金・プレミアム（Wave 5+）

## Upstream / Downstream
- **Upstream**: `candidate-auth-onboarding`（`requireCandidate` / `candidate_profile`）、`assessment-pattern-seed`（57 パターンを消費）、`packages/ai/interview`（パターン・ルーブリック・プロンプト定義の共有）、`skill-survey`（任意：推奨パターンの seed）
- **Downstream**: `admin-operations`（`mock_interview` のコスト/クォータを監視）、Wave 5+ 音声模擬面接、Wave 5+ 候補者向け課金

## Existing Spec Touchpoints
- **Extends**: `packages/ai`（`mock/` サブディレクトリ追加、`interview/` とは別系統）、`assessment-pattern-seed`（57 パターンを読み取り消費）
- **Adjacent**: `assessment-engine`（BtoB 面接と完全分離・共有するのはパターン/ルーブリック定義のみ）、`entry-flow` / `session-from-entry`（実エントリー・本番セッションとは別フロー、重複させない）

## Constraints
- Next.js 16 + React 19、`packages/ai` の既存規約（`generateObject` + Zod スキーマ、Anthropic Claude）に準拠
- MVP 最小：テキスト専用、1 セッション 1 パターン、形成的フィードバックのみ（スコアなし）
- データオーナーシップ：`mock_interview` は**候補者所有**（候補者プロフィール・アンケート・模擬面接 = 候補者所有レイヤー）
- LLM クォータ必須（無料模擬面接のコスト青天井防止）。当面 **3 回/月/候補者**。各セッションで LLM コスト推定を記録し admin-operations が集計
- `apps/* → packages/*` 単方向依存ルール、`tech.md` / `security.md` / `structure.md` 準拠
