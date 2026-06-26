# Research Log — frontend-survey

## Discovery Scope

- **Type**: Extension / Simple Addition（既存 skill-survey 基盤への seed 追加）
- **Process**: Light discovery（既存パターン解析中心。外部技術調査は不要）
- 既存 2 職種アンケート（backend / ai-driven-development）の seed 実装・登録・テスト慣習を正本コンテンツ `docs/frontend-skills.csv` に適用する方針を確認した。

## Key Findings

### F1: skill-survey 基盤は jobType 非依存

- マスタ 4 階層: `skill_survey`(jobType 一意) → `skill_survey_category`((surveyId,name,subcategory) 一意) → `skill_survey_question`((categoryId,body) 一意, `questionType`/`scoringKind`/`isRequired`) → `skill_survey_choice`((questionId,label) 一意, `level`)。
- フォーム描画（`apps/candidate/app/skill-survey/_components/survey-form.tsx`）・送信/必須検証/クールダウン（`submit-survey.ts`）・自己分析集計（`aggregate()`）・可視化（`CoverageBars` / `SkillBalanceRadar`）・版履歴はすべて survey 非依存。
- **含意**: 新職種は seed 追加のみで一覧・回答・自己分析に出現する。UI・Server Action・スキーマ・集計の改修は不要。

### F2: backend seed の変換規約（踏襲対象）

- `backendSurveySeed`（`packages/db/src/seeds/skill-surveys/backend.ts`）は CSV 由来の base カテゴリ（displayOrder 0–53）に加え、`skill-survey-proficiency-scale` / `candidate-self-analysis` spec が **代表習熟度ペア**（「最も得意な X を1つ選ぶ」single_choice + 「選んだ X の習熟度」proficiency single_choice level 0–3）を主要 3 カテゴリに、**深掘り**（free_text, scoringKind 無し）と**直近利用**（recency）を後付けした。
- 冪等 upsert: 全テーブルで `onConflictDoUpdate`、id は初回生成後不変（`set` に id を含めない）。
- 標準習熟度 4 段階ラベル: L0 未経験・知識なし／L1 学習・理解はある（実務経験なし）／L2 実務で実装・運用したことがある／L3 設計・改善を主導／チームへ展開・標準化した。

### F3: frontend CSV の特性

- 69 行・カンマ区切り・4 列目に `ENGINEER_SKILL_LEVEL`（7 行）または `-`（その他）のスコア種別マーカー。
- 大半が「経験のあるものを選択してください」系の **multi_choice（breadth）**。proficiency（depth）信号は薄い。
- `ENGINEER_SKILL_LEVEL` 付き 7 行 = 技術選択設問（HTML・CSS の言語/プリプロセッサ/フレームワーク、JavaScript の言語、フレームワーク・ライブラリの UI/コンポーネント/SSR）。
- 「はい/いいえ」＋「活用レベル」progression パターン: 行 3–4（デザインシステム構築）。
- 崩れた行: 行 68–69（質問文が選択肢列に混入、正規の選択肢を持たない）。
- 「その他」カテゴリ（行 63–69）は「アーキテクチャ設計」（行 46–50）とスキル領域が重複。
- 誤字・表記ゆれ: `Crome`→`Chrome`、`Server Worker`→`Service Worker`、`教会設計`→`境界設計`、`Svelt`→`Svelte`、`OpeinAPI`→`OpenAPI`、`Crome Dev Tools`→`Chrome DevTools`、`thisの挙動制御（bind、call,、apply` の重複カンマ ほか。

### F4: テスト慣習

- `packages/db/src/__tests__/proficiency-scale.integration.test.ts` が実 DB 接続の統合テスト。`DATABASE_URL` 未設定時は `describe.skip`、スキーマは drizzle migrator で自己適用、seed を投入して冪等・構造を assert。
- **含意**: frontend seed も同方式の DB ゲートテストで冪等性・構造（カテゴリ数・必須・proficiency level）を検証する。

## Design Decisions

### D1: proficiency 信号の補完（代表習熟度ペア）

- CSV は breadth 中心のため、`ENGINEER_SKILL_LEVEL` を持つ 3 トップカテゴリ（HTML・CSS / JavaScript / フレームワーク・ライブラリ）に backend 同型の**代表習熟度ペア**を 1 組ずつ追加し、自己分析の熟練度レーダーに最低限の data point を供給する（Req 4.2, 4.4, 5.1）。
- 「はい/いいえ＋活用レベル」（デザインシステム）は proficiency single_choice 4 段階に正規化（Req 4.3）。
- proficiency を持たないカテゴリは既存レーダーの graceful 除外挙動に委ね、カバレッジで表示する。**全カテゴリ一律の自己評価設問追加（リッチ化）は本 spec の範囲外**（CSV 忠実性を優先、将来拡張余地）。

### D2: 「その他」統合と崩れ行の救済

- 行 63–67（フォルダ/ディレクトリ構成）は「アーキテクチャ設計」の構成パターン設計と重複 → アーキテクチャ設計へ統合し意味的重複を一本化（Req 2.3, 3.4）。
- 行 68–69 は正規 multi_choice に整形して「アーキテクチャ設計／コンポーネント設計」配下に救済（Storybook 等コンポーネントライブラリのコード化、Figma 等デザインツール連携）。選択肢を持つ回答可能な設問に変換（Req 3.2）。

### D3: 必須設問

- 各トップカテゴリ先頭の「経験のある〜を選択」設問を `isRequired=true`（10 問）。一次フィルタの最低カバレッジを担保（Req 6.1）。

## Risks

- **R-1（低）**: CSV 文言の手作業転記による typo 混入 → テストで誤字補正対象文字列の不在を assert し回帰防止。
- **R-2（低）**: 「その他」統合時の意味的重複判定が主観的 → design のマッピング表で統合先を明示し、レビュー可能にする。
- **R-3（低）**: 代表習熟度ペア追加が CSV に無い設問のため「忠実性」とのトレードオフ → research/design に追加理由（proficiency 供給）を明記し、CSV 由来設問と区別。
