# Brief: sage-survey

## Problem

アーキタイプ Researcher（探究者：深く調べ・データで本質を示す）と職掌 sage（賢者：AI/ML・データ）は、対応するスキルアンケートが未整備のため診断で確定できない。AI/ML・データ領域の候補者が、自分の専門性を反映した結果を得られない。

## Current State

- `JOBTYPE_DEFAULT_VOCATION`（`class-diagnosis/_lib/definitions.ts`）に sage は含まれず、非活性枠のまま。
- 既存の `ai-driven-development-survey` は「AI駆動開発（ツール活用）」であり ranger（遊撃）に対応。AI/ML・データの専門スキル（sage）とは別物。
- seed 追加の型は frontend / backend / infrastructure-sre / engineering-manager などの既存 survey で確立済み（jobType 別・カテゴリ/設問/選択肢・scoringKind）。

## Desired Outcome

- 賢者（AI/ML・データ）向けスキルアンケートが seed され、回答から sage 職掌スコアが算出される。
- `JOBTYPE_DEFAULT_VOCATION` に1行追加され、Researcher アーキタイプ＋sage 職掌が診断で開放される。

## Approach

既存 survey seed パターンを踏襲し、AI/ML・データのカテゴリ体系（例: 機械学習基礎 / モデル開発・評価 / データエンジニアリング / 推薦・検索 / MLOps / 分析・可視化 等）で設問を設計・seed。スキーマ変更なし想定（既存の skill_survey 構造に載る）。

## Scope

- **In**: 賢者 survey のカテゴリ/設問/選択肢設計と seed、`JOBTYPE_DEFAULT_VOCATION`/必要な CATEGORY_AFFINITY への1行追加。
- **Out**: アーキタイプ定義・導出（diagnosis-archetypes）、UI 変更。

## Boundary Candidates

- 賢者 survey マスタ（seed）
- 職掌マッピング追加（definitions.ts の1行）

## Out of Boundary

- 導出ロジック・提示（diagnosis-archetypes）
- 他 survey の変更

## Upstream / Downstream

- **Upstream**: `diagnosis-archetypes`（Researcher signature ＝何を測るべきか）、既存 skill-survey 基盤。
- **Downstream**: diagnosis-archetypes が Researcher / sage を導出可能に。

## Existing Spec Touchpoints

- **Adjacent**: `skill-survey`（seed 基盤）、`ai-driven-development-survey`（AI駆動開発=ranger と混同しないよう境界を明示）。

## Constraints

- スキーマ無変更を優先（既存 skill_survey 構造に載せる）。
- 依存方向 types→db→ai→apps 厳守。DB テストは要クリーン DB・vitest 直列。
- seed 正本の所在（CSV or 設計駆動）は design で決める。
