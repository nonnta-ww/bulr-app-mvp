# Requirements Document

## Introduction

RPGクラス診断（`diagnosis-archetypes`）は、12アーキタイプのうち Optimizer（改善屋）/ Firefighter（火消し）/ Mentor（育成役）/ Integrator（調整役）/ Innovator（開拓者）を判別する信号として、任意入力 `DispositionScores`（改善志向 improvement／障害対応志向 incident／育成志向 mentoring／調整・橋渡し志向 coordination／新技術採用志向 newTech、各 0..100）を受け取れるように設計済みだが、この入力を実際に供給する診断が存在しないため、上記5アーキタイプは現状ほぼ到達不能である。

本 spec は、候補者の「働き方の志向（何に価値を感じ・どんな行動で貢献するか）」を測る新規アンケートを既存 skill_survey 基盤に追加し、その回答から決定論的に `DispositionScores` を算出する純関数を提供し、`class-diagnosis` の `resolveArchetype` 呼び出し箇所（ClassCard・SharePanel）へ実際に配線する。アーキタイプの確定ロジック自体（`diagnosis-archetypes`）や既存の気質4軸（探索⇔深化 / 個人⇔協調 / 計画⇔即興 / 堅実⇔挑戦）は変更しない。

## Boundary Context

- **In scope**: 志向（改善／障害対応／育成／調整・橋渡し／新技術採用）を弁別する設問・選択肢マスタの設計と seed 投入、志向アンケート回答から `DispositionScores` を算出する決定論的スコアリング純関数、当該アンケートの本人回答取得 query、`class-diagnosis` ページから `ClassCard`/`SharePanel` への `DispositionScores` の配線（props 追加）。
- **Out of scope**: アーキタイプ定義・`resolveArchetype` の判定ロジック自体（`diagnosis-archetypes` が所有、読み取りのみ）、既存気質4軸（playstyle/thinking-style）の変更、`ClassResult` 型・`vocationVector`／`temperament` 算出ロジックの変更、志向診断結果の DB 永続化・履歴・版間比較。
- **Adjacent expectations**: `skill-survey`（seed 基盤・`scoreKind` enum・`runSkillSurveySeed` ランナー）は拡張のみ許容し破壊的変更をしない。`diagnosis-archetypes` の `DispositionScores`／`DispositionKey` 型契約（`apps/candidate/app/class-diagnosis/_lib/archetype/dispositions.ts`）は本 spec からは読み取り専用の import とし、キー集合・値域（0..100）を変更しない。

## Requirements

### Requirement 1: 志向アンケートの定義と seed 投入

**Objective:** As a プロダクトチーム, I want 5つの志向（改善／障害対応／育成／調整・橋渡し／新技術採用）を弁別する設問セットを新規アンケートとして seed 投入したい, so that 候補者がこの志向を自己申告でき、診断入力として利用できる

#### Acceptance Criteria

1. The システム shall 新規アンケート（`kind='worklife_disposition'`、`jobType='worklife-disposition'`）を既存 `skill_survey`／`skill_survey_category`／`skill_survey_question`／`skill_survey_choice` 4階層マスタスキーマへ追加のスキーマ変更なしで seed 投入する。
2. The システム shall 改善志向／障害対応志向／育成志向／調整・橋渡し志向／新技術採用志向の5カテゴリを設問マスタに含む。
3. Where 各カテゴリの弁別力を確保する必要がある場合, the システム shall 各カテゴリに複数設問（同一志向を肯定する自然表現の設問）を割り当てる。
4. The システム shall 各設問の `scoringKind` を、志向スコア（0..100 の連続量）へ写像可能な値（例: 既存 `scoreKind` enum 内の値）で設定する。
5. The システム shall 各カテゴリの `subcategory` を非 null で設定する（`skill_survey_category` の一意制約 `(skillSurveyId, name, subcategory)` は NULLS DISTINCT のため、null では冪等 upsert が一致しない）。
6. When seed 投入処理が再実行されたとき, the システム shall 既存 `jobType` の一意制約に基づき冪等に upsert する（重複レコードを作らない）。
7. The システム shall 既存 `score_kind`／`survey_kind` enum 値の削除・意味変更を行わない（値の追加のみ許容）。

### Requirement 2: 志向スコアリング（回答→DispositionScores）

**Objective:** As a 候補者, I want 自分の志向アンケート回答から5つの志向スコアを決定論的に算出してほしい, so that その結果が RPG クラス診断のアーキタイプ判別に反映される

#### Acceptance Criteria

