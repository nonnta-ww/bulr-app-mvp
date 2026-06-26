# Requirements Document

## Introduction

既存の職種別スキルアンケート（`backend` / `frontend` / `ai-driven-development` / `infrastructure-sre`）はいずれも個人技術職（IC）向けで、**エンジニアリングマネジメント領域が存在しない**。EM 志望・現任の候補者は自身のマネジメントスキルを自己分析・可視化できず、採用側も EM コンピテンシーのカバレッジを一次フィルタとして把握できない。

本仕様は、エンジニアリングマネージャー向けの独立スキルアンケート（`jobType='engineering-manager'`）を新設する。EM トラック向けに統合 1 本で提供し、ピープルマネジメントから戦略・組織運営までのコンピテンシーを多角的にカバーする。設問の正本 CSV は持たず、`infrastructure-sre-survey` と同じ設計駆動で設問をゼロから設計する。データ構造・スコア規約・描画・集計・履歴・クールダウンはすべて既存基盤を再利用し、新規スキーマ変更・`score_kind` enum 変更・新規 UI コンポーネントは伴わない。主たる成果物は seed データ定義とその冪等な登録・投入、およびテストである。

IC サーベイと異なり、EM はツール選択がほぼ存在しないため、代表習熟度ペア（最も得意なツール+習熟度）は採用しない。代わりに各コンピテンシーカテゴリに「実践してきたこと」（広さ）と「そのコンピテンシーの習熟度」（深さ）を 1 組ずつ配置し、全カテゴリが熟練度レーダーに乗るようにする。

## Boundary Context

- **In scope**:
  - `jobType='engineering-manager'` の独立 survey マスタとその設問構成（合意済みの 10 コンピテンシーカテゴリ）
  - マネジメント経験プロフィール設問（管理年数 / チーム規模 / manager-of-managers 経験）
  - 各コンピテンシーカテゴリへの「実践してきたこと」（multi_choice）＋「コンピテンシー習熟度」（single_choice 4段階 proficiency）の配置
  - マネジメント哲学・難しい意思決定の学びを問う自由記述設問
  - 新 survey 回答を既存の自己分析（集計→可視化→履歴）経路へ独立スナップショットとして供給
  - 冪等な seed の新規作成と登録経路への組み込み
- **Out of scope**:
  - 既存 IC アンケート（backend / frontend / ai-driven-development / infrastructure-sre）の設問内容変更
  - DB スキーマ・enum（`score_kind` 等）の変更や新規マイグレーション
  - 新規フォーム描画コンポーネント・新規可視化コンポーネントの新設（既存の `questionType` 駆動描画・カバレッジ／レーダーを再利用）
  - 管理画面（masters/skill-survey）・回答送信 Server Action の改修（jobType 非依存の汎用実装をそのまま利用）
  - EM のレベル（line manager / manager-of-managers / director 等）別に異なるアンケートを出し分けること（プロフィール設問で申告し、アンケート本体は単一とする）
  - 面接（assessment / interview）・スカウト機能との連携、複数 survey をまたぐ合成スコア・横断ランキング
- **Adjacent expectations**:
  - 前提依存: `skill-survey` 基盤および `skill-survey-proficiency-scale`（`choice.level` / `scoring_kind` / 集計の熟練度拡張）がマージ済みであること
  - 既存の回答保存テーブル（`skill_survey_response` / `skill_survey_answer`）、自己分析集計・履歴・再回答クールダウン設定をそのまま利用する
  - `score_kind` enum は既存値（`proficiency` / `recency` / `frequency`）のみを用い、新値は追加しない

## Requirements

### Requirement 1: EMアンケートの提供

**Objective:** As a 候補者（エンジニアリングマネージャー）, I want EM に特化した独立アンケートに回答できる, so that 自分のマネジメントスキルを申告し可視化できる

#### Acceptance Criteria

1. The Skill Survey Service shall `jobType='engineering-manager'` を持つアクティブな survey を 1 つ提供する。
2. When 候補者がアンケート一覧を開いたとき, the Skill Survey Service shall EM アンケートを回答可能なアンケートとして一覧に表示する。
3. The Skill Survey Service shall 本アンケートを既存の IC アンケート（backend / frontend / ai-driven-development / infrastructure-sre）と独立して提供し、既存アンケートの一覧表示・回答・集計・履歴に影響を与えない。
4. Where 候補者が複数のアンケートに回答した場合, the Skill Survey Service shall 各アンケートを独立した回答履歴・状態として扱う。

