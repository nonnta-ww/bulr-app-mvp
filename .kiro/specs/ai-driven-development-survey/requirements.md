# Requirements Document

## Introduction

既存の職種別スキルアンケート（backend 等）は技術の広さ・深さを測るが、**AI駆動開発（AI活用開発）の経験値を一切問えていない**（"AI"/"LLM"/"Copilot" 等の設問がゼロ）。2026 年現在、AI 駆動開発の習熟は生産性・コード品質・レビュー負荷を左右する第一級の評価軸であり、一次フィルタとして欠かせない。

本仕様は、AI 駆動開発に特化した **独立スキルアンケート**（`jobType='ai-driven-development'`）を新設する。職種非依存で全エンジニアに適用でき、候補者本人がスキルバランスを理解し、採用側が必要スキルの濃淡を見抜けるようにする。測定射程は 4 軸（①AI を使った開発＝コーディング支援／②AI 機能を作る開発＝LLM アプリ／③チーム・ガバナンス／④AI リテラシー・学習姿勢）を多角的にカバーする。

実装は `skill-survey-proficiency-scale` で導入済みの熟練度基盤（`skill_survey_choice.level`、`skill_survey_question.scoring_kind`、自己分析の集計純関数・可視化）を最大限再利用する。新たに頻度系設問を別系統で集計するため `score_kind` に `'frequency'` を追加する。

## Boundary Context

- **In scope**:
  - `jobType='ai-driven-development'` の独立 survey マスタとその設問構成（4 軸／6 カテゴリ）
  - ハイブリッド設問形式（ツール選択＝複数選択、習熟度／頻度＝段階スケール、設計思想／工夫＝自由記述）
  - 頻度系設問を熟練度（proficiency）とは別系統で集計・表示できるようにする拡張
  - 新 survey 回答を既存の自己分析（集計→可視化→履歴）経路へ独立スナップショットとして供給
  - 冪等な seed の新規作成と登録
- **Out of scope**:
  - 既存 backend アンケートの設問内容変更
  - 新規フォーム描画コンポーネントや新規可視化コンポーネントの新設（既存の `questionType` 駆動描画・カバレッジ／レーダーを再利用する）
  - 面接（assessment / interview）やスカウト機能との連携
  - 複数 survey をまたいだ合成スコアや横断ランキング
  - 自己分析の LLM ナラティブ生成ロジックの変更（既存パイプラインをそのまま使う）
- **Adjacent expectations**:
  - 前提依存: `skill-survey-proficiency-scale`（`choice.level` / `scoring_kind` / 集計の熟練度拡張）がマージ済みであること
  - 既存の回答保存テーブル（`skill_survey_response` / `skill_survey_answer`）、自己分析集計・履歴・再回答クールダウン設定をそのまま利用する
  - 確定済み設計制約: 頻度集計のため `score_kind` enum に `'frequency'` を追加する（マイグレーションを伴う）

## Requirements

### Requirement 1: AI駆動開発アンケートの提供

**Objective:** As a 候補者（エンジニア）, I want AI 駆動開発に特化した独立アンケートに回答できる, so that 職種に依存せず自分の AI 活用経験を申告し可視化できる

#### Acceptance Criteria

1. The Skill Survey Service shall `jobType='ai-driven-development'` を持つアクティブな survey を 1 つ提供する。
2. When 候補者がアンケート一覧を開いたとき, the Skill Survey Service shall AI 駆動開発アンケートを回答可能なアンケートとして一覧に表示する。
3. The Skill Survey Service shall 本アンケートを既存の職種別アンケートと独立して提供し、既存アンケートの一覧表示・回答・集計・履歴に影響を与えない。
4. Where 候補者が複数のアンケートに回答した場合, the Skill Survey Service shall 各アンケートを独立した回答履歴・状態として扱う。

### Requirement 2: 4軸を多角的にカバーする設問構成

**Objective:** As a 採用担当者, I want AI 駆動開発の経験を広さ・深さ・姿勢の複数観点で把握できる設問構成, so that 面接の深掘りに入る前にカバレッジ判定を完了できる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケートを次の 6 カテゴリで構成する: (1) AI 支援開発ツール、(2) 開発スタイル・ワークフロー、(3) テクニック、(4) 品質・ガバナンス、(5) AI 機能の開発経験（LLM アプリ）、(6) AI リテラシー・学習姿勢。
2. The Skill Survey Service shall 各カテゴリに、広さを問う複数選択設問・深さ／頻度を問う段階スケール設問・工夫を問う自由記述設問を、カテゴリの趣旨に応じて配置する。
3. The Skill Survey Service shall 4 つの測定射程（AI を使った開発／AI 機能を作る開発／チーム・ガバナンス／AI リテラシー・学習姿勢）すべてを少なくとも 1 つ以上の設問でカバーする。
4. The Skill Survey Service shall AI 領域単体で回答者を過負荷にしない範囲に設問量を収める（網羅性は保ちつつ単一領域として現実的な回答ボリュームに収める）。

### Requirement 3: ハイブリッド設問形式と熟練度ラベルの再利用

**Objective:** As a 候補者, I want 設問の性質に合った回答形式（選択・段階・記述）で答えられる, so that 自分の経験を正確かつ負担なく申告できる

#### Acceptance Criteria

1. Where 設問が利用ツールや活用要素の広さを問う場合, the Skill Survey Service shall 複数選択（multi_choice）として提示する。
2. Where 設問が習熟度を問う場合, the Skill Survey Service shall 単一選択（single_choice）として提示し、各選択肢に序数（level）を割り当てる。
3. Where 設問が習熟度を 4 段階で問う場合, the Skill Survey Service shall 標準習熟度ラベル（L0 未経験・知識なし／L1 学習・理解はある／L2 実務で実装・運用したことがある／L3 設計・改善を主導・標準化した）を再利用する。
4. Where 設問が設計思想や工夫を問う場合, the Skill Survey Service shall 自由記述（free_text）として提示し、任意回答とする。
5. The Skill Survey Service shall すべての設問形式を既存の `questionType` 駆動の描画でそのまま表示し、新規の描画コンポーネントを追加しない。

