# Research & Design Decisions

## Summary

- **Feature**: `skill-survey-proficiency-scale`
- **Discovery Scope**: Extension（既存 skill-survey / candidate-self-analysis / self-analysis-history の拡張）
- **Key Findings**:
  - `skill_survey_choice` は `label` と `displayOrder` のみ。level/weight/score 列は存在しない。
  - 回答は `skill_survey_answer.selected_choice_ids`(text[]) ＋ `free_text` で保存。`single_choice` も配列に1件入る形。
  - フォーム `survey-form.tsx` は `questionType` 分岐の型駆動。`single_choice` レンダリングは既存で、熟練度4段階はそのまま `single_choice` として描画できる（新レンダリング不要）。
  - 集計 `aggregate.ts` は純関数でカバレッジのみ算出（熟練度概念なし）。`AggregatedSnapshot`(jsonb) は版管理で追記型のため後方互換が取りやすい。
  - 可視化は Tailwind バー。`recharts@^3.8.1` は `apps/candidate` に導入済み（self-analysis-history で利用）→ レーダーは新規依存なしで追加可能。
  - 分析ソースクエリ `analysis-source-query.ts` は選択肢を **label にのみ解決**している。熟練度スコアには **level の解決**と**設問の scoringKind**の伝播が追加で必要。

## Research Log

### 既存スキーマと回答保存モデル

- **Context**: 熟練度・recency をどこに保持するか（マスタ側 vs 回答側）。
- **Sources Consulted**: `packages/db/src/schema/skill-survey.ts`, `skill-survey-response.ts`, `self-analysis.ts`, `seeds/skill-surveys/backend.ts`。
- **Findings**:
  - choice は master、answer は `selected_choice_ids` 参照。`single_choice` の選択肢を「レベル」にすれば、レベル値は **choice のメタデータ**として持てる。
  - 回答保存・必須判定・送信アクションは `single_choice` 経路で完結しており無改修で流用可能。
- **Implications**: 熟練度は **choice.level**（マスタ）に持たせ、回答は既存の選択肢ID保存をそのまま使う。回答テーブル・送信経路の変更は不要。

### 設問種別の判別（スコアリングの分類）

- **Context**: 熟練度 single_choice と recency single_choice はどちらも「level を持つ序数選択」。集計時に「熟練度に寄与する設問」「recency 補正設問」「広さ（インベントリ）設問」「深掘り自由記述」を区別する必要がある。
- **Findings**: `questionType` の enum を増やすとフォームの分岐改修が波及する。種別判別のためだけに questionType を拡張するのは過剰。
- **Implications**: `questionType` は変更せず、**別の nullable 列 `scoringKind`（'proficiency' | 'recency'）** を question に追加。null は従来通り（インベントリ/自由記述/未分類）。フォームは questionType で描画し、集計は scoringKind で分類する（関心の分離）。

### 可視化ライブラリ

- **Context**: スキルバランスのレーダー表示を新規依存なしで実現したい。
- **Findings**: `apps/candidate/package.json` に `recharts@^3.8.1` が既存。self-analysis 配下では未使用（バーのみ）だが依存は導入済み。
- **Implications**: `recharts` の `RadarChart` を採用。新規依存・ライセンス確認は不要。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
| --- | --- | --- | --- | --- |
| A. choice.level（マスタ・採用） | 熟練度/recency を選択肢の level メタデータで持ち、回答は既存の選択肢ID保存を流用 | スキーマ変更最小（2列追加）。回答・送信・必須判定が無改修。後方互換が容易 | 集計が choice.level を解決する経路の追加が必要 | **採用** |
| B. answer に proficiencyLevel/recencyMonths 列追加 | 回答側に数値列を持つ | 回答単位で直接数値を持てる | 送信アクション・回答型・フォーム送信payloadの改修が波及。`single_choice` 流用の利点を失う | 不採用 |
| C. 専用 question_type enum 追加（likert/recency） | フォームに専用UI | UX が専用化できる | questionType 分岐・バリデーション・送信に波及。今回の最小化方針に反する | Phase2 のUX強化候補 |

## Design Decisions

