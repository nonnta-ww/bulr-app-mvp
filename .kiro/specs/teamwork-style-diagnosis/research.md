# Research & Design Decisions — teamwork-style-diagnosis

## Summary

- **Feature**: `teamwork-style-diagnosis`
- **Discovery Scope**: Extension（既存 diagnosis ファミリーへの加算的複製）
- **Key Findings**:
  - thinking-style-diagnosis が確立した層構成（app-local `_lib` 純関数コア → Server Component ページ → 表示コンポーネント → `packages/db` の survey id/回答 query → seed）をそのまま複製できる。worklife-disposition も同型の2例目として存在。
  - 一覧除外は `answered-surveys-query.ts` の `eq(skillSurvey.kind, 'skill')` により、`kind != 'skill'` の診断 survey が**自動的に除外**される。追加 kind に対する**コード改修は不要**（検証テストの追加のみ）。
  - スキーマ変更は `survey_kind` enum への値追加 migration（`0021_optimal_ravenous.sql` が `thinking_style` 追加の先例。1行 `ALTER TYPE ... ADD VALUE`）と、pgEnum 配列リテラル・seed runner の `kind` union 型追加のみ。テーブル追加・変更なし。
  - 設問形式は既存 `question_type`（single_choice/multi_choice/free_text）のまま。二者択一・SJT ともに `single_choice` で表現でき、`question_type` enum の変更は不要。

## Research Log

### 既存 diagnosis 実装パターンの棚卸し

- **Context**: 本 spec は thinking-style を加算複製する。正確なファイル構成と契約を把握する必要がある。
- **Sources Consulted**（実ファイル確認）:
  - `apps/candidate/app/_lib/thinking-style/`（axes.ts / score.ts / answers.ts / archetypes.ts、index/types なし）
  - `apps/candidate/app/thinking-style-diagnosis/page.tsx` ＋ `_components/`（axis-bars / thinking-style-result / thinking-style-share-panel）
  - `packages/db/src/queries/thinking-style/`（get-thinking-style-survey-id / candidate-thinking-style-response / index）、`queries/index.ts` で barrel 再export
  - `packages/db/src/seeds/skill-surveys/thinking-style.ts`（`runThinkingStyleSkillSurveySeed`）、`runner.ts`（`runSkillSurveySeed` 汎用 4階層 upsert）、`seeds/index.ts`（static＋dynamic import 登録）
  - `packages/db/src/schema/skill-survey.ts`（`surveyKind` pgEnum）、`packages/db/drizzle/0021_optimal_ravenous.sql`
  - `apps/candidate/app/_components/nav-items.ts`（ナビ入口）
  - `packages/db/src/queries/self-analysis/answered-surveys-query.ts`（`kind='skill'` フィルタ）、`packages/db/src/__tests__/thinking-style-list-exclusion.integration.test.ts`
- **Findings**: 上記 Summary の通り。thinking-style は 5段階 Likert（4軸×6問、natural3＋reverse3）を `score.ts` で 0–100 正規化・平均・中点50で二値化している。
- **Implications**: teamwork-style は同じ層構成を複製する。ただし設問形式が異なる（Likert ではなく二者択一＋SJT）ため、`score.ts` のスコアリングと `answers.ts` のマッピングは形式に合わせて再設計する（下記 Decision 参照）。表示・query・seed・登録・除外の各契約は thinking-style を踏襲する。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
| --- | --- | --- | --- | --- |
| A. thinking-style 骨格を加算複製（採用） | app-local 純関数コア＋Server Component＋seed＋query を複製し、固有部（二者択一スコア・SJT・カルチャー親和性・成長アドバイス）だけ新設 | 既存3例と一貫・既存無改修・レビュー容易 | コア（axis-bars 等）の重複が3例目で顕在化 | 共通基盤抽出は本 spec では非対象（Non-Goal）。将来別 spec |
| B. 診断ファミリー共通基盤を先に抽出してから載せる | axis-bars/score/result を汎用化し teamwork-style を第1消費者に | 重複解消 | thinking-style も同時改修＝既存無改修の原則を破る・スコープ肥大 | 却下 |

## Design Decisions

### Decision: レイヤー1 二者択一のスコアリング

- **Context**: thinking-style は Likert 平均だが、本 spec のレイヤー1は「両選択肢とも好ましい二者択一」。各回答は極（低/高）の直接ピック。
- **Alternatives Considered**:
  1. Likert 流用（5段階） — 「盛られやすい」問題が残るため要件（R4.6）に反する
  2. 二者択一の極ピック多数決（採用）
