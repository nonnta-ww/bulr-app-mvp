# Brief: diagnosis-archetypes

## Problem

現行の RPGクラス診断は、結果を `${称号}・${気質shortLabel}な${職掌}`（例「スペシャリスト・地図職人な前衛」）という説明的複合名で見せており、(1)「クラス名らしさ」が弱く、(2)ファンタジー語彙が男性像に偏りうる懸念があり、(3)現実の開発チームで「あの人こういう人だよね」と通じる認識可能なタイプになっていない。候補者が自分の結果に愛着を持ち、普段使いの言葉で共有できる主役タイプが欲しい。

## Current State

- 判定エンジンは既に「職掌7（スキル由来 vocation vector）× 気質16（playstyle 由来 temperament）× 称号（広さ×深さのランク）」の3層を持ち、純関数パイプライン（foldVocations → scoreTemperament → resolveTitle → assembleClass）で `ClassResult` を組成する。
- 表示は `apps/candidate/app/class-diagnosis/_components/{class-card,share-panel,vocation-radar}.tsx`。契約型は `packages/types/src/{class-diagnosis.ts,temperament.ts}`。
- 小 spec `class-catch-names`（未実装・requirements/design のみ）が「短い異名を付ける」を扱っていたが、本 spec に吸収・置換する。
- 12アーキタイプの一部（Researcher/Strategist/Optimizer/Firefighter/Mentor/Integrator）は現行アンケートでは信号が弱く導出困難。→ 後続 survey spec で拡充する。

## Desired Outcome

- 診断結果の主役が **12のプロ・アーキタイプ**（Builder / Architect / Guardian / Firefighter / Innovator / Optimizer / Researcher / Mentor / Commander / Strategist / Integrator / Craftsman）のいずれか1つとして、性別中立・プロ語彙で提示される。
- 各アーキタイプに「あの人こういう人」一行像、"おまけ"のゲーム風異名、SVG シンボルが付く。
- 従来の説明的 className は副題として残り、称号（ランク）が併記される。
- 導出は既存 `ClassResult`（職掌×気質）から決定論的（signature best-match、tiebreak 固定、常に非空）。現行データで届かないアーキタイプは graceful fallback（近縁タイプ or 職掌ベース）で埋め、後続 survey 拡充で精度を上げる。

## Approach

融合アーキタイプ型（①）: 各アーキタイプに (vocation ベクトル × 気質軸) の signature を定義し、本人スコアとの best-match で主アーキタイプを argmax 決定。engine/survey は再利用し、上に「アーキタイプ確定＋提示＋シンボル」層を薄く載せる。ゲーム風異名は class-catch-names の和風RPG語彙資産を"おまけ"として再利用。

## Scope

- **In**: 12アーキタイプ定義（名称/一行像/ゲーム風異名/シンボル）、(職掌×気質)→アーキタイプの決定論的導出、ClassCard/SharePanel の提示刷新（ヒーロー=アーキタイプ・className 副題化）、SVG シンボル、称号併記、graceful fallback。
- **Out**: 新規アンケートの seed（sage/pdm/worklife は別 spec）、判定スコアリング engine の作り直し、business/Phase2、LLM フレーバー生成の刷新。

## Boundary Candidates

- アーキタイプ・マスタ（定義・シンボル・ゲーム風異名）
- 導出ロジック（signature best-match 純関数）
- 提示 UI（ClassCard / SharePanel のヒーロー刷新）

## Out of Boundary

- 各 survey の設問設計・seed（別 spec）
- 職掌/気質/称号の算出ロジック（読み取りのみ）
- business の representative-class 表示（本 spec では変更しない）

## Upstream / Downstream

- **Upstream**: `packages/types`（ClassResult/TemperamentSummary/Vocation）、既存判定純関数、気質 `_lib/temperament/*`。
- **Downstream**: worklife-disposition-survey / sage-survey / pdm-strategist-survey が本 spec のアーキタイプ signature 仕様を参照して設問を設計。

## Existing Spec Touchpoints

- **Supersedes**: `class-catch-names`（吸収・置換）。
- **Adjacent**: `rpg-class-diagnosis`（本 spec が提示層と導出層を刷新）、`thinking-style-diagnosis` / `playstyle-diagnosis`（気質 signal の供給元、変更しない）。

## Constraints

- 依存方向 types→db→ai→apps を厳守。導出純関数は app-local（`class-diagnosis/_lib/`）。
- 数値スコア・順位・他者比較を出さない（既存 R4.4）。共有テキストは PII/数値なし（R5.2）。
- SVG シンボルは外部依存なしの自己完結（CSP・デザインシステム整合）。
- 性別中立（男性像/女性像に偏る語を避ける）・単一命名セット・性別属性を使用/収集しない。
