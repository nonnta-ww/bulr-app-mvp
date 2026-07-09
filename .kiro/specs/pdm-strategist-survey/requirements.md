# Requirements Document

## Introduction

RPG クラス診断における職掌「策士（プロダクトマネージャー, PdM）」とアーキタイプ「Strategist（戦略家）」は、`diagnosis-archetypes` の signature（`vocation: { strategist: 0.9 }`）まで定義済みだが、対応するスキルアンケートが存在しないため `vocationVector.strategist` が常に 0 となり、実運用で確定できない非活性枠のままである。プロダクトマネジメント寄りの候補者は、自分の強み（プロダクト戦略・意思決定・優先順位付け）を反映した診断結果を得られない。

本仕様は、PdM 向けの独立スキルアンケート（`jobType='product-manager'`）を新設する。`engineering-manager-survey` と同じ設計駆動アプローチ（正本 CSV を持たず、プロフィール＋コンピテンシー、breadth＋proficiency のハイブリッド形式）を踏襲し、プロダクトの「何を・なぜ作るか（what/why）」に関するコンピテンシーで構成する。データ構造・スコア規約・描画・集計・履歴・クールダウン・アンケート一覧はすべて既存の skill-survey 基盤を再利用し、新規スキーマ変更・`score_kind` enum 変更・新規 UI コンポーネントは伴わない。加えて `JOBTYPE_DEFAULT_VOCATION` へ1行追加し、`vocationVector.strategist` を回答から算出可能にすることで、Strategist アーキタイプおよび策士職掌を診断で開放する。

**最重要の境界**: Commander（エンジニアリングマネージャー, EM）は「人と組織のマネジメント」を担い、Strategist（プロダクトマネージャー, PdM）は「プロダクトの what/why（何を作るべきか、なぜそれを作るのか）」を担う。両者は職能として近接して見えるが職掌ベクトル上は独立した軸であり、本アンケートのコンピテンシーは EM のピープルマネジメント系コンピテンシー（1on1・フィードバック・採用・育成・評価・組織設計等）と意図的に重複させない。

## Boundary Context

- **In scope**:
  - `jobType='product-manager'` の独立 survey マスタとその設問構成（PdM コンピテンシーカテゴリ）
  - PdM 経験プロフィール設問（PdM 経験年数 / 直近で担当したプロダクト規模・フェーズ / 事業サイド兼務有無 等、集計対象外）
  - 各コンピテンシーカテゴリへの「実践してきたこと」（multi_choice, breadth）＋「コンピテンシー習熟度」（single_choice 4段階, proficiency）の配置
  - プロダクト戦略・意思決定の思想を問う自由記述設問
  - 新 survey 回答を既存の自己分析（集計→可視化→履歴）経路へ独立スナップショットとして供給
  - 冪等な seed の新規作成と登録経路（`packages/db/src/seeds/index.ts`）への組み込み
  - `apps/candidate/app/class-diagnosis/_lib/definitions.ts` の `JOBTYPE_DEFAULT_VOCATION` へ `product-manager` → `strategist` の1行追加
- **Out of scope**:
  - 既存アンケート（backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager / playstyle / thinking-style）の設問内容変更
  - DB スキーマ・enum（`score_kind` 等）の変更や新規マイグレーション
  - 新規フォーム描画コンポーネント・新規可視化コンポーネントの新設（既存の `questionType` 駆動描画・カバレッジ／熟練度レーダーを再利用）
  - `diagnosis-archetypes` のアーキタイプ導出ロジック・signature・表示コンポーネント（`resolveArchetype` / `ARCHETYPE_SIGNATURES` / `ClassCard` / `SharePanel`）の変更
  - `JOBTYPE_DEFAULT_VOCATION` 以外の判定パラメータ（`CATEGORY_AFFINITY` 等）への新規追加（横断カテゴリが必要と判明した場合のみ検討）
  - 管理画面（masters/skill-survey）・回答送信 Server Action の改修（jobType 非依存の汎用実装をそのまま利用）
  - EM（人と組織のマネジメント）・PdM（プロダクトの what/why）を統合した単一アンケートにすること（両者は独立した jobType・独立した survey として維持する）
