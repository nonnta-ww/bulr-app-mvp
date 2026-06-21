# Research & Design Decisions — ai-driven-development-survey

## Summary

- **Feature**: `ai-driven-development-survey`
- **Discovery Scope**: Extension（既存 skill-survey / self-analysis 基盤への統合）
- **Key Findings**:
  - 回答保存・集計・可視化・履歴・クールダウンはすべて `jobType` 単位で survey 非依存に動作する。新 survey は seed 追加だけで一覧・回答・自己分析に出現する。
  - 自己分析のソース構築（`analysis-source-query.ts`）は `question.scoringKind`（型 `ScoreKind | null`）をそのまま透過するため、`score_kind` enum に `'frequency'` を追加すれば型が自動的に広がり、ソース構築コードは無変更で頻度回答が `aggregate()` まで届く。
  - 自己分析の熟練度レーダー（`SkillBalanceRadar`）は `proficiencyScore === null` のカテゴリを既に除外する。頻度のみのカテゴリは proficiencyScore が null になるため、Req 7.5（頻度のみカテゴリを radar から除外しつつカバレッジは表示）は既存挙動で満たせる。
  - したがってコード変更は ①`score_kind` enum 値追加＋マイグレーション ②`aggregate()` への frequency 分岐 ③`CategoryCoverage` 型への frequency フィールド追加（任意・後方互換）④新 seed と登録 に限定される。フォーム描画・送信・必須判定・クールダウン・履歴・可視化コンポーネントは無変更。

## Research Log

### 既存スキーマと熟練度基盤の実在確認

- **Context**: 本 spec は `skill-survey-proficiency-scale` 基盤の再利用が前提。実在を確認する必要があった。
- **Sources Consulted**: `packages/db/src/schema/skill-survey.ts`, `packages/db/src/schema/self-analysis.ts`, `apps/candidate/app/self-analysis/_lib/aggregate.ts`, git log（task 5.1/5.2/6.1-6.3 のコミット）。
- **Findings**:
  - `skill_survey_choice.level integer`（nullable）/ `skill_survey_question.scoring_kind score_kind`（nullable）が実装済み。
  - `score_kind = pgEnum('score_kind', ['proficiency','recency'])`（migration 0017）。
  - `aggregate()` は proficiency（level 平均→0..100）と recency（level 最大＋ラベル）を独立系統で集計済み。`CategoryCoverage` は両者を optional フィールドで保持（旧スナップショット後方互換）。
  - 熟練度レーダー・カバレッジ表示は proficiency-scale で実装・マージ済み。
- **Implications**: 依存前提は満たされている。frequency は recency/proficiency と同じ「独立系統 optional フィールド」パターンで追加すればよい。

### 頻度回答の透過経路

- **Context**: 頻度設問の回答が集計まで届くか、ソース構築に改修が要るか。
- **Sources Consulted**: `packages/db/src/queries/self-analysis/analysis-source-query.ts`（L32-61, L160-180）。
- **Findings**: `AnswerForAnalysis.scoringKind: ScoreKind | null` は `question.scoringKind ?? null` をそのまま設定。`ScoreKind` は `(typeof scoreKind.enumValues)[number]` 派生型。
- **Implications**: enum に `'frequency'` を追加すれば `ScoreKind` が自動的に `'proficiency' | 'recency' | 'frequency'` へ広がり、ソース構築は無変更。`aggregate()` 側に分岐追加のみで完結。

### マイグレーション方式（pgEnum 値追加）

- **Context**: `score_kind` への `'frequency'` 追加をどう適用するか。
- **Sources Consulted**: `packages/db/drizzle.config.ts`, `packages/db/drizzle/0017_lyrical_malcolm_colcord.sql`, `packages/db/package.json`。
- **Findings**: `drizzle-kit generate` で `ALTER TYPE "public"."score_kind" ADD VALUE 'frequency';` の単一マイグレーションが生成される。migration コマンドは `DIRECT_URL > DATABASE_URL` を使う（drizzle.config.ts）。`pnpm --filter @bulr/db generate` / `migrate`。
- **Implications**: 追加のみで使用は seed（別トランザクション/ランタイム）で行うため、`ADD VALUE` がトランザクション内でも安全。drizzle-kit のローカル env 解決に注意（memory: drizzle-kit env resolution gotcha — DIRECT_URL+DATABASE_URL を inline 上書き推奨）。

### seed 構造と冪等 upsert

- **Context**: 新 seed をどの構造で作るか。
- **Sources Consulted**: `packages/db/src/seeds/skill-surveys/backend.ts`, `packages/db/src/seeds/index.ts`。
- **Findings**: `BackendSurveySeedData` 型付きデータ＋`runBackendSkillSurveySeed(db)` の冪等 upsert（survey: jobType / category: (surveyId,name,subcategory) / question: (categoryId,body) / choice: (questionId,label) を onConflictDoUpdate）。必須は `isRequired?` per-question 上書き or `REQUIRED_QUESTION_BODIES` 集合。`index.ts` の `main()` で run 関数を呼ぶ。
- **Implications**: 同型 `AiDrivenDevelopmentSurveySeedData`（scoringKind に `'frequency'` を許容）＋`runAiDrivenDevelopmentSkillSurveySeed(db)` を新規作成し index.ts に登録。必須3問は `isRequired: true` を明示（新 survey では body 集合より per-question 明示が単純で安全）。

