# Brief: skill-survey

## Problem

候補者の「実力の棚卸し」を構造化して受け取る経路が無い。設計メモ §9 L1 が候補者MVPの中核に位置付ける「自己診断 → 構造化スキル像」がプロダクトに存在せず、roadmap.md §10 のデータオーナーシップ2層を支える「候補者所有の構造化スキルデータ」も無い。

同時に Wave 3 `session-from-entry` は「スキルアンケート結果からのパターン選定支援」（設計メモ §8 / §11）を前提に組まれており、本 spec が `skill_survey_response` を出力しないとその支援が成立しない。

設計メモ §2 で「形式は静的な構造化フォーム（選択式中心＋一部記述）、`backend-skills.csv` を素材、LLM 不要」と確定している。

## Current State

- 素材: `docs/backend-skills.csv` がカテゴリ / サブカテゴリ / 質問 / 選択肢の構造で存在（バックエンド職種）。シードとして直接投入可能な形
- `skill_survey` / `skill_survey_response` テーブルは未実装
- `apps/candidate` 側にスキルアンケート UI は無い
- Stage 1 の `assessment-pattern-seed` 先例が「マスタを TS 配列 → drizzle seed」で投入する pattern を確立済み（同じ手法を踏襲可能）
- 設計メモ §11 でマスタは「`admin-operations` の CMS を待たず、当面シードスクリプトで投入できる」と明示

## Desired Outcome

- 候補者は `bulr.net/skill-survey` で職種別の静的構造化フォームに回答できる（バックエンド職種から開始）
- 回答は `skill_survey_response` として `candidate_profile.id` に紐づき保存される（同一カテゴリで再回答 = 最新版を保持）
- 候補者は回答後、自分のスキル像が **「L1 棚卸し結果」** として構造化表示で返ってくる（数値スコア・他者比較は出さない。設計メモ §9 L3 注記準拠）
- マスタ（`skill_survey`）は drizzle seed スクリプト 1 本で投入され、構造変更は seed の再実行で反映される
- Wave 3 `session-from-entry` が「`candidate_profile_id` → 最新の `skill_survey_response`」を読み出してパターン選定の入力にできる API / 読み出し関数を提供
- LLM は不要（静的構造化フォームのまま完結）

## Approach

- **マスタスキーマ**: `packages/db/src/schema/skill-survey.ts` に
  - `skill_survey`（職種別の survey 単位）
  - `skill_survey_category`（カテゴリ）
  - `skill_survey_question`（設問・タイプ＝単一選択 / 複数選択 / 自由記述）
  - `skill_survey_choice`（選択肢）
  を多階層で定義。CSV 構造に合わせる
- **シード**: `packages/db/src/seeds/skill-surveys/` 配下に backend.ts を新設し、`backend-skills.csv` を TS リテラル化（既存 `assessment-patterns.ts` パターン踏襲）。Stage 1 の seed 構造に合わせて `packages/db/src/seeds/index.ts` から呼び出す
- **回答スキーマ**: `packages/db/src/schema/skill-survey-response.ts` に
  - `skill_survey_response`（candidate_profile_id × skill_survey の最新回答 1 件 / 履歴を持つかは design で決定）
  - `skill_survey_answer`（question_id × choice_id[] or free_text）
- **回答 UI**: `apps/candidate/app/skill-survey/page.tsx` 入口、`apps/candidate/app/skill-survey/[surveyId]/page.tsx` で回答フォーム。マスタ駆動で動的にレンダリング（カテゴリ → サブカテゴリ → 設問）。Server Action で送信
- **L1 結果表示**: `apps/candidate/app/skill-survey/[surveyId]/result/page.tsx` で「回答済みカテゴリ / 自己選択した経験 / 自由記述要約」を構造化表示。数値化・スコア化・他者比較は出さない
- **読み出し API**: `packages/db/src/queries/skill-survey/` を新設し、`getLatestResponseByCandidateProfileId(...)` 等を提供。Wave 3 `session-from-entry` がこれを利用
- **入力検証**: zod スキーマで候補者からの送信ペイロードを検証（`packages/types` か `apps/candidate` 内に置くかは design で決定。apps → packages 単方向を遵守）