- **Adjacent expectations**:
  - 前提依存: `skill-survey` 基盤、`skill-survey-proficiency-scale`（`choice.level` / `scoring_kind` / 集計の熟練度拡張）、`engineering-manager-survey`（設計駆動パターンの参照元）、`diagnosis-archetypes`（`Strategist` アーキタイプ・signature 定義済み）がマージ済みであること
  - `diagnosis-archetypes` の `ARCHETYPE_SIGNATURES.strategist = { vocation: { strategist: 0.9 }, pole: { planner: 0.4 } }` は本仕様が変更せず前提として利用する
  - 既存の回答保存テーブル（`skill_survey_response` / `skill_survey_answer`）、自己分析集計・履歴・再回答クールダウン設定（既定 30 日）をそのまま利用する
  - `score_kind` enum は既存値（`proficiency` / `recency` / `frequency` / `polarity`）のみを用い、新値は追加しない

## Requirements

### Requirement 1: PdMアンケートの提供

**Objective:** As a 候補者（プロダクトマネージャー）, I want PdM に特化した独立アンケートに回答できる, so that 自分のプロダクトマネジメントスキルを申告し可視化できる

#### Acceptance Criteria

1. The Skill Survey Service shall `jobType='product-manager'` を持つアクティブな survey を1つ提供する。
2. When 候補者がアンケート一覧を開いたとき, the Skill Survey Service shall PdM アンケートを回答可能なアンケートとして一覧に表示する。
3. The Skill Survey Service shall 本アンケートを既存の IC アンケート（backend / frontend / ai-driven-development / infrastructure-sre）および engineering-manager アンケートと独立して提供し、既存アンケートの一覧表示・回答・集計・履歴に影響を与えない。
4. Where 候補者が複数のアンケートに回答した場合, the Skill Survey Service shall 各アンケートを独立した回答履歴・状態として扱う。

### Requirement 2: PdMコンピテンシー軸のカテゴリ構成とPdM経験プロフィール

**Objective:** As a 採用担当者, I want PdM の主要コンピテンシーを網羅したカテゴリ構成とPdM経験の前提情報, so that 候補者のプロダクトマネジメント能力の広さ・深さと経験規模を把握できる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケートを次の8コンピテンシーカテゴリで構成する: (1) プロダクト戦略、(2) ディスカバリー・顧客理解、(3) 優先順位付け・意思決定、(4) ロードマップ・実行推進、(5) データドリブン運用、(6) ステークホルダー・組織連携、(7) GTM・グロース連携、(8) UX・ビジネス・テクノロジーの越境。
2. The Skill Survey Service shall アンケート冒頭にPdM経験プロフィール（PdM経験年数・直近で担当したプロダクトの規模やフェーズ・事業サイド兼務の有無）を申告する設問を配置する。
3. The Skill Survey Service shall 各カテゴリ・設問・選択肢に安定した表示順を与え、PdM経験プロフィールをコンピテンシーカテゴリより前に表示する。
4. The Skill Survey Service shall 全体の設問量を、単一トラックとして現実的な回答ボリューム（網羅性を保ちつつ過負荷にしない範囲）に収める。

### Requirement 3: EMとの境界（人と組織のマネジメント vs プロダクトのwhat/why）

**Objective:** As a 採用担当者, I want PdMアンケートがEM（人と組織のマネジメント）と職能的に重複しない, so that 策士（PdM）とCommander（EM）の職掌スコアが混同されず正しく弁別できる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケートのコンピテンシーカテゴリに、EM アンケートが対象とするピープルマネジメント領域（1on1・フィードバック・採用面接・育成・評価・報酬・組織設計・エンゲージメント計測等の人・組織マネジメント）を含めない。
2. Where 設問がステークホルダー・組織連携を扱う場合, the Skill Survey Service shall 対象を「プロダクトの意思決定に関わる合意形成・調整（経営・営業・開発・デザイン・顧客との合意形成）」に限定し、部下の人事評価・育成・チーム編成を対象に含めない。
3. The Skill Survey Service shall 本アンケートを EM アンケートとは独立した jobType として提供し、両者を統合した単一アンケートにしない。

### Requirement 4: ハイブリッド設問形式と熟練度ラベルの再利用

