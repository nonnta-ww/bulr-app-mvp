# Requirements Document

## Introduction

RPG クラス診断のアーキタイプ Researcher（探究者：深く調べ・データで本質を示す、ゲーム風異名「賢者」）と職掌 sage（賢者）は、対応するスキルアンケートが未整備のため `JOBTYPE_DEFAULT_VOCATION` の非活性枠のままであり、診断で確定できない。AI/ML・データ領域の専門性を持つ候補者が、自分の強みを反映した診断結果を得られない。

本仕様は、AI/ML・データ専門スキルに特化した**独立スキルアンケート**（`jobType='ai-ml'`）を新設する。既存の `ai-driven-development-survey`（`jobType='ai-driven-development'`）は「AI 駆動開発（AI ツールを使って開発する経験）」を測り職掌 ranger（遊撃）に対応するのに対し、本アンケートは「AI/ML モデル・データそのものを作る／扱う専門スキル」を測り職掌 sage（賢者）に対応する。両者は主題・測定対象・開放する職掌のすべてが異なり、混同しないよう境界を明示する。

実装は既存の skill-survey 基盤（マスタ4階層・冪等 upsert・`skill_survey_choice.level`／`skill_survey_question.scoring_kind`・自己分析の集計純関数／可視化）をそのまま再利用する。DB スキーマ・`score_kind` enum の変更は行わない（scoringKind は既存値 `proficiency` のみを用いる）。本仕様が所有するのは ①`jobType='ai-ml'` の survey seed（カテゴリ／設問／選択肢） と ②`JOBTYPE_DEFAULT_VOCATION` への1行追加（`'ai-ml': 'sage'`）のみであり、これにより `vocationVector.sage` が回答から算出可能になり、`diagnosis-archetypes` の Researcher アーキタイプ・sage 職掌が診断で開放される。アーキタイプの判定ロジック自体・UI 変更は本仕様のスコープ外。

## Boundary Context

- **In scope**:
  - `jobType='ai-ml'` の独立 survey マスタとその設問構成（AI/ML・データ専門スキルのカテゴリ体系）
  - ハイブリッド設問形式（経験選択＝複数選択、習熟度＝段階スケール、必要に応じ自由記述）の既存形式での再現
  - 既存の熟練度（proficiency）スコア規約の踏襲と、ツール・手法選択系カテゴリへの代表習熟度ペア付与
  - 新 survey 回答を既存の自己分析（集計→可視化→履歴）経路へ独立スナップショットとして供給
  - 冪等な seed の新規作成と登録経路への組み込み
  - `JOBTYPE_DEFAULT_VOCATION['ai-ml'] = 'sage'` の1行追加（および横断カテゴリがあれば `CATEGORY_AFFINITY` への追加）
- **Out of scope**:
  - `diagnosis-archetypes` のアーキタイプ定義・導出ロジック（`resolveArchetype` / `ARCHETYPE_SIGNATURES`）の変更
  - `ai-driven-development-survey`（`jobType='ai-driven-development'`）を含む既存アンケートの設問内容変更
  - DB スキーマ・enum（`score_kind` 等）の変更や新規マイグレーション
  - 新規フォーム描画コンポーネント・新規可視化コンポーネントの新設
  - class-diagnosis の UI（ClassCard / SharePanel 等）の変更
  - 面接（assessment / interview）・スカウト機能との連携、複数 survey をまたぐ合成スコア・横断ランキング
