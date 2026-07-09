# Brief: worklife-disposition-survey

## Problem

12アーキタイプのうち Optimizer（改善屋）/ Firefighter（火消し）/ Mentor（育成役）/ Integrator（調整役）/ Innovator（開拓者）は、「どんな仕事の仕方・志向か」で決まるが、現行の気質診断の4軸（探索⇔深化 / 個人⇔協調 / 計画⇔即興 / 堅実⇔挑戦）にはこれらの志向を直接測る信号が無い。そのためこれらのアーキタイプを診断で確定できない。

## Current State

- 気質（playstyle / thinking-style）診断は4軸16型で「どう戦うか（作業スタイル）」を測るが、「何に価値を感じ・どんな行動で貢献するか（志向）」は測っていない。
- スキルアンケート（職掌）は「何が得意か（ドメイン）」を測るが、行動志向は対象外。
- 結果として改善志向・障害対応志向・育成志向・調整志向・新技術採用志向が診断入力に存在しない。

## Desired Outcome

- 候補者の**働き方の志向**を測る診断が追加され、その結果が `diagnosis-archetypes` の導出入力に加わる。
- 少なくとも Optimizer / Firefighter / Mentor / Integrator / Innovator を他アーキタイプから判別できる信号が得られる。

## Approach

`diagnosis-archetypes` が定義するアーキタイプ signature を逆算し、各志向（改善 / 障害対応 / 育成 / 調整・橋渡し / 新技術採用 ほか）を弁別する設問セットを設計。既存 skill_survey 基盤（jobType 別 survey ＋ scoringKind）に新しい志向カテゴリとして seed 追加できるか、独立 survey（例 jobType='worklife-disposition'）にするかは design で決める。playstyle の polarity 方式を踏襲できる見込み。

## Scope

- **In**: 志向を測る設問・選択肢・スコアリングの設計と seed、導出入力への接続仕様。
- **Out**: アーキタイプ定義・導出ロジック本体（diagnosis-archetypes が所有）、UI の大改修。

## Boundary Candidates

- 志向カテゴリ・設問マスタ（seed）
- スコアリング（志向スコアの算出）
- diagnosis-archetypes への signal 供給インターフェース

## Out of Boundary

- アーキタイプ確定ロジック（diagnosis-archetypes）
- 既存4気質軸の変更

## Upstream / Downstream

- **Upstream**: `diagnosis-archetypes`（signature 仕様＝何を弁別すべきか）、既存 skill_survey / playstyle 基盤。
- **Downstream**: diagnosis-archetypes の導出精度向上（Optimizer/Firefighter/Mentor/Integrator/Innovator）。

## Existing Spec Touchpoints

- **Adjacent**: `skill-survey`（seed 基盤・scoringKind）、`thinking-style-diagnosis` / `playstyle-diagnosis`（気質軸との重複を避ける）。

## Constraints

- 既存の回答スキーマ/読み出し query を壊さない（拡張は加算的に）。
- 数値スコア・他者比較を出さない方針を踏襲。
- 依存方向 types→db→ai→apps 厳守。DB テストは要クリーン DB・直列実行。