### Requirement 4: 頻度系設問の独立集計

**Objective:** As a 採用担当者, I want 利用頻度・キャッチアップ頻度を習熟度とは別の軸として把握できる, so that 「使える」と「日常的に使っている／追い続けている」を区別して評価できる

#### Acceptance Criteria

1. Where 設問が利用頻度やキャッチアップ頻度を問う場合, the Skill Survey Service shall 段階スケール（single_choice）として提示し、各選択肢に頻度の序数（level）を割り当てる。
2. The Self-Analysis Service shall 頻度系設問の回答を熟練度（proficiency）の集計とは独立した系統として集計する。
3. The Self-Analysis Service shall 頻度系の集計結果を熟練度スコアに混入させない（熟練度レーダー等の熟練度指標へ頻度回答を加算しない）。
4. When 旧データ（頻度系統が未設定の回答）を集計するとき, the Self-Analysis Service shall エラーなく後方互換に処理する（頻度系指標を未算出として扱う）。

### Requirement 5: 必須設問とバリデーション

**Objective:** As a 採用担当者, I want AI 駆動開発の核となる設問が必ず回答されている, so that 一次フィルタとして最低限のカバレッジを担保できる

#### Acceptance Criteria

1. The Skill Survey Service shall 最低限のカバレッジを担保する設問（利用している AI 支援ツール、AI 活用の深度、AI 生成コードの検証レベル）を必須設問として設定する。
2. If 必須設問が未回答のまま回答が送信された場合, then the Skill Survey Service shall 送信を拒否し、未回答の必須設問を提示する。
3. The Skill Survey Service shall 自由記述設問を任意回答として扱い、未記入でも送信を妨げない。
4. When 必須設問がすべて回答された状態で送信されたとき, the Skill Survey Service shall 回答を受理して永続化する。

### Requirement 6: 回答の永続化と再回答クールダウン

**Objective:** As a 候補者, I want 回答が保存され、一定期間後に再回答して経験の更新を反映できる, so that 成長を継続的に記録できる

#### Acceptance Criteria

1. When 候補者が AI 駆動開発アンケートを送信したとき, the Skill Survey Service shall 回答を既存の回答保存経路（追記型の回答レコードと設問別回答）へ保存する。
2. The Skill Survey Service shall 本アンケートの再回答クールダウンを既存設定（既定 30 日）に従って、アンケート単位で独立して適用する。
3. While クールダウン期間中である間, the Skill Survey Service shall 再回答を許可せず、次回回答可能日時を提示する。
4. The Skill Survey Service shall 過去の回答を上書きせず版として追記し、版ごとの履歴を保持する。

### Requirement 7: 自己分析への独立スナップショット供給と可視化

**Objective:** As a 候補者, I want AI 駆動開発アンケートの結果を自己分析画面でカテゴリ別に確認できる, so that 自分の AI 活用スキルバランスを理解し成長アクションにつなげられる

#### Acceptance Criteria

1. When 候補者が AI 駆動開発アンケートに回答したとき, the Self-Analysis Service shall 本アンケート専用の独立した集計スナップショットを生成する。
2. The Self-Analysis Service shall 集計結果を既存のカバレッジ表示およびカテゴリ別熟練度レーダーで表示する（新規可視化コンポーネントを追加しない）。
3. The Self-Analysis Service shall AI 駆動開発アンケートのスナップショットを既存の職種別アンケートのスナップショットと併存させ、互いの表示を破壊しない。
4. The Self-Analysis Service shall 本アンケートの自己分析を、アンケート単位で独立した版履歴・版間比較として扱う。
5. Where 熟練度スコアを持たないカテゴリ（頻度系のみ等）が存在する場合, the Self-Analysis Service shall 当該カテゴリを熟練度レーダーから除外しつつ、カバレッジ等の他指標は表示する。

### Requirement 8: 冪等な seed と登録

**Objective:** As a 開発者, I want アンケート定義を seed で冪等に投入できる, so that 環境構築・再実行で重複や不整合を起こさず本アンケートを配置できる

#### Acceptance Criteria

1. The Survey Seed Process shall AI 駆動開発アンケートの survey・カテゴリ・設問・選択肢を seed として定義し、登録経路へ組み込む。
2. When seed を複数回実行したとき, the Survey Seed Process shall 既存定義を冪等に upsert し、重複レコードを生成しない。
3. The Survey Seed Process shall 既存の backend アンケート seed と同じ冪等 upsert 規約（一意キーでの onConflict 更新）に従う。
4. The Survey Seed Process shall 各段階スケール設問の選択肢へ序数（level）を、各スコア対象設問へ集計分類（熟練度／頻度）を正しく付与する。

### Requirement 9: 既存挙動の非回帰

**Objective:** As a 採用担当者, I want 新アンケート追加が既存機能を壊さない, so that 既存の職種別アンケート・自己分析を安心して使い続けられる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケート追加後も既存の職種別アンケートの一覧・回答・必須判定・クールダウンを従来どおり動作させる。
2. The Self-Analysis Service shall 既存アンケートの集計・カバレッジ表示・熟練度レーダー・版履歴を従来どおり動作させる。
3. When `score_kind` に頻度分類を追加したとき, the Self-Analysis Service shall 既存の熟練度（proficiency）・直近利用（recency）の集計結果を変更しない。