1. The システム shall 志向アンケートの回答（`SurveyResponseForAnalysis` 相当の構造）を入力に取り、`DispositionScores`（`improvement`／`incident`／`mentoring`／`coordination`／`newTech` を任意キーに持つ 0..100 の部分マップ）を返す純関数を提供する。
2. While 同一の回答データが与えられている間, the システム shall 常に同一の `DispositionScores` を返す（副作用・乱数・現在時刻に非依存の決定論）。
3. When 特定の志向カテゴリに属する設問がすべて未回答のとき, the システム shall そのカテゴリに対応する `DispositionKey` を返り値のオブジェクトに含めない（キー自体を省略し、寄与0として扱われるようにする）。
4. If 志向アンケートへの回答が一切存在しない場合（未回答）, then the システム shall 空オブジェクト（`{}`）を返す。
5. The システム shall 算出した各志向スコアを 0 以上 100 以下にクランプする。
6. The システム shall `DispositionKey`／`DispositionScores` の型を `apps/candidate/app/class-diagnosis/_lib/archetype/dispositions.ts` からそのまま import して用い、独自に再定義しない。

### Requirement 3: resolveArchetype 呼び出し箇所への配線

**Objective:** As a 候補者, I want 自分の志向アンケート結果が実際に RPG クラス診断のアーキタイプ判定に使われてほしい, so that Optimizer/Firefighter/Mentor/Integrator/Innovator が到達可能になる

#### Acceptance Criteria

1. When `class-diagnosis` ページ（Server Component）が診断結果を組み立てるとき, the システム shall 候補者本人の志向アンケート回答を取得し、Requirement 2 のスコアリング関数で `DispositionScores` を算出する。
2. The システム shall 算出した `DispositionScores` を `ClassCard` および `SharePanel` へ props として渡す。
3. When `ClassCard` および `SharePanel` が `resolveArchetype`（および `scoreArchetype`）を呼び出すとき, the システム shall 受け取った `DispositionScores` を第2引数として渡す。
4. The システム shall `resolveArchetype`／`ArchetypeSignature`／アーキタイプ定義（`diagnosis-archetypes` が所有するファイル群）を変更しない（読み取り専用の呼び出しのみ）。
5. The システム shall 本人所有スコープ（`candidateProfile.id`）でのみ志向アンケート回答を取得し、他候補者のデータへアクセスしない。

### Requirement 4: 未回答時の graceful degradation

**Objective:** As a 候補者, I want 志向アンケートに未回答・部分回答でもクラス診断が壊れず表示されてほしい, so that 既存のクラス診断体験が損なわれない

#### Acceptance Criteria

1. If 候補者が志向アンケートに一切回答していない場合, then the システム shall 空の `DispositionScores`（`{}`）を `resolveArchetype` に渡し、既存の職掌×気質のみによる判定結果を維持する。
2. While 志向アンケートの取得・スコアリング処理が実行されている間, the システム shall 例外発生時にもページ全体をクラッシュさせず、空の `DispositionScores` にフォールバックする。
3. The システム shall 志向アンケート未 seed（`getWorklifeDispositionSurveyId` 相当が null を返す）の場合でも `class-diagnosis` ページを正常にレンダリングする。
4. The システム shall 志向アンケートの回答有無によって既存のクラス診断の状態分岐（NoVocation / Empty / PartialNoTemperament / Complete / VizOnly / Stale）の判定条件を変更しない。

### Requirement 5: 数値非表示と表示制約の踏襲

**Objective:** As a 候補者, I want 志向診断についても数値スコアや他者比較を見せられたくない, so that 既存のクラス診断の情報開示方針と一貫する

#### Acceptance Criteria

1. The システム shall 志向スコアの数値（0..100 の値）を候補者向け UI のいかなる画面にも表示しない。
2. The システム shall 志向スコアの偏差値・順位・他者比較を算出・表示しない。
3. The システム shall 志向アンケートの個々の回答ラベル・設問文を `SharePanel` の共有テキストに含めない。

### Requirement 6: 依存方向とテスト方針の遵守

**Objective:** As a 開発チーム, I want 本 spec の実装が既存の依存方向とテスト運用ルールを守ってほしい, so that 保守性とビルド健全性が保たれる

#### Acceptance Criteria

1. The システム shall 依存方向 `types → db → ai → apps` を遵守し、`packages/db` は `apps/*` を import しない。
2. The システム shall 志向スコアリング純関数を app ローカル（`apps/candidate/app/class-diagnosis/_lib/` 配下）に置き、クロスパッケージ消費者が存在しない型を `@bulr/types` へ追加しない。
3. The システム shall DB を要する統合テストにおいてクリーンな DB 前提かつ直列実行（`fileParallelism:false`）で動作することを保証する。
4. The システム shall 志向アンケートを候補者向けアンケート一覧（`answered-surveys-query.ts` 等の既存フィルタ）から不用意に露出させない（`kind` フィルタの包含条件を確認する）。