- **Adjacent expectations**:
  - 前提依存: `skill-survey` 基盤および `skill-survey-proficiency-scale`（`choice.level` / `scoring_kind` / 集計の熟練度拡張）がマージ済みであること
  - 既存の回答保存テーブル（`skill_survey_response` / `skill_survey_answer`）、自己分析集計・履歴・再回答クールダウン設定をそのまま利用する
  - `score_kind` enum は既存値（`proficiency` / `recency` / `frequency`）のみを用い、新値は追加しない
  - `diagnosis-archetypes` の `signature.ts` は `researcher: { vocation: { sage: 0.9 } }` を既に定義済みであり、本仕様が `vocationVector.sage` を非零にすることで Researcher アーキタイプが到達可能になる（導出自体は変更しない）
  - `ai-driven-development-survey` とは jobType・測定対象・開放職掌が明確に異なり、カテゴリ名が偶然一致しても `resolveCategoryVocationWeights` の `jobType::categoryName` 複合キーにより誤って混線しない

## Requirements

### Requirement 1: AI/MLアンケートの提供

**Objective:** As a 候補者（AI/ML・データ領域のエンジニア）, I want AI/ML・データ専門スキルに特化した独立アンケートに回答できる, so that 自分の専門性を申告し可視化できる

#### Acceptance Criteria

1. The Skill Survey Service shall `jobType='ai-ml'` を持つアクティブな survey を 1 つ提供する。
2. When 候補者がアンケート一覧を開いたとき, the Skill Survey Service shall AI/ML アンケートを回答可能なアンケートとして一覧に表示する。
3. The Skill Survey Service shall 本アンケートを既存の職種別アンケート（backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager）と独立して提供し、既存アンケートの一覧表示・回答・集計・履歴に影響を与えない。
4. The Skill Survey Service shall 本アンケートを `ai-driven-development`（AI 駆動開発＝AI ツールを使う開発）とは別個の jobType・別個の測定対象（AI/ML モデル・データそのものの専門スキル）として提供し、両者を混同しない。
5. Where 候補者が複数のアンケートに回答した場合, the Skill Survey Service shall 各アンケートを独立した回答履歴・状態として扱う。

### Requirement 2: AI/ML・データ専門スキルを多角的にカバーするカテゴリ構成

**Objective:** As a 採用担当者, I want AI/ML・データ専門スキルを広さ・深さの複数観点で把握できるカテゴリ構成, so that 面接の深掘りに入る前にカバレッジ判定を完了できる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケートを次の 6 カテゴリで構成する: (1) 機械学習基礎、(2) モデル開発・評価、(3) データエンジニアリング、(4) 推薦・検索、(5) MLOps、(6) 分析・可視化。
2. The Skill Survey Service shall 各カテゴリを、経験のある技術・手法の広さを問う設問と、代表的な技術・手法の深さ（習熟度）を問う設問で構成する。
3. The Skill Survey Service shall `ai-driven-development-survey` の測定射程（AI ツールの活用）とは重複しない、AI/ML モデル・データの専門技術領域（学習・推論・特徴量・パイプライン・評価指標等）を少なくとも 1 つ以上の設問でカバーする。
4. The Skill Survey Service shall 各カテゴリ・設問・選択肢に安定した表示順を与える。
5. The Skill Survey Service shall AI/ML 領域単体で回答者を過負荷にしない範囲に設問量を収める（網羅性は保ちつつ単一領域として現実的な回答ボリュームに収める）。

### Requirement 3: ハイブリッド設問形式と熟練度ラベルの再利用

**Objective:** As a 候補者, I want 設問の性質に合った回答形式（選択・段階・記述）で答えられる, so that 自分の経験を正確かつ負担なく申告できる

#### Acceptance Criteria

1. Where 設問が利用技術・手法・ツールの広さを問う場合, the Skill Survey Service shall 複数選択（multi_choice）として提示する。
2. Where 設問が習熟度を問う場合, the Skill Survey Service shall 単一選択（single_choice）として提示し、各選択肢に序数（level）を割り当てる。
3. Where 設問が習熟度を 4 段階で問う場合, the Skill Survey Service shall 標準習熟度ラベル（L0 未経験・知識なし／L1 学習・理解はある／L2 実務で実装・運用したことがある／L3 設計・改善を主導・標準化した）を再利用し、各選択肢へ序数（level 0–3）を割り当てる。
4. Where 設問が設計思想や取り組み方を問う場合, the Skill Survey Service shall 自由記述（free_text）として提示し、任意回答とする。
5. The Skill Survey Service shall すべての設問形式を既存の `questionType` 駆動の描画でそのまま表示し、新規の描画コンポーネントを追加しない。

