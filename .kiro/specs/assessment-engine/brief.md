# Brief: assessment-engine

## Problem

bulr の中核体験は **AI 対話型問診による実務判断力の可視化**。`product.md` の競争優位 #1「対話型経験問診」と #3「5 次元スコアリング」に直接対応する。これが提供できないと製品コンセプトそのものが成立しない。`docs/03-probe-logic.md` に質問ロジック設計、`docs/01-architecture-mvp.md` に AI 問診アーキテクチャ案、`evaluation-rubric.md` に評価ルーブリックがあるが、実装ゼロ。

## Current State

- `monorepo-foundation` で apps/web + packages/{db, types, lib, ai} スケルトンあり
- `multi-env-infrastructure` で `ANTHROPIC_API_KEY` 等の環境変数あり、Vercel Preview 動作確認可能
- `authentication` で `requireUser`、`authedAction`、`user_profile` テーブル、Magic Link サインインフローあり
- `assessment-pattern-seed` で `assessment_pattern` テーブルに 57 パターン × 4 段階質問テンプレ投入済み
- `assessment_session` / `assessment_answer` / `chat_message` テーブル未定義
- `packages/ai` は依存追加のみ、Tool 実装なし

## Desired Outcome

- 受験者は Magic Link サインイン → 受験プロファイル入力（経験年数等）→ 問診開始 → LLM と 30〜40 分対話 → 完了画面、というフローを完走できる
- LLM は 4 段階深掘り（経験有無 → 真贋 → 判断力 → メタ認知）を 5〜10 パターン分実施
- 各パターン回答は構造化されて `assessment_answer` テーブルに保存（段階別自由テキスト + LLM 評価 5 次元 JSONB + level_reached）
- 全対話は `chat_message` テーブルに時系列保存（後でデバッグ・問診改善に使う）
- AI 応答は SSE ストリーミング（Vercel AI SDK 6 の `useChat`）で逐次表示
- LLM は 5 ツール（`selectNextPattern`、`recordAnswer`、`evaluateAnswer`、`generateFollowUp`、`finalizeSession`）経由でしか DB に触れない
- 詰まり判定（4 種：not_experienced / shallow / single_option / rigid）で次パターンへ自然移行
- AI 活用横断軸の問いを各パターン第 4 段の最後に差し込む
- セッション中断・再開可能（途中で離脱して後日続きを受けられる）
- レート制限: 1 日 1 セッション、API 1 分 20 リクエスト、maxSteps=10
- LLM コスト目安: 1 セッション $1〜2、70 セッション全体で $50〜150

## Approach

`docs/03-probe-logic.md` の質問ロジック設計を実装に落とす。Vercel AI SDK 6 の `streamText` + Tool Use + `useChat` フックで対話型 UI を構築。Tool 実装は `packages/ai` に集約、UI は apps/web に。

- **状態機械**: LLM が `selectNextPattern` で次のパターンを選択 → 第 1 段の質問を生成 → 受験者回答 → `recordAnswer` で第 1 段保存 → 第 2 段の深掘り質問生成 → ... → 第 4 段完了で `evaluateAnswer` 呼び出し → 5 次元スコア + level_reached 保存 → 次パターンへ。詰まり判定は `generateFollowUp` Tool で内部的に行う（または LLM のプロンプト指示で判定）
- **システムプロンプト**: `assessment-design.md` の自然対話指針 + `evaluation-rubric.md` のスコアリング基準 + 4 段階深掘り構造 + AI 横断軸を反映。プロンプトは `packages/ai/src/prompts/assessment-system-prompt.ts` に集約、ユーザー入力でオーバーライド不可
- **Tool 実装**: `packages/ai/src/tools/` に 5 つの Tool を Zod スキーマ + `createTools(ctx)` のクロージャ束縛で実装。各 Tool はサーバーサイドから Drizzle 経由で DB アクセス
- **UI**: `apps/web/app/(assessment)/assessments/[sessionId]/page.tsx` で `useChat` フック + チャット風 UI（メッセージリスト + 入力欄）。shadcn/ui ベース、Tailwind 4
- **API**: `apps/web/app/api/chat/route.ts` で `streamText` + Tool Use + 認証ガード（`requireUser` + `requireSessionOwnership`）+ レート制限
- **受験プロファイル**: 受験開始時にフォームで経験年数 / 扱った言語 / 関わったシステム種別を入力 → `assessment_session.profile_input` JSONB 保存 → システムプロンプトに動的注入してパターン優先順位付けに使う
- **会話メモリ**: 短期は `useChat` messages 配列の直近 20-30 ターンを送信。長期は `assessment_answer` テーブルに段階別保存（後で再開時にコンテキストとして送信可能）
- **完了処理**: `finalizeSession` Tool で `assessment_session.status = 'completed'`、`completed_at` 記録、ユーザーを `/assessments/done` にリダイレクト

