# Requirements Document

## Introduction

既存の職種別スキルアンケートは `backend`（バックエンドエンジニア）と `ai-driven-development`（AI 駆動開発）の 2 種のみで、**フロントエンドエンジニア向けが存在しない**。フロントエンド志望の候補者は自身のスキルを自己分析・可視化できず、採用側もフロントエンド領域のカバレッジを一次フィルタとして把握できない。

本仕様は、フロントエンドエンジニア向けの独立スキルアンケート（`jobType='frontend'`）を新設する。設問・選択肢の正本は `docs/frontend-skills.csv`（69 行・カンマ区切り・`ENGINEER_SKILL_LEVEL` マーカー付き）とし、既存の backend アンケートが `docs/backend-skills.csv` を正本にしたのと同じ関係で実装する。データ構造・スコア規約・描画・集計・履歴・クールダウンはすべて既存基盤（4 層構造、`skill_survey_choice.level`、`skill_survey_question.scoring_kind`、自己分析の集計・可視化）を再利用し、新規スキーマ変更・新規 UI コンポーネントは伴わない。主たる成果物は seed データ定義とその冪等な登録・投入、およびテストである。

## Boundary Context

- **In scope**:
  - `jobType='frontend'` の独立 survey マスタとその設問構成（CSV 準拠の 10 カテゴリ）
  - `docs/frontend-skills.csv` を正本とした設問・選択肢の seed 化と、CSV が古い・崩れている箇所の補正
  - ハイブリッド設問形式（経験選択＝複数選択、習熟度＝段階スケール、自由記述）の既存形式での再現
  - 既存の熟練度（proficiency）・直近利用（recency）スコア規約の踏襲
  - 新 survey 回答を既存の自己分析（集計→可視化→履歴）経路へ独立スナップショットとして供給
  - 冪等な seed の新規作成と登録経路への組み込み
- **Out of scope**:
  - 既存 backend / ai-driven-development アンケートの設問内容変更
  - DB スキーマ・enum（`score_kind` 等）の変更や新規マイグレーション
  - 新規フォーム描画コンポーネント・新規可視化コンポーネントの新設（既存の `questionType` 駆動描画・カバレッジ／レーダーを再利用）
  - 管理画面（masters/skill-survey）・回答送信 Server Action の改修（jobType 非依存の汎用実装をそのまま利用）
  - 面接（assessment / interview）・スカウト機能との連携、複数 survey をまたぐ合成スコア・横断ランキング
- **Adjacent expectations**:
  - 前提依存: `skill-survey` 基盤および `skill-survey-proficiency-scale`（`choice.level` / `scoring_kind` / 集計の熟練度拡張）がマージ済みであること
  - 既存の回答保存テーブル（`skill_survey_response` / `skill_survey_answer`）、自己分析集計・履歴・再回答クールダウン設定をそのまま利用する
  - `score_kind` enum は既存値（`proficiency` / `recency` / `frequency`）のみを用い、新値は追加しない

## Requirements

### Requirement 1: フロントエンドアンケートの提供

**Objective:** As a 候補者（フロントエンドエンジニア）, I want フロントエンドに特化した独立アンケートに回答できる, so that 自分のフロントエンドスキルを申告し可視化できる

#### Acceptance Criteria

1. The Skill Survey Service shall `jobType='frontend'` を持つアクティブな survey を 1 つ提供する。
2. When 候補者がアンケート一覧を開いたとき, the Skill Survey Service shall フロントエンドアンケートを回答可能なアンケートとして一覧に表示する。
3. The Skill Survey Service shall 本アンケートを既存の職種別アンケート（backend / ai-driven-development）と独立して提供し、既存アンケートの一覧表示・回答・集計・履歴に影響を与えない。
4. Where 候補者が複数のアンケートに回答した場合, the Skill Survey Service shall 各アンケートを独立した回答履歴・状態として扱う。

### Requirement 2: CSV準拠のカテゴリ構成