### Requirement 2: コンピテンシー軸のカテゴリ構成とマネジメント経験プロフィール

**Objective:** As a 採用担当者, I want EM の主要コンピテンシーを網羅したカテゴリ構成とマネジメント経験の前提情報, so that 候補者のマネジメント能力の広さ・深さと経験規模を把握できる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケートを次の 10 コンピテンシーカテゴリで構成する: (1) ピープルマネジメント、(2) 採用・チーム組成、(3) 育成・キャリア支援、(4) パフォーマンスマネジメント、(5) デリバリーマネジメント、(6) 技術リーダーシップ、(7) ステークホルダー・コミュニケーション、(8) 戦略・組織運営、(9) チーム文化・エンゲージメント、(10) プロセス・オペレーショナルエクセレンス。
2. The Skill Survey Service shall アンケート冒頭にマネジメント経験プロフィール（マネジメント年数・直近のチーム規模・manager-of-managers 経験の有無）を申告する設問を配置する。
3. The Skill Survey Service shall 各カテゴリ・設問・選択肢に安定した表示順を与え、マネジメント経験プロフィールをコンピテンシーカテゴリより前に表示する。
4. The Skill Survey Service shall 全体の設問量を、単一トラックとして現実的な回答ボリューム（網羅性を保ちつつ過負荷にしない範囲）に収める。

### Requirement 3: ハイブリッド設問形式と熟練度ラベルの再利用

**Objective:** As a 候補者, I want 設問の性質に合った回答形式（選択・段階・記述）で答えられる, so that 自分のマネジメント経験を正確かつ負担なく申告できる

#### Acceptance Criteria

1. Where 設問が実践してきたことの広さを問う場合, the Skill Survey Service shall 複数選択（multi_choice）として提示する。
2. Where 設問が習熟度を問う場合, the Skill Survey Service shall 単一選択（single_choice）として提示し、各選択肢に序数（level）を割り当てる。
3. Where 設問が習熟度を 4 段階で問う場合, the Skill Survey Service shall 標準習熟度ラベル（L0 未経験・知識なし／L1 学習・理解はある／L2 実務で実践したことがある／L3 設計・改善を主導・標準化した）を再利用し、各選択肢へ序数（level 0–3）を割り当てる。
4. Where 設問がマネジメント哲学や難しい意思決定からの学びを問う場合, the Skill Survey Service shall 自由記述（free_text）として提示し、任意回答とする。
5. The Skill Survey Service shall すべての設問形式を既存の `questionType` 駆動の描画でそのまま表示し、新規の描画コンポーネントを追加しない。

### Requirement 4: コンピテンシー別の習熟度測定

**Objective:** As a 採用担当者, I want 各コンピテンシーで「経験の広さ」だけでなく「習熟度」を把握できる, so that 全コンピテンシーを自己分析レーダーで横断的に評価できる

#### Acceptance Criteria

1. The Skill Survey Service shall 10 コンピテンシーカテゴリのそれぞれに、実践してきたことを問う複数選択設問と、そのコンピテンシーの習熟度を問う段階スケール設問を配置する。
2. Where コンピテンシー習熟度の段階スケールを提示する場合, the Skill Survey Service shall 標準習熟度ラベル（level 0–3）を用いる。
3. The Skill Survey Service shall 各コンピテンシー習熟度設問を熟練度（proficiency）として集計対象に分類する。
4. The Skill Survey Service shall 代表習熟度ペア（特定ツールを1つ選ぶ方式）を本アンケートでは採用しない。

### Requirement 5: スコア分類の付与

**Objective:** As a 採用担当者, I want 習熟度を測る設問が集計対象として正しく分類される, so that 自己分析の熟練度レーダー等に正しく反映される

#### Acceptance Criteria

1. Where 設問がコンピテンシー習熟度を問う段階スケールである場合, the Survey Seed Process shall 当該設問へ集計分類 `proficiency` を付与する。
2. Where 設問が経験ベースの複数選択（広さの申告）またはマネジメント経験プロフィールである場合, the Survey Seed Process shall 集計分類を付与しない（`scoring_kind` 無し）。
3. The Survey Seed Process shall `score_kind` enum の既存値のみを用い、新たな分類値を追加しない。