## Scope

- **In**:
  - DB スキーマ: `assessment_session`（id / user_id / status / profile_input JSONB / role / started_at / completed_at）、`assessment_answer`（id / session_id / pattern_id / level_reached / level_1_answer 〜 level_4_answer / llm_evaluation JSONB / manual_evaluation JSONB / created_at）、`chat_message`（id / session_id / role / content / tool_calls JSONB / created_at）
  - drizzle-kit migration（dev branch にスキーマ反映）
  - 受験プロファイル入力フォーム: `apps/web/app/(assessment)/assessments/start/page.tsx` の続き（または新規ページ）。経験年数 / 扱った言語 / 関わったシステム種別を Zod で検証
  - セッション作成 Server Action: `authedAction` ラッパーで `assessment_session` レコード作成、profile_input を保存、`/assessments/[sessionId]` にリダイレクト
  - チャット UI: `apps/web/app/(assessment)/assessments/[sessionId]/page.tsx`（`useChat` フック、メッセージレンダリング、入力欄、ストリーミング表示、進捗インジケータ）
  - チャット API: `apps/web/app/api/chat/route.ts`（`streamText` + Tool Use + 認証 + レート制限 + sessionId/userId のクロージャ束縛）
  - LLM Tool 実装（`packages/ai/src/tools/`）:
    - `selectNextPattern`: 受験プロファイル + 既回答パターンから次のパターンを選択
    - `recordAnswer`: 段階別回答を `assessment_answer` に保存（段階ごとに upsert）
    - `evaluateAnswer`: パターン完了時に 5 次元スコア + level_reached を計算して保存
    - `generateFollowUp`: 詰まり判定 + 別パターン提示判断（または LLM プロンプトで内部処理）
    - `finalizeSession`: セッション完了処理
  - システムプロンプト: `packages/ai/src/prompts/assessment-system-prompt.ts`（4 段階深掘り構造 + 自然対話指針 + AI 横断軸 + 詰まり判定ルール + プロンプト注入対策）
  - LLM 出力の Zod 検証（特に `evaluateAnswer` のスコア値が整数 + 範囲内）
  - レート制限: 受験者あたり 1 日 1 セッション（同 user_id で in_progress / completed のセッションが既にあれば作成拒否）、API 1 分 20 リクエスト
  - maxSteps=10 でツール無限ループ防止
  - セッション中断・再開: 受験者がブラウザを閉じても `assessment_session.status = 'in_progress'` で残り、再アクセスで続きから（チャット履歴を `chat_message` から復元）
  - 完了画面: `apps/web/app/(assessment)/assessments/done/page.tsx`（シンプルなお礼 + 「結果は後日連絡」表示）
  - チャット履歴上限: 1 セッション最大 200 メッセージで打ち切り
  - 受験プロファイルに応じたカテゴリ重み付け（例：「組織判断経験あり」と申告した受験者には O カテゴリを多めに、Stage 1 では LLM プロンプトで簡易実装）

- **Out**:
  - 管理画面（admin-review-panel spec）
  - ヒートマップ可視化（admin-review-panel spec で簡易版、フル機能は Stage 2）
  - PostHog / Sentry / Helicone（Stage 2）
  - 複数職種対応（フロントエンド / SRE / PdM、Stage 2）
  - 多言語対応（next-intl、Stage 2）
  - パターン編集 UI（Stage 2）
  - 受験者向けの過去結果ページ（Stage 2、Stage 1 は受験完了で終わり）
  - メール通知（受験完了時の創業者通知等、Stage 2）
  - 招待リンク機能（Stage 2、Stage 1 は受験者にリンクを手動共有）

## Boundary Candidates

- DB スキーマ（`packages/db/src/schema/assessment-session.ts`、`assessment-answer.ts`、`chat-message.ts`）
- LLM Tool 5 種（`packages/ai/src/tools/`）
- システムプロンプト（`packages/ai/src/prompts/`）
- チャット API ルート（`apps/web/app/api/chat/route.ts`）
- チャット UI（`apps/web/app/(assessment)/assessments/[sessionId]/`）
- 受験プロファイル入力フォーム（`apps/web/app/(assessment)/assessments/start/`、authentication spec の続きとして配置）
- セッション作成 Server Action（`apps/web/lib/actions/create-session.ts`）
- 完了画面（`apps/web/app/(assessment)/assessments/done/`）
- LLM 出力検証ヘルパー（`packages/ai/src/lib/validate-evaluation.ts`）

## Out of Boundary