## Design Decisions

### Decision: jobType モデリング = 独立 survey（案A）

- **Context**: AI 軸を既存職種アンケートに横断追加するか、独立 survey にするか。
- **Alternatives Considered**:
  1. 案A 独立 survey（`jobType='ai-driven-development'`）— 職種非依存・自己分析も独立スナップショット。
  2. 案B 各職種アンケートに AI セクション横断追加 — 職種ごとに seed 改訂が必要、重複管理増。
- **Selected Approach**: 案A。新 survey マスタ＋seed を 1 つ作る。
- **Rationale**: 既存基盤が survey 非依存に動くため案A は seed 追加だけで成立し、横断管理コストが無い。職種横断で全エンジニアに適用しうる本アンケートの性質にも合致。
- **Trade-offs**: 候補者は職種アンケートと AI アンケートの 2 つに回答する負荷があるが、自己分析が独立スナップショットとして整理される利点が上回る。

### Decision: 頻度集計 = `score_kind` に `'frequency'` を追加し独立系統で集計

- **Context**: 利用頻度・キャッチアップ頻度を熟練度と別軸で扱う。
- **Alternatives Considered**:
  1. `'frequency'` enum 追加（独立系統）。
  2. proficiency に寄せる（マイグレーション不要だが意味が混在）。
  3. 既存 `'recency'` を流用（マイグレーション不要だが「頻度」と「直近性」の意味ズレ）。
- **Selected Approach**: 案1（enum 追加）。`aggregate()` に frequency 分岐を追加し、`CategoryCoverage` に `frequencyScore`（level 平均→0..100, 寄与0なら null）と `answeredFrequencyCount` を optional 追加。proficiency 指標へは一切加算しない。
- **Rationale**: ユーザーが確定。意味的に正確で、proficiency/recency と同じ独立系統パターンに自然に乗る。後方互換（旧スナップショットは optional 欠落）。
- **Trade-offs**: マイグレーション 1 本と aggregate/型の小改修が必要。
- **Follow-up**: 既存 proficiency/recency の集計結果が不変であることをテストで担保（Req 9.3）。

### Decision: 可視化は既存コンポーネント再利用（新規 viz なし）

- **Context**: AI アンケートの自己分析表示をどう出すか（§6-3 併記 or 統合）。
- **Selected Approach**: 既存の自己分析自動検出（survey 単位カード）＋`CoverageBars`＋`SkillBalanceRadar` をそのまま再利用。AI アンケートは独立スナップショット／独立カードとして併記。頻度のみカテゴリは proficiencyScore=null により radar から自動除外され、カバレッジは表示される。
- **Rationale**: 既存が survey 非依存のため新規 UI 不要。境界を最小化。frequency の専用ビジュアルは現要件で必須でないため作らない（snapshot には保持し将来拡張に開く）。
- **Trade-offs**: 頻度スコアは snapshot に保持されるが当面 UI 未表示。要件上は独立集計（Req 4）を満たせば足り、表示は Req 7 の既存コンポーネント再利用で充足。

## Risks & Mitigations

- **enum 値追加マイグレーションの適用順** — frequency 設問を含む seed 投入前にマイグレーションを適用する必要がある。タスク順で「マイグレーション→seed」を固定し、CI/手順に明記。
- **drizzle-kit のローカル env 解決** — `.env.local` 末尾の例 URL を拾い local を上書きする既知問題（memory）。generate/migrate は DIRECT_URL+DATABASE_URL を inline 上書きで実行。
- **既存集計の非回帰** — frequency 分岐追加が proficiency/recency 経路に影響しないこと、既存 backend スナップショットが不変であることを `aggregate.test.ts` の追補で担保。
- **回答ボリューム過多** — AI 単一領域で過負荷にしない（Req 2.4）。設問数はカテゴリ毎に厳選し、必須は3問に限定。
- **カテゴリ subcategory=null による冪等性破壊（validate-design 指摘）** — category 一意インデックス `(skillSurveyId, name, subcategory)` は標準 unique index で NULL 非等価のため、`subcategory=null` だと `onConflictDoUpdate` がヒットせず seed 再実行で重複 INSERT。対策: 全カテゴリに非 null の安定 subcategory を付与（design Survey Content Blueprint の対応表）。seed 二重実行で重複ゼロをテストで担保（Req 8.2）。

## References

- `packages/db/src/schema/skill-survey.ts` — マスタ 4 階層・`score_kind` enum・`level`
- `packages/db/src/schema/self-analysis.ts` — `CategoryCoverage` / `AggregatedSnapshot`
- `apps/candidate/app/self-analysis/_lib/aggregate.ts` — 決定論的集計純関数
- `packages/db/src/queries/self-analysis/analysis-source-query.ts` — 回答ソース構築（scoringKind 透過）
- `packages/db/src/seeds/skill-surveys/backend.ts` / `seeds/index.ts` — 冪等 seed 規約
- `packages/db/drizzle/0017_lyrical_malcolm_colcord.sql` — enum 作成マイグレーション
