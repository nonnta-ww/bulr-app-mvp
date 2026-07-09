# Brief: pdm-strategist-survey

## Problem

アーキタイプ Strategist（戦略家：何を作るべきかを見極め盤面を設計）と職掌 strategist（策士：PdM）は、対応するアンケートが未整備のため診断で確定できない。プロダクトマネジメント寄りの候補者が、自分の強みを反映した結果を得られない。

## Current State

- `JOBTYPE_DEFAULT_VOCATION` に strategist は含まれず、非活性枠のまま。
- PdM は「技術スキル」より「プロダクト戦略・意思決定・優先順位付け・ステークホルダー調整」等のコンピテンシー寄り。engineering-manager-survey（EM）の設計駆動アプローチ（プロフィール＋コンピテンシー／proficiency＋free_text）が参考になる。

## Desired Outcome

- 策士（PdM）向けアンケートが seed され、回答から strategist 職掌スコアが算出される。
- `JOBTYPE_DEFAULT_VOCATION` に1行追加され、Strategist アーキタイプ＋strategist 職掌が診断で開放される。

## Approach

engineering-manager-survey の設計駆動パターンを踏襲し、PdM コンピテンシー体系（例: プロダクト戦略 / ディスカバリー / 優先順位付け / ロードマップ / データドリブン意思決定 / ステークホルダーマネジメント / GTM 連携 等）で設計・seed。スキーマ変更なし想定。

## Scope

- **In**: 策士 survey のカテゴリ/設問/選択肢設計と seed、`JOBTYPE_DEFAULT_VOCATION`/必要な affinity への1行追加。
- **Out**: アーキタイプ定義・導出（diagnosis-archetypes）、UI 変更。

## Boundary Candidates

- 策士 survey マスタ（seed）
- 職掌マッピング追加（definitions.ts の1行）

## Out of Boundary

- 導出ロジック・提示（diagnosis-archetypes）
- Commander（EM）との役割混同を避ける境界定義

## Upstream / Downstream

- **Upstream**: `diagnosis-archetypes`（Strategist signature ＝何を測るべきか）、既存 skill-survey / EM survey パターン。
- **Downstream**: diagnosis-archetypes が Strategist / strategist を導出可能に。

## Existing Spec Touchpoints

- **Adjacent**: `skill-survey`（seed 基盤）、`engineering-manager-survey`（設計駆動パターンの参照元・Commander と Strategist の弁別）。

## Constraints

- スキーマ無変更を優先。
- 依存方向 types→db→ai→apps 厳守。DB テストは要クリーン DB・vitest 直列。
- Commander（EM＝人と組織のマネジメント）と Strategist（PdM＝プロダクトの what/why）の境界を signature 上で明確にする。