**Objective:** As a 候補者, I want 設問の性質に合った回答形式（選択・段階・記述）で答えられる, so that 自分のプロダクトマネジメント経験を正確かつ負担なく申告できる

#### Acceptance Criteria

1. Where 設問が実践してきたことの広さを問う場合, the Skill Survey Service shall 複数選択（multi_choice）として提示する。
2. Where 設問が習熟度を問う場合, the Skill Survey Service shall 単一選択（single_choice）として提示し、各選択肢に序数（level）を割り当てる。
3. Where 設問が習熟度を4段階で問う場合, the Skill Survey Service shall 標準習熟度ラベル（L0 未経験・知識なし／L1 学習・理解はある／L2 実務で実践したことがある／L3 設計・改善を主導・標準化した）を再利用し、各選択肢へ序数（level 0-3）を割り当てる。
4. Where 設問がプロダクト戦略の思想や難しい意思決定からの学びを問う場合, the Skill Survey Service shall 自由記述（free_text）として提示し、任意回答とする。
5. The Skill Survey Service shall すべての設問形式を既存の `questionType` 駆動の描画でそのまま表示し、新規の描画コンポーネントを追加しない。

### Requirement 5: コンピテンシー別の習熟度測定

**Objective:** As a 採用担当者, I want 各コンピテンシーで「経験の広さ」だけでなく「習熟度」を把握できる, so that 全コンピテンシーを自己分析レーダーで横断的に評価できる

#### Acceptance Criteria

1. The Skill Survey Service shall 8コンピテンシーカテゴリのそれぞれに、実践してきたことを問う複数選択設問と、そのコンピテンシーの習熟度を問う段階スケール設問を配置する。
2. Where コンピテンシー習熟度の段階スケールを提示する場合, the Skill Survey Service shall 標準習熟度ラベル（level 0-3）を用いる。
3. The Skill Survey Service shall 各コンピテンシー習熟度設問を熟練度（proficiency）として集計対象に分類する。
4. The Skill Survey Service shall 代表習熟度ペア（特定ツールを1つ選ぶ方式）を本アンケートでは採用しない。

### Requirement 6: スコア分類の付与

**Objective:** As a 採用担当者, I want 習熟度を測る設問が集計対象として正しく分類される, so that 自己分析の熟練度レーダー等に正しく反映される

#### Acceptance Criteria

1. Where 設問がコンピテンシー習熟度を問う段階スケールである場合, the Survey Seed Process shall 当該設問へ集計分類 `proficiency` を付与する。
2. Where 設問が経験ベースの複数選択（広さの申告）またはPdM経験プロフィールである場合, the Survey Seed Process shall 集計分類を付与しない（`scoring_kind` 無し）。
3. The Survey Seed Process shall `score_kind` enum の既存値のみを用い、新たな分類値を追加しない。

### Requirement 7: 必須設問とバリデーション

**Objective:** As a 採用担当者, I want PdM各コンピテンシーの核となる経験設問が必ず回答されている, so that 一次フィルタとして最低限のカバレッジを担保できる

#### Acceptance Criteria

1. The Skill Survey Service shall 各コンピテンシーカテゴリ先頭の「実践してきたことを選択」設問を必須設問（`is_required=true`）として設定する。
2. If 必須設問が未回答のまま回答が送信された場合, then the Skill Survey Service shall 送信を拒否し、未回答の必須設問を提示する。
3. The Skill Survey Service shall 自由記述設問および任意設問を未回答でも送信を妨げない。
4. When 必須設問がすべて回答された状態で送信されたとき, the Skill Survey Service shall 回答を受理して永続化する。

### Requirement 8: 回答の永続化と再回答クールダウン

**Objective:** As a 候補者, I want 回答が保存され、一定期間後に再回答して経験の更新を反映できる, so that 成長を継続的に記録できる

#### Acceptance Criteria

1. When 候補者がPdMアンケートを送信したとき, the Skill Survey Service shall 回答を既存の回答保存経路（追記型の回答レコードと設問別回答）へ保存する。
2. The Skill Survey Service shall 本アンケートの再回答クールダウンを既存設定（既定30日）に従って、アンケート単位で独立して適用する。
3. While クールダウン期間中である間, the Skill Survey Service shall 再回答を許可せず、次回回答可能日時を提示する。
4. The Skill Survey Service shall 過去の回答を上書きせず版として追記し、版ごとの履歴を保持する。