### Requirement 4: 代表習熟度ペアの付与

**Objective:** As a 採用担当者, I want 技術・手法選択系カテゴリで「使ったことがある」だけでなく代表的な習熟度を把握できる, so that 広さに加えて深さ（熟練度）を自己分析レーダーで評価できる

#### Acceptance Criteria

1. Where カテゴリが特定技術・手法群（例: 機械学習基礎、モデル開発・評価、データエンジニアリング、MLOps など）の経験選択を含む場合, the Skill Survey Service shall 当該カテゴリに代表習熟度を問う設問ペア（最も得意な対象を 1 つ選ぶ単一選択 ＋ その習熟度を問う段階スケール）を提示する。
2. Where 代表習熟度の段階スケールを提示する場合, the Skill Survey Service shall 標準習熟度ラベル（level 0–3）を用いる。
3. The Skill Survey Service shall 代表習熟度の段階スケール設問を熟練度（proficiency）として集計対象に分類する。

### Requirement 5: スコア分類の付与とスキーマ非変更

**Objective:** As a 採用担当者, I want 習熟度を測る設問が集計対象として正しく分類される, so that 自己分析の熟練度レーダー等に正しく反映される

#### Acceptance Criteria

1. Where 設問が習熟度を問う段階スケールである場合, the Survey Seed Process shall 当該設問へ集計分類 `proficiency` を付与する。
2. Where 設問が経験ベースの複数選択（広さの申告）である場合, the Survey Seed Process shall 集計分類を付与しない（`scoring_kind` 無し）。
3. The Survey Seed Process shall `score_kind` enum の既存値のみを用い、新たな分類値を追加しない。
4. The Survey Seed Process shall 本アンケート追加に伴う DB スキーマ変更を行わない。

### Requirement 6: 必須設問とバリデーション

**Objective:** As a 採用担当者, I want AI/ML の核となる経験設問が必ず回答されている, so that 一次フィルタとして最低限のカバレッジを担保できる

#### Acceptance Criteria

1. The Skill Survey Service shall 各トップカテゴリ先頭の「経験のある〜を選択」設問を必須設問（`is_required=true`）として設定する。
2. If 必須設問が未回答のまま回答が送信された場合, then the Skill Survey Service shall 送信を拒否し、未回答の必須設問を提示する。
3. The Skill Survey Service shall 自由記述設問および任意設問を未回答でも送信を妨げない。
4. When 必須設問がすべて回答された状態で送信されたとき, the Skill Survey Service shall 回答を受理して永続化する。

### Requirement 7: 回答の永続化と再回答クールダウン

**Objective:** As a 候補者, I want 回答が保存され、一定期間後に再回答して経験の更新を反映できる, so that 成長を継続的に記録できる

#### Acceptance Criteria

1. When 候補者が AI/ML アンケートを送信したとき, the Skill Survey Service shall 回答を既存の回答保存経路（追記型の回答レコードと設問別回答）へ保存する。
2. The Skill Survey Service shall 本アンケートの再回答クールダウンを既存設定（既定 30 日）に従って、アンケート単位で独立して適用する。
3. While クールダウン期間中である間, the Skill Survey Service shall 再回答を許可せず、次回回答可能日時を提示する。
4. The Skill Survey Service shall 過去の回答を上書きせず版として追記し、版ごとの履歴を保持する。

### Requirement 8: 自己分析への独立スナップショット供給と可視化

**Objective:** As a 候補者, I want AI/ML アンケートの結果を自己分析画面でカテゴリ別に確認できる, so that 自分の AI/ML スキルバランスを理解し成長アクションにつなげられる