### Decision: 熟練度・recency は choice.level ＋ question.scoringKind で表現する

- **Context**: 能力系設問の4段階化と recency 軸を、回答負荷・実装波及・後方互換を抑えて導入する（Req 1, 3, 5）。
- **Alternatives Considered**:
  1. A. choice.level（マスタ側メタデータ）＋ scoringKind 分類
  2. B. answer 側に数値列追加
  3. C. questionType enum 拡張＋専用UI
- **Selected Approach**: A。`skill_survey_choice.level`(integer, nullable) に序数を持たせ、`skill_survey_question.scoringKind`('proficiency'|'recency', nullable) で集計分類する。フォームは `single_choice` を流用（描画無改修）。
- **Rationale**: スキーマ変更が nullable 2列に収まり、回答保存・送信・必須判定・既存版管理に手を入れずに済む。questionType を据え置くことでフォーム分岐の回帰リスクを排除できる。
- **Trade-offs**: 集計層で level/scoringKind を解決する経路を追加する必要がある（`analysis-source-query` と `aggregate` の拡張）。専用スケールUIは持たない（Phase2）。
- **Follow-up**: 旧回答（level 無し）を null-safe に集計すること、seed の冪等 upsert が新列を反映することを実装・テストで担保。

### Decision: 熟練度スコアはカテゴリ単位の決定論的算術（既存純関数を拡張）

- **Context**: カテゴリ別熟練度をスコア化し、カバレッジとは別指標として可視化する（Req 5, 6）。`aggregate.ts` は「同一入力→同一出力」の純関数。
- **Selected Approach**: カテゴリごとに scoringKind='proficiency' の回答の level（0–3）平均を 0–100 に正規化して `proficiencyScore` とする。recency は scoringKind='recency' の level を `recencyOrdinal` として併記し、補正後スコア（任意）も決定論的に算出。`AggregatedSnapshot.CategoryCoverage` に optional フィールドを追加し後方互換を保つ。
- **Rationale**: 既存の純関数・スナップショット永続化の枠組みに自然に乗る。LLM やライブラリを増やさない。
- **Trade-offs**: スコア式は単純平均ベース（重み付けは将来拡張余地）。
- **Follow-up**: 旧スナップショット（proficiencyScore 無し）を表示側で null 安全に扱う。

### Decision: スキルバランス可視化は recharts RadarChart を採用

- **Context**: 候補者がスキルバランスを一目で把握できる図が必要（Req 6.1）。
- **Selected Approach**: 既存依存 `recharts` の `RadarChart` でカテゴリ別 `proficiencyScore` を描画。既存カバレッジバーは併存。
- **Rationale**: 新規依存なし。self-analysis-history で実績のあるライブラリ。
- **Trade-offs**: なし（既存スタック内）。

## Risks & Mitigations

- **後方互換**: 旧 `AggregatedSnapshot`／旧回答は新フィールドを持たない → 集計・表示を optional/null-safe に実装し、データ不足時は空表示（Req 5.4, 6.3, 8.2）。
- **seed 冪等性**: 既存マスタへ level/scoringKind を反映する upsert が重複・不整合を生まないこと（Req 8.3）→ upsert キー（survey/name/sub, category/body, question/label）を維持しつつ列を更新。
- **回答負荷増**: recency・代表習熟度・深掘りの追加で設問増 → recency はカテゴリ最大1問、深掘りは任意（Req 3.3, 4.2）に制限。
- **集計経路の追加**: `analysis-source-query` が label のみ解決 → level/scoringKind 解決を追加する箇所が複数クエリに波及しないよう `buildResponseBundle` 一箇所に集約。

## References

- 既存実装: `apps/candidate/app/self-analysis/_lib/aggregate.ts`, `packages/db/src/queries/self-analysis/analysis-source-query.ts`, `packages/db/src/schema/self-analysis.ts`, `apps/candidate/app/skill-survey/_lib/survey-structure.ts`
- 既存 spec: `.kiro/specs/skill-survey`, `.kiro/specs/candidate-self-analysis`, `.kiro/specs/self-analysis-history`
- ステアリング: `.kiro/steering/product.md`（広さ×深さ×意思決定射程／真贋判別）