- **Selected Approach**: 各軸に奇数 N 問の二者択一を割り当て、各選択肢を軸の低極/高極へ写像（`choice.level`＝0:低極 / 1:高極）。軸ごとに高極ピック率を 0–100 に正規化し、中点50で二値化。同数（該当時）は既定極＝第1極を採用（thinking-style の balanced→第1極 規約と整合）。reverse 概念は不要（選択肢が極を直接示すため）。
- **Rationale**: thinking-style の normalize→average→binarize の骨格を保ちつつ、per-answer 値の出所を Likert から choice→pole へ差し替えるだけで済む。決定論（R4.2）と非評価（R4.5）を満たす。
- **Trade-offs**: 軸あたり問数を奇数にする作問制約が生じるが、タイ処理を既定極フォールバックにすれば偶数でも破綻しない。
- **Follow-up**: 軸あたり問数は tasks/seed 作成時に確定（Open Question）。

### Decision: レイヤー2 SJT → 成長ディメンションの提示

- **Context**: 自己認識・他者視点・感情の自己制御を、自己申告ではなく状況判断（SJT）から推定し、非評価の成長アドバイスとして提示する（R5）。
- **Selected Approach**: 各 SJT 設問を1つの成長ディメンションへ割り当て、選択肢に発達度 `choice.level`（例 0..2、低→高）を付与。ディメンションごとに回答済み選択肢の level を集約し、内部段階（emerging/developing/strong）を決めるが、**画面には数値・段階ラベルを出さず、段階に対応する手書きの成長アドバイス文のみ**を提示する。ディメンションは回答が1件以上ある場合に提示する。
- **Rationale**: 「盛り」に強く（R5.2）、合否スコア非提示（R5.3）・比較なし（R5.4）を満たす。
- **Trade-offs**: 段階→アドバイス文の手書きコンテンツ作成コスト（3ディメンション×段階数）。
- **Follow-up**: SJT シナリオ初期セットは派生 spec B への流用を見据えて汎用シーンを選ぶ（Open Question）。

### Decision: レイヤー3 カルチャー親和性の決定論導出

- **Context**: 4軸の確定結果から「どんなカルチャーで活きるか」を一方向に導出（R6）。
- **Selected Approach**: app-local 純関数 `deriveCultureAffinity(code)` が 4軸コード → キュレーテッドなカルチャー親和性（少数のカルチャー型）へ写像。特定企業適合や合否は扱わない（R6.2）。レイヤー1が未確定なら導出しない（R6.3）。
- **Rationale**: LLM 非依存・決定論・非永続の家族方針と整合。個人起点の一方向写像なので「本人×特定チーム」予測の危険（差別・法的リスク）を回避。
- **Trade-offs**: カルチャー型の粒度と 16タイプ→カルチャーの割付は手書きコンテンツ。
- **Follow-up**: カルチャー型セット（例 議論歓迎/合意形成/成果主義/家族的）の確定は design のコンテンツ表に記載、文言は seed/実装時に精緻化。

## Risks & Mitigations

- **社会的望ましさバイアス（盛り）** — 二者択一（両選択肢とも好ましい）＋ SJT（行動推定）で軽減。Likert は不採用。
- **評価的誤用（レッテル・合否転用）** — 全レイヤーで数値非表示、成長は伸びしろ文脈のみ、カルチャーは個人起点導出に限定（R9）。
- **playstyle との概念重複** — 対人軸（率直さ/判断の重心/距離感/異論への構え）は playstyle の4軸（探索・個人協調・計画即興・堅実挑戦）と非交差に設計（R9.4）。
- **一覧漏出** — `kind='skill'` フィルタで自動除外。回帰を integration test で固定。
- **migration 番号衝突** — 追加 migration は生成時点の最新番号の次を採番（過去に 0019 振り直しの先例あり）。

## References

- 設計ブリーフ: `docs/superpowers/specs/2026-07-16-teamwork-style-diagnosis-design.md`
- 先例 design: `.kiro/specs/thinking-style-diagnosis/design.md`, `.kiro/specs/worklife-disposition-survey/design.md`
- 先例 migration: `packages/db/drizzle/0021_optimal_ravenous.sql`（enum 値追加の型）