#### Acceptance Criteria

1. When 候補者が AI/ML アンケートに回答したとき, the Self-Analysis Service shall 本アンケート専用の独立した集計スナップショットを生成する。
2. The Self-Analysis Service shall 集計結果を既存のカバレッジ表示およびカテゴリ別熟練度レーダーで表示する（新規可視化コンポーネントを追加しない）。
3. The Self-Analysis Service shall AI/ML アンケートのスナップショットを既存の職種別アンケートのスナップショットと併存させ、互いの表示を破壊しない。
4. The Self-Analysis Service shall 本アンケートの自己分析を、アンケート単位で独立した版履歴・版間比較として扱う。
5. Where 熟練度スコアを持たないカテゴリが存在する場合, the Self-Analysis Service shall 当該カテゴリを熟練度レーダーから除外しつつ、カバレッジ等の他指標は表示する。

### Requirement 9: 冪等な seed と登録

**Objective:** As a 開発者, I want アンケート定義を seed で冪等に投入できる, so that 環境構築・再実行で重複や不整合を起こさず本アンケートを配置できる

#### Acceptance Criteria

1. The Survey Seed Process shall AI/ML アンケートの survey・カテゴリ・設問・選択肢を seed として定義し、既存の seed 登録経路へ組み込む。
2. When seed を複数回実行したとき, the Survey Seed Process shall 既存定義を冪等に upsert し、重複レコードを生成しない。
3. The Survey Seed Process shall 既存の backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager アンケート seed と同じ冪等 upsert 規約（一意キーでの onConflict 更新、id の不変）に従う。
4. The Survey Seed Process shall 各段階スケール設問の選択肢へ序数（level）を、各スコア対象設問へ集計分類（熟練度）を正しく付与する。

### Requirement 10: 職掌マッピングによる Researcher / sage の開放

**Objective:** As a 候補者（AI/ML・データ領域のエンジニア）, I want AI/ML アンケートに回答すると自分の職掌診断に sage（賢者）が反映される, so that RPG クラス診断で自分の専門性に対応するアーキタイプ（Researcher）を確認できる

#### Acceptance Criteria

1. The Class Diagnosis Service shall `JOBTYPE_DEFAULT_VOCATION` に `jobType='ai-ml'` から職掌 `sage` への対応を1行追加する。
2. When 候補者が AI/ML アンケートに回答したとき, the Class Diagnosis Service shall 当該回答カテゴリを `resolveCategoryVocationWeights('ai-ml', categoryName)` により職掌 `sage` を含む重みベクトルへ決定論的に解決する。
3. The Class Diagnosis Service shall 本マッピング追加により `vocationVector.sage` を非零にし、`diagnosis-archetypes` の Researcher アーキタイプ導出を到達可能にする（アーキタイプ導出ロジック自体は本仕様で変更しない）。
4. The Class Diagnosis Service shall 本マッピング追加が既存 jobType（frontend / backend / infrastructure-sre / engineering-manager / ai-driven-development）の職掌解決結果を変更しないことを保証する。

### Requirement 11: 既存挙動の非回帰

**Objective:** As a 採用担当者, I want 新アンケート追加が既存機能を壊さない, so that 既存の職種別アンケート・自己分析・クラス診断を安心して使い続けられる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケート追加後も既存の職種別アンケートの一覧・回答・必須判定・クールダウンを従来どおり動作させる。
2. The Self-Analysis Service shall 既存アンケートの集計・カバレッジ表示・熟練度レーダー・版履歴を従来どおり動作させる。
3. The Skill Survey Service shall 本アンケート追加に伴う DB スキーマ・enum・共有コンポーネントの変更を行わず、既存アンケートの挙動に副作用を与えない。
4. The Class Diagnosis Service shall 本マッピング追加後も既存の職掌判定（tiebreak・副職掌・広さ／深さ判定）を既存 jobType の入力に対して従来どおり動作させる。
