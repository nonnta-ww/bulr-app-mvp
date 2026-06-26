# Research Log — infrastructure-sre-survey

## Discovery Scope

- **Type**: Extension / Simple Addition（既存 skill-survey 基盤への seed 追加）
- **Process**: Light discovery。frontend-survey / ai-driven-development-survey の先行実装パターンを踏襲。設問は正本 CSV を持たず設計駆動（ai-driven 同様）。
- 外部技術調査は不要（インフラ/SRE のスキル体系は既知のドメイン知識で構成）。

## Key Findings

### F1: skill-survey 基盤は jobType 非依存（frontend-survey で実証済み）

- マスタ 4 階層: `skill_survey`(jobType 一意) → `skill_survey_category`((surveyId,name,subcategory) 一意) → `skill_survey_question`((categoryId,body) 一意, `questionType`/`scoringKind`/`isRequired`) → `skill_survey_choice`((questionId,label) 一意, `level`)。
- 候補者一覧は `db.select().from(skillSurvey).where(eq(skillSurvey.isActive, true))`（`apps/candidate/app/skill-survey/page.tsx`）で全アクティブ survey を取得。新 jobType は seed 追加のみで一覧・回答・自己分析に出現。
- フォーム描画・送信/必須検証/クールダウン・集計（`aggregate()`）・可視化（`CoverageBars`/`SkillBalanceRadar`）・版履歴は survey 非依存で無変更。

### F2: seed 規約（backend / frontend / ai-driven 共通）

- 冪等 upsert: 全テーブル `onConflictDoUpdate`、id は初回生成後不変。`runFrontendSkillSurveySeed` と同型の `runInfrastructureSreSkillSurveySeed` を実装し `seeds/index.ts` に登録。
- 標準習熟度 4 段階ラベル（level 0–3）: L0 未経験・知識なし／L1 学習・理解はある（実務経験なし）／L2 実務で実装・運用したことがある／L3 設計・改善を主導／チームへ展開・標準化した。
- 代表習熟度ペア（frontend で確立）: 「最も得意な X を1つ選ぶ」`single_choice`（scoringKind 無し）＋「選んだ X の習熟度」`single_choice`（scoringKind=proficiency, level 0–3）。

### F3: 設計駆動（CSV なし）

- backend/frontend は `docs/*.csv` を正本にしたが、本アンケートは CSV を持たない。ai-driven-development-survey と同じく設問・選択肢を設計で確定する。
- `score_kind` enum は既存値（proficiency/recency/frequency）で足り、変更不要（frequency も本アンケートでは未使用）。

### F4: テスト慣習（frontend で実証）

- vitest の include は `src/**/*.integration.test.ts`。`DATABASE_URL` 未設定時は `describe.skip`、migrator で自己適用、seed 投入後に冪等・構造を assert。
- 注意: dev DB（bulr_dev）は drizzle push 由来で migrator journal が空 → migrate 衝突。テストはクリーン DB（例 bulr_isre_test を都度 CREATE）で実走する。

## Design Decisions

### D1: 統合 1 本・両層同居

- `jobType='infrastructure-sre'` 1 本に共通インフラ層 6 + SRE・信頼性層 6 の計 12 トップカテゴリを同居（Req 2.1, 2.2）。インフラ/SRE を分離しない（Req 1.4）。

### D2: proficiency 信号の供給（代表習熟度ペア）

- ツール選択が高シグナルな 5 カテゴリ（クラウド / コンテナ・オーケストレーション / IaC / CI/CD / 可観測性）に代表習熟度ペアを付与し、自己分析レーダーへ data point を供給（Req 4）。
- 信頼性設計・インシデント対応・自動化など実践系カテゴリは breadth（multi_choice）中心。proficiency を持たないカテゴリは既存レーダーの graceful 除外に委ねる（Req 8.5）。

### D3: 必須設問

- 各トップカテゴリ先頭の「経験のある〜を選択」設問を `isRequired=true`（12 問）。一次フィルタの最低カバレッジ担保（Req 6.1）。

## Risks

- **R-1（低）**: 設計駆動のため設問の網羅性・粒度がレビュー依存 → design にカテゴリ別設問プラン表を全件掲載しレビュー可能化。
- **R-2（低）**: ツール名の表記ゆれ・陳腐化 → 主要ツールは正式名で記載。将来更新は seed 再実行で冪等反映。
- **R-3（低）**: SRE 固有観点（SLO/エラーバジェット等）の取りこぼし → Req 2.3 を信頼性設計・インシデント対応カテゴリで明示カバー。