### Requirement 9: 自己分析への独立スナップショット供給と可視化

**Objective:** As a 候補者, I want PdMアンケートの結果を自己分析画面でコンピテンシー別に確認できる, so that 自分のプロダクトマネジメントスキルバランスを理解し成長アクションにつなげられる

#### Acceptance Criteria

1. When 候補者がPdMアンケートに回答したとき, the Self-Analysis Service shall 本アンケート専用の独立した集計スナップショットを生成する。
2. The Self-Analysis Service shall 集計結果を既存のカバレッジ表示およびカテゴリ別熟練度レーダーで表示する（新規可視化コンポーネントを追加しない）。
3. The Self-Analysis Service shall PdMアンケートのスナップショットを既存の職種別アンケート・EMアンケートのスナップショットと併存させ、互いの表示を破壊しない。
4. The Self-Analysis Service shall 本アンケートの自己分析を、アンケート単位で独立した版履歴・版間比較として扱う。

### Requirement 10: 職掌マッピングによるStrategistアーキタイプ・策士職掌の開放

**Objective:** As a 候補者（プロダクトマネージャー）, I want PdMアンケートに回答すると策士職掌スコアとStrategistアーキタイプが算出される, so that 自分の適性が正しく反映されたクラス診断結果を得られる

#### Acceptance Criteria

1. The Class Diagnosis Service shall `jobType='product-manager'` を既定職掌 `strategist`（策士）へマッピングする定義を1件持つ。
2. When 候補者がPdMアンケートに回答し職掌判定が行われたとき, the Class Diagnosis Service shall `vocationVector.strategist` を0より大きい値として算出する。
3. The Class Diagnosis Service shall 本マッピング追加によって既存の他 jobType（frontend / backend / infrastructure-sre / engineering-manager / ai-driven-development）の既定職掌マッピングを変更しない。
4. The Class Diagnosis Service shall 本マッピング追加以外の判定ロジック（`resolveCategoryVocationWeights` の解決規約・重みテーブル形状）を変更しない。

### Requirement 11: 冪等な seed と登録

**Objective:** As a 開発者, I want アンケート定義を seed で冪等に投入できる, so that 環境構築・再実行で重複や不整合を起こさず本アンケートを配置できる

#### Acceptance Criteria

1. The Survey Seed Process shall PdMアンケートの survey・カテゴリ・設問・選択肢を seed として定義し、既存の seed 登録経路へ組み込む。
2. When seed を複数回実行したとき, the Survey Seed Process shall 既存定義を冪等に upsert し、重複レコードを生成しない。
3. The Survey Seed Process shall 既存の IC アンケート・EM アンケート seed と同じ冪等 upsert 規約（一意キーでの onConflict 更新、id の不変）に従う。
4. The Survey Seed Process shall 各コンピテンシー習熟度設問の選択肢へ序数（level）を、各スコア対象設問へ集計分類（熟練度）を正しく付与する。

### Requirement 12: 既存挙動の非回帰

**Objective:** As a 採用担当者, I want 新アンケート追加が既存機能を壊さない, so that 既存の職種別アンケート・EMアンケート・自己分析・クラス診断を安心して使い続けられる

#### Acceptance Criteria

1. The Skill Survey Service shall 本アンケート追加後も既存の全アンケート（backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager / playstyle / thinking-style）の一覧・回答・必須判定・クールダウンを従来どおり動作させる。
2. The Self-Analysis Service shall 既存アンケートの集計・カバレッジ表示・熟練度レーダー・版履歴を従来どおり動作させる。
3. The Class Diagnosis Service shall 本アンケート追加・`JOBTYPE_DEFAULT_VOCATION` への1行追加後も、strategist 以外の既存6職掌（vanguard / rearguard / guardian / sage / commander / ranger）のスコア算出結果を変更しない。
4. The Skill Survey Service shall 本アンケート追加に伴う DB スキーマ・enum・共有コンポーネントの変更を行わず、既存アンケートおよび `diagnosis-archetypes` の導出ロジックの挙動に副作用を与えない。