**Objective:** As a 採用担当者, I want フロントエンドの主要技術領域を網羅したカテゴリ構成, so that 候補者のスキルの広さ・深さを領域ごとに把握できる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケートを次の 10 トップカテゴリで構成する: (1) HTML・CSS、(2) JavaScript、(3) フレームワーク・ライブラリ、(4) UI/UXスキル、(5) バックエンド連携、(6) セキュリティ、(7) アーキテクチャ設計、(8) パフォーマンス・チューニング、(9) テスト、(10) ビルド・デプロイ。
2. The Skill Survey Service shall 各トップカテゴリを、CSV のサブカテゴリ（スキル領域）に対応する `subcategory` 単位で構成する。
3. The Skill Survey Service shall CSV の「その他」カテゴリ（フォルダ構成・ディレクトリ構成・モジュール設計など）を「アーキテクチャ設計」カテゴリへ統合し、重複するスキル領域を一本化する。
4. The Skill Survey Service shall 各カテゴリ・設問・選択肢の表示順を CSV の出現順に基づく安定した順序で提示する。

### Requirement 3: CSVを正本とした設問・選択肢の忠実な再現

**Objective:** As a 開発者, I want 設問・選択肢が正本 CSV に忠実である, so that アンケート内容の根拠が CSV にトレースでき、レビュー・更新が容易になる

#### Acceptance Criteria

1. The Survey Seed Process shall `docs/frontend-skills.csv` の各行（設問）と各選択肢を、本仕様で定めた補正を除き、文言を変えずに seed へ反映する。
2. The Survey Seed Process shall CSV の崩れた行（質問文が選択肢列に混入し選択肢を持たない行）を、正常な設問に整形するか、本アンケートから除外する。
3. The Survey Seed Process shall CSV の明白な誤字・表記ゆれを補正する（例: `Crome`→`Chrome`、`Server Worker`→`Service Worker`、`教会設計`→`境界設計`、`Svelt`→`Svelte`、`OpeinAPI`→`OpenAPI`、`thisの挙動制御（bind、call,、apply...` の重複カンマ など）。
4. Where 設問が同一カテゴリ内で意味的に重複する場合, the Survey Seed Process shall 重複を統合または除外し、回答者が同じ内容を二重に問われないようにする。

### Requirement 4: ハイブリッド設問形式と熟練度ラベルの再利用

**Objective:** As a 候補者, I want 設問の性質に合った回答形式（選択・段階・記述）で答えられる, so that 自分の経験を正確かつ負担なく申告できる

#### Acceptance Criteria

1. Where 設問が経験のある技術・実践内容の広さを問う場合, the Skill Survey Service shall 複数選択（multi_choice）として提示する。
2. Where 設問が「経験のある言語／フレームワーク／ライブラリを選択」（CSV の `ENGINEER_SKILL_LEVEL` マーカー付き設問）である場合, the Skill Survey Service shall 当該の複数選択設問に加えて、代表習熟度を問う単一選択（single_choice）を同カテゴリ内にペアで提示する。
3. Where 設問が「はい／いいえ＋活用レベル」形式である場合, the Skill Survey Service shall 標準習熟度 4 段階の単一選択（single_choice）に正規化して提示する。
4. Where 設問が習熟度を 4 段階で問う場合, the Skill Survey Service shall 標準習熟度ラベル（L0 未経験・知識なし／L1 学習・理解はある／L2 実務で実装・運用したことがある／L3 設計・改善を主導・標準化した）を再利用し、各選択肢へ序数（level 0–3）を割り当てる。
5. The Skill Survey Service shall すべての設問形式を既存の `questionType` 駆動の描画でそのまま表示し、新規の描画コンポーネントを追加しない。

### Requirement 5: スコア分類の付与

**Objective:** As a 採用担当者, I want 習熟度を測る設問が集計対象として正しく分類される, so that 自己分析の熟練度レーダー等に正しく反映される

#### Acceptance Criteria

1. Where 設問が習熟度を問う段階スケールである場合, the Survey Seed Process shall 当該設問へ集計分類 `proficiency` を付与する。
2. Where 設問が経験ベースの複数選択（広さの申告）である場合, the Survey Seed Process shall 集計分類を付与しない（`scoring_kind` 無し）。
3. The Survey Seed Process shall `score_kind` enum の既存値のみを用い、新たな分類値を追加しない。