## Scope

- **In**:
  - `skill_survey` / カテゴリ / 設問 / 選択肢 マスタ Drizzle スキーマ + マイグレーション
  - `skill_survey_response` / `skill_survey_answer` Drizzle スキーマ + マイグレーション
  - バックエンド職種 1 件分の seed スクリプト（`backend-skills.csv` を元に）
  - `apps/candidate/app/skill-survey/*` の回答フォーム / 結果表示 UI
  - 候補者所有回答の読み出し queries（Wave 3 から利用可能な形）
  - 同一 survey の再回答ロジック（最新版保持の意味論を design で確定）
  - `requireCandidate` ガード経由のアクセス制御（[[candidate-auth-onboarding]] 依存）
- **Out**:
  - 複数職種の survey（バックエンド以外。後続 spec or 同 spec 拡張）
  - LLM によるスキル要約・自然言語フィードバック（→ Wave 4 [[mock-interview]] の事後フィードバックに吸収）
  - 年収査定・キャリア相談（roadmap.md L3 は保留、L2 は L4 吸収）
  - `assessment_pattern` 選定ロジック（Wave 3 [[session-from-entry]] 担当）
  - admin CMS でのマスタ管理（Wave 4 [[admin-operations]] 担当）
  - 履歴書（Wave 2 [[resume-registration]]）

## Boundary Candidates

- スキルアンケートマスタスキーマ（survey / カテゴリ / 設問 / 選択肢）
- 候補者回答スキーマ（response / answer）
- マスタ seed スクリプト（バックエンド職種）
- 回答 UI（動的マスタ駆動レンダリング）
- L1 棚卸し結果表示 UI
- 候補者回答読み出し queries（Wave 3 で利用される seam）

## Out of Boundary

- AI 解析 / LLM 要約 / 数値スコア化（設計メモ §9 L3 注記で明示却下）
- `assessment_pattern` への接続（Wave 3 [[session-from-entry]]）
- admin CMS でのマスタ管理（Wave 4 [[admin-operations]]）
- 履歴書（[[resume-registration]]）
- スカウト用プロフィールへの discoverable 公開（Wave 5+）

## Upstream / Downstream

- **Upstream**:
  - [[candidate-auth-onboarding]] — `candidate_profile.id` と `requireCandidate` を必須前提
  - 既存 `docs/backend-skills.csv` がマスタ素材
  - Stage 1 `assessment-pattern-seed` — シード手法の先例
- **Downstream**:
  - [[entry-flow]]（Wave 3）— エントリー時に最新回答をスナップショット参照
  - [[session-from-entry]]（Wave 3）— 回答からパターン選定支援
  - [[mock-interview]]（Wave 4）— L4 が L1 結果を参照して模擬面接の重点を決める
  - [[admin-operations]]（Wave 4）— マスタ CMS

## Existing Spec Touchpoints

- **Extends**: なし（新規エンティティ）
- **Adjacent**:
  - Stage 1 `assessment-pattern-seed`（seed パターン手法の流用元・マスタ並行管理）
  - [[candidate-auth-onboarding]]（同じ `candidate_profile` を所有）
  - [[resume-registration]](同じ `candidate_profile` を所有・独立データ)

## Constraints

- 静的構造化フォーム（選択式中心＋一部記述）。LLM 不要（設計メモ §2 で確定）
- 数値スコア・年収・他者比較は出さない（設計メモ §9 L3 注記準拠）
- 「将来像は見据えるが、実装は最小」原則（roadmap.md §Stage 2 制約）
- 既存 monorepo の seed 構造に合わせる（Stage 1 `assessment-pattern-seed` 先例）
- packages → apps の依存方向は単方向（参照: `feedback_package_dependency_direction.md`）
- 日本語 UI / 日本語マスタのみ（`packages/i18n` は作らない）
- Wave 3 `session-from-entry` が読み出す read API の安定性を保証