### Requirement 6: 必須設問とバリデーション

**Objective:** As a 採用担当者, I want EM 各コンピテンシーの核となる経験設問が必ず回答されている, so that 一次フィルタとして最低限のカバレッジを担保できる

#### Acceptance Criteria

1. The Skill Survey Service shall 各コンピテンシーカテゴリ先頭の「実践してきたことを選択」設問を必須設問（`is_required=true`）として設定する。
2. If 必須設問が未回答のまま回答が送信された場合, then the Skill Survey Service shall 送信を拒否し、未回答の必須設問を提示する。
3. The Skill Survey Service shall 自由記述設問および任意設問を未回答でも送信を妨げない。
4. When 必須設問がすべて回答された状態で送信されたとき, the Skill Survey Service shall 回答を受理して永続化する。

### Requirement 7: 回答の永続化と再回答クールダウン

**Objective:** As a 候補者, I want 回答が保存され、一定期間後に再回答して経験の更新を反映できる, so that 成長を継続的に記録できる

#### Acceptance Criteria

1. When 候補者が EM アンケートを送信したとき, the Skill Survey Service shall 回答を既存の回答保存経路（追記型の回答レコードと設問別回答）へ保存する。
2. The Skill Survey Service shall 本アンケートの再回答クールダウンを既存設定（既定 30 日）に従って、アンケート単位で独立して適用する。
3. While クールダウン期間中である間, the Skill Survey Service shall 再回答を許可せず、次回回答可能日時を提示する。
4. The Skill Survey Service shall 過去の回答を上書きせず版として追記し、版ごとの履歴を保持する。

### Requirement 8: 自己分析への独立スナップショット供給と可視化

**Objective:** As a 候補者, I want EM アンケートの結果を自己分析画面でコンピテンシー別に確認できる, so that 自分のマネジメントスキルバランスを理解し成長アクションにつなげられる

#### Acceptance Criteria

1. When 候補者が EM アンケートに回答したとき, the Self-Analysis Service shall 本アンケート専用の独立した集計スナップショットを生成する。
2. The Self-Analysis Service shall 集計結果を既存のカバレッジ表示およびカテゴリ別熟練度レーダーで表示する（新規可視化コンポーネントを追加しない）。
3. The Self-Analysis Service shall EM アンケートのスナップショットを既存の職種別アンケートのスナップショットと併存させ、互いの表示を破壊しない。
4. The Self-Analysis Service shall 本アンケートの自己分析を、アンケート単位で独立した版履歴・版間比較として扱う。

### Requirement 9: 冪等な seed と登録

**Objective:** As a 開発者, I want アンケート定義を seed で冪等に投入できる, so that 環境構築・再実行で重複や不整合を起こさず本アンケートを配置できる

#### Acceptance Criteria

1. The Survey Seed Process shall EM アンケートの survey・カテゴリ・設問・選択肢を seed として定義し、既存の seed 登録経路へ組み込む。
2. When seed を複数回実行したとき, the Survey Seed Process shall 既存定義を冪等に upsert し、重複レコードを生成しない。
3. The Survey Seed Process shall 既存の IC アンケート seed と同じ冪等 upsert 規約（一意キーでの onConflict 更新、id の不変）に従う。
4. The Survey Seed Process shall 各コンピテンシー習熟度設問の選択肢へ序数（level）を、各スコア対象設問へ集計分類（熟練度）を正しく付与する。

### Requirement 10: 既存挙動の非回帰

**Objective:** As a 採用担当者, I want 新アンケート追加が既存機能を壊さない, so that 既存の職種別アンケート・自己分析を安心して使い続けられる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケート追加後も既存の IC アンケート（backend / frontend / ai-driven-development / infrastructure-sre）の一覧・回答・必須判定・クールダウンを従来どおり動作させる。
2. The Self-Analysis Service shall 既存アンケートの集計・カバレッジ表示・熟練度レーダー・版履歴を従来どおり動作させる。
3. The Skill Survey Service shall 本アンケート追加に伴う DB スキーマ・enum・共有コンポーネントの変更を行わず、既存アンケートの挙動に副作用を与えない。