- 管理画面の機能ページ（`admin/sessions/` 等、admin-review-panel spec）
- 創業者の手動評価入力 UI（admin-review-panel spec）
- LLM 評価と手動評価の突合表示（admin-review-panel spec）
- ヒートマップフル機能（Stage 2）
- 受験者の過去結果閲覧（Stage 2）
- 求人マッチング、企業向けダッシュボード（Stage 2 以降）

## Upstream / Downstream

- **Upstream**:
  - `monorepo-foundation`（packages/db、packages/ai、apps/web の基盤）
  - `multi-env-infrastructure`（ANTHROPIC_API_KEY、DATABASE_URL、Vercel デプロイ）
  - `authentication`（`requireUser`、`authedAction`、`requireSessionOwnership`、user_profile）
  - `assessment-pattern-seed`（`assessment_pattern` テーブルと 57 パターンデータ）
- **Downstream**:
  - `admin-review-panel`（`assessment_session`、`assessment_answer`、`chat_message` を読み取り、`assessment_answer.manual_evaluation` を書き込む）

## Existing Spec Touchpoints

- **Extends**: なし
- **Adjacent**:
  - `assessment-pattern-seed`: `assessment_pattern` のスキーマと 4 段階質問テンプレのカラム構造を前提とする。本 spec が読み取り側の仕様を確定
  - `authentication`: `user_profile` を読み取る、`requireSessionOwnership` で `assessment_session.user_id` をスコープチェック
  - `admin-review-panel`: 本 spec が定義する 3 テーブル（`assessment_session`、`assessment_answer`、`chat_message`）を admin 側が読み取る。スキーマ変更時は両 spec の review を巻き込む

## Constraints

- **`tech.md` 準拠**:
  - Vercel AI SDK 6（`useChat`、`streamText`、`ToolLoopAgent`）
  - Anthropic Claude Sonnet 4.6
  - Zod でツール定義 + LLM 出力検証
  - `maxSteps: 10`（4 段階 × 5〜10 パターン + 評価 + 完了想定）
  - LangChain / LangGraph / MCP サーバー / Redis キャッシュは使わない
- **`security.md` 準拠**:
  - LLM にはツール経由でしか DB を引かせない（ハルシネーション防止）
  - `createTools(ctx)` でクロージャに sessionId / userId を束縛
  - 1 メッセージ 2000 文字、履歴全体 50,000 文字の上限
  - LLM 出力（特に評価スコア）を DB 書き込み前に Zod 検証
  - システムプロンプトはユーザー入力でオーバーライド不可
  - レート制限: 1 日 1 セッション、API 1 分 20 リクエスト、maxSteps=10
  - 受験者の認証ガード（`requireUser`）+ セッション所有権チェック（`requireSessionOwnership`）
- **`assessment-design.md` 準拠**:
  - 4 段階深掘り構造（経験有無 → 真贋 → 判断力 → メタ認知）
  - セッション全体構造（0-5 分イントロ / 5-10 分ブロードサーベイ / 10-35 分ディープダイブ / 35-40 分クロージング）
  - 詰まり判定 4 種（not_experienced / shallow / single_option / rigid）
  - AI 活用横断軸（各パターン第 4 段最後に差し込み + セッション末の総括問い）
  - 自然対話の振る舞い指針（オープンクエスチョン優先、続きを促す、相槌と要約、時間管理、詰まり時の救済）
  - 矛盾検知のヒューリスティクス（詰問せず別の角度から確認）
- **`evaluation-rubric.md` 準拠**:
  - 5 次元スコア（authenticity 0-3 / judgment 0-3 / scope 1-5 / meta_cognition 0-3 / ai_literacy 0-3）整数値
  - LLM 自動評価 + 手動評価の二重スキーム（本 spec は LLM 評価を `llm_evaluation` JSONB に保存、`manual_evaluation` は admin-review-panel 側で書き込み）
  - level_reached 0-4
- **`structure.md` 準拠**:
  - データモデル原則: チャット履歴は別テーブル、回答は段階別カラム + JSONB 評価、物理削除基本
  - 1 セッション最大 200 メッセージ
- **i18n**: Stage 1 は日本語のみ、ベトナム人受験者向けに英語応答も可能だが Stage 1 のシステムプロンプトは日本語ベース
- **会話メモリ管理**: 短期は `useChat` messages 直近 20-30 ターン、長期は `assessment_answer` テーブル
- **コスト目安**: 1 セッション $1〜2（30-40 分 × Claude Sonnet 4.6）、70 セッション全体で $50〜150
- **テスト戦略**: Stage 1 は単体テスト最小限（Tool の Zod schema、レート制限ロジック）+ 手動 E2E（自分で受験を完走）。自動 E2E（Playwright）は Stage 2