### Requirement 6: 必須設問とバリデーション

**Objective:** As a 採用担当者, I want フロントエンド各領域の核となる経験設問が必ず回答されている, so that 一次フィルタとして最低限のカバレッジを担保できる

#### Acceptance Criteria

1. The Skill Survey Service shall 各トップカテゴリ先頭の「経験のある〜を選択」設問を必須設問（`is_required=true`）として設定する。
2. If 必須設問が未回答のまま回答が送信された場合, then the Skill Survey Service shall 送信を拒否し、未回答の必須設問を提示する。
3. The Skill Survey Service shall 自由記述設問および任意設問を未回答でも送信を妨げない。
4. When 必須設問がすべて回答された状態で送信されたとき, the Skill Survey Service shall 回答を受理して永続化する。

### Requirement 7: 回答の永続化と再回答クールダウン

**Objective:** As a 候補者, I want 回答が保存され、一定期間後に再回答して経験の更新を反映できる, so that 成長を継続的に記録できる

#### Acceptance Criteria

1. When 候補者がフロントエンドアンケートを送信したとき, the Skill Survey Service shall 回答を既存の回答保存経路（追記型の回答レコードと設問別回答）へ保存する。
2. The Skill Survey Service shall 本アンケートの再回答クールダウンを既存設定（既定 30 日）に従って、アンケート単位で独立して適用する。
3. While クールダウン期間中である間, the Skill Survey Service shall 再回答を許可せず、次回回答可能日時を提示する。
4. The Skill Survey Service shall 過去の回答を上書きせず版として追記し、版ごとの履歴を保持する。

### Requirement 8: 自己分析への独立スナップショット供給と可視化

**Objective:** As a 候補者, I want フロントエンドアンケートの結果を自己分析画面でカテゴリ別に確認できる, so that 自分のフロントエンドスキルバランスを理解し成長アクションにつなげられる

#### Acceptance Criteria

1. When 候補者がフロントエンドアンケートに回答したとき, the Self-Analysis Service shall 本アンケート専用の独立した集計スナップショットを生成する。
2. The Self-Analysis Service shall 集計結果を既存のカバレッジ表示およびカテゴリ別熟練度レーダーで表示する（新規可視化コンポーネントを追加しない）。
3. The Self-Analysis Service shall フロントエンドアンケートのスナップショットを既存の職種別アンケートのスナップショットと併存させ、互いの表示を破壊しない。
4. The Self-Analysis Service shall 本アンケートの自己分析を、アンケート単位で独立した版履歴・版間比較として扱う。

### Requirement 9: 冪等な seed と登録

**Objective:** As a 開発者, I want アンケート定義を seed で冪等に投入できる, so that 環境構築・再実行で重複や不整合を起こさず本アンケートを配置できる

#### Acceptance Criteria

1. The Survey Seed Process shall フロントエンドアンケートの survey・カテゴリ・設問・選択肢を seed として定義し、既存の seed 登録経路へ組み込む。
2. When seed を複数回実行したとき, the Survey Seed Process shall 既存定義を冪等に upsert し、重複レコードを生成しない。
3. The Survey Seed Process shall 既存の backend / ai-driven-development アンケート seed と同じ冪等 upsert 規約（一意キーでの onConflict 更新、id の不変）に従う。
4. The Survey Seed Process shall 各段階スケール設問の選択肢へ序数（level）を、各スコア対象設問へ集計分類（熟練度）を正しく付与する。

### Requirement 10: 既存挙動の非回帰

**Objective:** As a 採用担当者, I want 新アンケート追加が既存機能を壊さない, so that 既存の職種別アンケート・自己分析を安心して使い続けられる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケート追加後も既存の職種別アンケート（backend / ai-driven-development）の一覧・回答・必須判定・クールダウンを従来どおり動作させる。
2. The Self-Analysis Service shall 既存アンケートの集計・カバレッジ表示・熟練度レーダー・版履歴を従来どおり動作させる。
3. The Skill Survey Service shall 本アンケート追加に伴う DB スキーマ・enum・共有コンポーネントの変更を行わず、既存アンケートの挙動に副作用を与えない。
