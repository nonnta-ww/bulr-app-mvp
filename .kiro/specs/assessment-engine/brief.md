# Brief: assessment-engine

## Problem

bulr の中核体験は **面接アシスタント型による実務判断力の可視化**。`product.md` の競争優位 #1「対話型経験問診」と #3「5 次元スコアリング」に直接対応する。これが提供できないと製品コンセプトそのものが成立しない。`docs/03-probe-logic.md` に質問ロジック設計、`docs/01-architecture-mvp.md` に面接アシスタント アーキテクチャ、`assessment-design.md` / `evaluation-rubric.md` に方針が整理されているが、実装ゼロ。

v2 移行に伴い、v1 の「候補者直接対話型」（useChat + streamText チャットループ）から **全面書き直し**。新たに音声録音 + Whisper 文字起こし + 5 LLM 関数 + 状態A/B UI + 面接後レポート画面（面接官向け）+ Vercel Cron 音声削除 + フリー質問の許容を実装する。

## Current State

- `monorepo-foundation` で apps/web + packages/{db, types, lib, ai} スケルトンあり、`packages/ai` に Vercel AI SDK 6 + Anthropic SDK + OpenAI SDK + Zod の依存追加済み
- `multi-env-infrastructure` で `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `BLOB_READ_WRITE_TOKEN` / `CRON_SECRET` 等の環境変数あり、`vercel.json` に Cron スケジュール定義あり、Vercel Preview 動作確認可能
- `authentication` で `requireUser`、`authedAction`、`requireSessionOwnership`、`user_profile`（面接官プロファイル）、`rate_limit` テーブル、Magic Link サインインフロー、smoke test ページ（`/admin/_health/`）あり
- `assessment-pattern-seed` で `assessment_pattern` テーブルに 57 パターン × 4 段階質問テンプレ投入済み、カテゴリ enum は `'design' | 'trouble' | 'performance' | 'security' | 'organization' | 'ai'`
- `candidate` / `interview_session` / `question_proposal` / `interview_turn` / `pattern_coverage` / `session_report` テーブル未定義
- `packages/ai` に LLM 関数・Whisper クライアント・システムプロンプト未実装
- `packages/types/src/profile.ts` / `packages/types/src/evaluation.ts` 未作成（exports map のみ予約）
- `packages/db/src/queries/` サブディレクトリ未作成

## Desired Outcome

- 面接官は Magic Link サインイン → セッション一覧 → 新規セッション作成（候補者情報入力）→ 状態A/B のループで面接実施 → 面接終了 → 面接後レポート画面でヒートマップ + サマリーを確認
- セッション中、面接官は **状態A（録音中）** で質問を音読し候補者の回答を待ち、`[次の質問へ]` 押下で **状態B（候補選択）** に遷移、3 候補のうち 1 つを選ぶか `[自分で次を聞く]` で manual ターンを開始
- 各ターンは録音 → Vercel Blob 保存 → Whisper 文字起こし → LLM 分析（5 次元シグナル + パターン推定 + 到達段階）→ DB 保存 → 次の 3 候補生成
- パターン完了時に LLM が複数ターンを統合して 5 次元最終スコア + level_reached + stuck_type を算出し `pattern_coverage` に保存
- フリー質問（規定外）は `pattern_id=null` で `interview_turn` に記録、評価集約には含めず `session_report.summary_text` に総評反映
- セッション終了時に `session_report` を生成（ヒートマップ JSON + サマリーテキスト）、面接官向けレポート画面に表示
- セッション中断・再開可能（途中で離脱して後日続きを受けられる）
- 音声ファイルは `audio_expires_at = created_at + 30 days` で記録、Vercel Cron が毎日 1 回削除
- レート制限: 面接官あたり 1 日 5 セッション、API 1 分 30 リクエスト、1 セッションあたり LLM 呼び出し 100 回上限、ターン 50 回上限
- LLM コスト目安: 1 セッション $1〜2、70 セッション全体で $70〜200（Whisper 含む）

## Approach

`docs/03-probe-logic.md` の質問ロジック設計を **面接アシスタント型** に翻訳して実装。Vercel AI SDK 6 の `generateObject` + Zod スキーマで構造化出力、`useChat` / `streamText` のチャットループは使わない。LLM 関数は packages/ai に集約、UI は apps/web に。

- **状態機械**: クライアントは状態A / 状態B の遷移のみを管理。サーバー側で 1 ターン処理を順次オーケストレーション（決定論的）
- **システムプロンプト**: `assessment-design.md` の自然対話指針 + `evaluation-rubric.md` のスコアリング基準 + 4 段階深掘り構造 + AI 横断軸 + 詰まり判定 + 採用推奨を出さない指示を反映。プロンプトは `packages/ai/src/prompts/system-prompt.ts` に集約、`buildSystemPrompt(ctx)` 純関数として提供、ユーザー入力でオーバーライド不可
- **LLM 関数**: `packages/ai/src/functions/` に 5 関数（`analyzeTurn` / `splitInterviewerCandidate` / `proposeNextQuestions` / `aggregatePatternCoverage` / `generateSessionReport`）を `generateObject` + Zod スキーマで実装、`createLlmContext(ctx)` のクロージャでセッション情報を束縛
- **Whisper クライアント**: `packages/ai/src/whisper/transcribe.ts` で OpenAI Whisper API ラッパー
- **音声処理**: `apps/web/lib/audio/` に MediaRecorder ラッパー + Vercel Blob アップロードヘルパー
- **UI**: `apps/web/app/(interviewer)/interviews/` 配下に セッション一覧 / 新規作成 / 面接中（状態A/B）/ 面接後レポート の 4 ページ。状態A/B は `'use client'`、その他は Server Component 中心
- **API**: `apps/web/app/api/interview/turns/next/route.ts` で 1 ターン処理、`apps/web/app/api/interview/finalize/route.ts` でセッション終了 + ヒートマップ生成、`apps/web/app/api/cron/audio-purge/route.ts` で Vercel Cron 音声削除
- **候補者情報**: 受験開始時にフォームで name / applied_role / background_summary / email? を入力 → `candidate` レコード作成 → `interview_session.candidate_id` で参照
- **セッション中断・再開**: 面接官がブラウザを閉じても `interview_session.status='in_progress'` で残り、再アクセスでセッション一覧から続行可

## Scope

- **In**:
  - DB スキーマ:
    - `candidate`（id, name, applied_role, background_summary, email?, created_at, updated_at）
    - `interview_session`（id, interviewer_id FK→user, candidate_id FK→candidate, status enum, role text default 'backend', planned_pattern_codes text[], consent_obtained_at default now(), consent_version default 'ja-v1', started_at, completed_at）
    - `question_proposal`（id, session_id FK, prepared_for_turn_no, candidate_1_text, candidate_1_intent enum, candidate_2_text, candidate_2_intent, candidate_3_text, candidate_3_intent, selected_index 1/2/3/null=manual, generated_at）
    - `interview_turn`（id, session_id FK, sequence_no, pattern_id FK→assessment_pattern nullable, proposal_id FK→question_proposal nullable, question_source enum [llm_candidate_1/2/3, manual], question_text, audio_key text nullable, audio_expires_at timestamp, transcript JSONB { interviewer, candidate }, llm_analysis JSONB, pattern_match_confidence enum [exact/inferred_high/inferred_low/off_pattern], off_pattern_summary text nullable, duration_ms, created_at）
    - `pattern_coverage`（id, session_id FK, pattern_id FK, UNIQUE (session_id, pattern_id), level_reached 0-4, stuck_type enum nullable, llm_evaluation JSONB, manual_evaluation JSONB nullable, turn_ids text[], finalized_at）
    - `session_report`（id, session_id FK UNIQUE, heatmap_data JSONB, summary_text, generated_at）
  - drizzle-kit migration（dev branch にスキーマ反映、`packages/db/drizzle/*_assessment_engine.sql` の glob で参照）
  - 共通型定義: `packages/types/src/profile.ts`（`InterviewerProfile`, `CandidateInfo`）+ `packages/types/src/evaluation.ts`（`LlmEvaluation`, `ManualEvaluation`, `LlmAnalysis`, `HeatmapData`, `StuckType`, `PatternMatchConfidence`）
  - LLM 関数（`packages/ai/src/functions/`）:
    - `analyzeTurn(transcript, current_pattern, history, ctx)`: このターンで観察できた 5 次元シグナル + 到達段階推定 + pattern_match_confidence + nearest_patterns + off_pattern_summary
    - `splitInterviewerCandidate(transcript, ctx)`: manual ターン用、文脈から質問+回答を分離
    - `proposeNextQuestions(session_state, planned_patterns, ctx)`: 3 候補生成（深掘り / メタ認知 / 必ず次パターンを 1 つ含む）
    - `aggregatePatternCoverage(turns, pattern, ctx)`: パターン完了時、複数ターンを統合して 5 次元最終スコア + level_reached + stuck_type
    - `generateSessionReport(all_coverage, free_questions, ctx)`: ヒートマップ JSON + サマリーテキスト生成
  - 各関数は `generateObject` + Zod スキーマで構造化出力、出力を DB 書き込み前に Zod 再検証
  - システムプロンプト: `packages/ai/src/prompts/system-prompt.ts`、`buildSystemPrompt(ctx)` 純関数で 4 段階構造 + 詰まり判定 + AI 横断軸 + 採用推奨禁止 + プロンプト注入対策を含む
  - Whisper クライアント: `packages/ai/src/whisper/transcribe.ts`
  - Vercel Blob ヘルパー: `apps/web/lib/audio/blob-client.ts`（uploadToBlob、Blob URL 取得サーバーサイドのみ）
  - MediaRecorder ヘルパー: `apps/web/lib/audio/recorder.ts`（'use client' で MediaRecorder ラップ）
  - 候補者情報入力フォーム + セッション作成: `apps/web/app/(interviewer)/interviews/new/page.tsx` + Server Action
  - セッション一覧: `apps/web/app/(interviewer)/interviews/page.tsx`
  - 面接中 UI: `apps/web/app/(interviewer)/interviews/[sessionId]/page.tsx`（状態A/B Client Component）
  - 面接後レポート: `apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx`（ヒートマップ CSS 横棒 + サマリーテキスト）
  - 1 ターン API: `apps/web/app/api/interview/turns/next/route.ts`（multipart/form-data audio + 認証 + レート制限 + sessionId/userId クロージャ束縛 + LLM 関数オーケストレーション）
  - セッション終了 API: `apps/web/app/api/interview/finalize/route.ts`（残り pattern_coverage 集計 + generateSessionReport + status='completed'）
  - 音声削除 Cron: `apps/web/app/api/cron/audio-purge/route.ts`（CRON_SECRET 認証 + audio_expires_at <= now() の音声削除 + audio_key null クリア + ログ）
  - 共通クエリ: `packages/db/src/queries/` 配下に `loadSessionWithTurns`, `loadCompletedPatternCodes` 等
  - LLM 出力検証ヘルパー: `packages/ai/src/lib/validate-llm-output.ts`（範囲外 / 必須欠落で安全側にフォールバック）
  - レート制限（authentication spec の `rate_limit` テーブルを再利用、key prefix `chat:userId`）: 1 日 5 セッション、API 1 分 30 リクエスト、LLM 100 回/セッション、ターン 50 回/セッション、メッセージ 200 件/セッション
  - smoke test ページ削除（authentication spec の `/admin/_health/` を削除し、本 spec の進捗確認のため一時的に `/interviews` にプレースホルダ表示）

- **Out**:
  - 管理画面（admin-review-panel spec）
  - フル機能のヒートマップ可視化（admin-review-panel spec で簡易、本 spec は CSS 横棒の Stage 1 簡易版を面接官向けレポートに表示）
  - PostHog / Sentry / Helicone（Stage 2）
  - 複数職種対応（フロントエンド / SRE / PdM、Stage 2）
  - 多言語対応（next-intl、Stage 2）
  - リアルタイム文字起こし、話者分離 API、先読み質問生成（Stage 2）
  - パターン編集 UI（Stage 2）
  - 候補者向け UI（Stage 3）
  - フリー質問の新パターン昇格 UI（Stage 2、Stage 1 では DB 直接閲覧で対応）

## Boundary Candidates

- DB スキーマ（`packages/db/src/schema/` 配下に candidate / interview-session / question-proposal / interview-turn / pattern-coverage / session-report の 6 ファイル）
- 共通型定義（`packages/types/src/profile.ts` / `packages/types/src/evaluation.ts`）
- LLM 関数 5 つ（`packages/ai/src/functions/`）
- システムプロンプト（`packages/ai/src/prompts/system-prompt.ts`）
- Whisper クライアント（`packages/ai/src/whisper/transcribe.ts`）
- 音声処理ヘルパー（`apps/web/lib/audio/`）
- API ルート 3 つ（`apps/web/app/api/interview/turns/next/`, `finalize/`, `apps/web/app/api/cron/audio-purge/`）
- 面接官 UI 4 ページ（`apps/web/app/(interviewer)/interviews/` 配下）
- セッション作成 Server Action（`apps/web/lib/actions/create-session.ts`）
- 共通クエリ（`packages/db/src/queries/`）
- LLM 出力検証ヘルパー（`packages/ai/src/lib/validate-llm-output.ts`）

## Out of Boundary

- 管理画面の機能ページ（`admin/sessions/` 等、admin-review-panel spec）
- 創業者の手動評価入力 UI（admin-review-panel spec）
- 創業者向け CSV/JSON エクスポート（admin-review-panel spec）
- 求人マッチング、企業向けダッシュボード（Stage 2 以降）
- 候補者削除 UI / フロー（Stage 3、企業側機能として）

## Upstream / Downstream

- **Upstream**:
  - `monorepo-foundation`（packages/db、packages/ai、apps/web の基盤）
  - `multi-env-infrastructure`（ANTHROPIC_API_KEY、OPENAI_API_KEY、BLOB_READ_WRITE_TOKEN、CRON_SECRET、DATABASE_URL、Vercel Cron スケジュール、Vercel デプロイ）
  - `authentication`（`requireUser`、`authedAction`、`requireSessionOwnership`、`user_profile`、`rate_limit` テーブル、smoke test ページ削除元）
  - `assessment-pattern-seed`（`assessment_pattern` テーブルと 57 パターンデータ、カテゴリ enum）
- **Downstream**:
  - `admin-review-panel`（`interview_session`、`interview_turn`、`pattern_coverage`、`session_report`、`question_proposal`、`candidate` を読み取り、`pattern_coverage.manual_evaluation` JSONB に書き込む）

## Existing Spec Touchpoints

- **Extends**: なし
- **Adjacent**:
  - `assessment-pattern-seed`: `assessment_pattern` のスキーマ + カテゴリ enum + 4 段階質問テンプレのカラム構造を前提とする。本 spec が読み取り側の仕様を確定
  - `authentication`: `user_profile` を読み取る、`requireSessionOwnership` で `interview_session.interviewer_id` をスコープチェック、`rate_limit` テーブルを `chat:userId` プレフィックスで再利用、smoke test ページ（`/admin/_health/`）を削除
  - `admin-review-panel`: 本 spec が定義する 6 テーブル（candidate / interview_session / question_proposal / interview_turn / pattern_coverage / session_report）を admin 側が読み取る。`pattern_coverage.llm_evaluation` JSONB の構造を権威定義（`{ authenticity, judgment, scope, meta_cognition, ai_literacy, notes, evaluated_at }`）、`pattern_coverage.manual_evaluation` JSONB の構造は admin-review-panel が権威定義（受け入れ側として nullable で受ける）
  - `multi-env-infrastructure`: `vercel.json` の Cron スケジュール（`/api/cron/audio-purge` を 03:00 JST 毎日）が共有契約

## Constraints

- **`tech.md` 準拠**:
  - Vercel AI SDK 6（`generateObject` 中心、`useChat`/`streamText` は使わない）
  - Anthropic Claude Sonnet 4.6
  - OpenAI Whisper API
  - Vercel Blob（30日後自動削除、Vercel Cron）
  - Zod で関数引数 + LLM 出力検証
  - LangChain / LangGraph / MCP サーバー / Redis キャッシュは使わない
- **`security.md` 準拠**:
  - LLM には関数経由でしか DB を引かせない（ハルシネーション防止）
  - `createLlmContext(ctx)` でクロージャに sessionId / userId を束縛
  - 1 ターン transcript 10000 文字、履歴全体 50000 文字の上限
  - 音声ファイル: 50MB / 10 分上限、`audio/webm` `audio/mp4` `audio/wav` のみ許可
  - LLM 出力（特に評価スコア）を DB 書き込み前に Zod 検証、範囲外なら安全側にフォールバック
  - システムプロンプトはユーザー入力でオーバーライド不可
  - 採用推奨コメントを LLM が生成しないよう、プロンプトで明示的に禁止
  - レート制限: 1 日 5 セッション、API 1 分 30 リクエスト、LLM 100 回/セッション、ターン 50 回/セッション、メッセージ 200 件/セッション
  - 面接官の認証ガード（`requireUser`）+ セッション所有権チェック（`requireSessionOwnership`）
  - Vercel Blob URL を Client Component に返さない（音声再生 UI は Stage 1 で持たない）
  - Vercel Cron 認証: `CRON_SECRET` Bearer トークン検証
  - CSP: `Permissions-Policy: microphone=(self)` を必ず含める
- **`assessment-design.md` 準拠**:
  - 面接アシスタント型（候補者は bulr 画面を見ない）
  - 4 段階深掘り構造、自然対話指針、矛盾検知ヒューリスティクス、AI 横断軸
  - 詰まり判定 4 種（not_experienced / shallow / single_option / rigid）
  - フリー質問の許容（pattern_id=null + pattern_match_confidence=off_pattern）、評価集約に含めず session_report に総評反映
  - AI は黒子、人間が決める（採用推奨を LLM に出させない）
- **`evaluation-rubric.md` 準拠**:
  - 5 次元スコア整数（authenticity 0-3 / judgment 0-3 / scope 1-5 / meta_cognition 0-3 / ai_literacy 0-3）
  - 2 段評価構成（interview_turn.llm_analysis + pattern_coverage.llm_evaluation）
  - LLM 自動評価 + 手動評価の二重スキーム（本 spec は llm_evaluation を書き込み、manual_evaluation は admin-review-panel 側で書き込み、本 spec のスキーマでは nullable で受ける）
  - level_reached 0-4
  - stuck_type enum
- **`structure.md` 準拠**:
  - データモデル原則: ターン単位の生データと パターン単位の集約を分離、フリー質問は pattern_id=null、物理削除基本（音声のみ自動削除）
  - 1 セッション最大 200 メッセージ、50 ターン
  - kebab-case ファイル、PascalCase コンポーネント、camelCase 関数、snake_case DB
  - `packages/types/src/profile.ts` / `evaluation.ts` を本 spec で初導入、exports map は monorepo-foundation で予約済み
  - `packages/db/src/queries/` サブディレクトリを本 spec で初導入、`packages/db/src/index.ts` のバレル export を更新
- **i18n**: Stage 1 は日本語のみ、ベトナム人候補者向けに英語応答も可能だが Stage 1 のシステムプロンプトは日本語ベース、生成出力も日本語
- **会話メモリ管理**:
  - 短期: DB から直近 5-10 ターンの transcript + llm_analysis を proposeNextQuestions / analyzeTurn のプロンプトに注入
  - 長期: pattern_coverage テーブルから現セッションの coverage を読み込み、「どのパターンが完了か / 未着手か」を LLM に伝える
- **コスト目安**: 1 セッション $1〜2（Whisper $0.006/min × 30 分 + Claude Sonnet 4.6 × 12 ターン × 平均 5K トークン）、70 セッション全体で $70〜200
- **テスト戦略**: Stage 1 は単体テスト最小限（Zod schema、LLM 出力検証、レート制限ロジック）+ 手動 E2E（自分で面接を完走）。自動 E2E（Playwright）は Stage 2
- **Runtime 選択**: `/api/interview/turns/next` は Edge ではなく `runtime = 'nodejs'`（Drizzle + pg.Pool 利用のため）
- **音声録音形式**: ブラウザの MediaRecorder で `audio/webm; codecs=opus` を優先、Safari 互換のため `audio/mp4` フォールバック
- **マイグレーションファイル名**: `packages/db/drizzle/*_assessment_engine.sql` の glob で参照（番号は drizzle-kit が決定）
