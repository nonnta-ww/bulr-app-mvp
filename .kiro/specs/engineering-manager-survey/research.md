# Research Log — engineering-manager-survey

## Discovery Scope

- **Type**: Extension / Simple Addition（既存 skill-survey 基盤への seed 追加）
- **Process**: Light discovery。infrastructure-sre-survey / frontend-survey の先行実装パターンを踏襲。設問は正本 CSV を持たず設計駆動（ai-driven / infra-sre 同様）。

## Key Findings

### F1: skill-survey 基盤は jobType 非依存（4 職種で実証済み）

- マスタ 4 階層・冪等 upsert・標準習熟度ラベル・候補者一覧（`isActive=true` 全件）・自己分析（aggregate→radar）は survey 非依存。新 jobType は seed 追加のみで出現。
- `runEngineeringManagerSkillSurveySeed` は `runInfrastructureSreSkillSurveySeed` と同型。

### F2: EM は IC と測定モデルが異なる

- IC サーベイ（backend/frontend/infra-sre）は「ツール選択（広さ）＋代表習熟度ペア（最も得意なツール+習熟度）」。EM はツールがほぼ無く、評価軸は**コンピテンシー（実践能力）**。
- よって本アンケートは**代表習熟度ペアを採用せず**、各コンピテンシーに「実践してきたこと（multi_choice, breadth）＋コンピテンシー習熟度（proficiency single_choice, level 0–3）」を配置する。全 10 コンピテンシーが熟練度レーダーに乗る（IC より密）。
- 標準習熟度ラベルは IC と共通（L0–L3）だが、L2 を「実務で実践したことがある」と EM 文脈に合わせる（既存ラベルと意味的に整合）。

### F3: マネジメント経験プロフィール

- EM はレベル（line manager / manager-of-managers / director）や経験規模で前提が大きく異なるため、冒頭に**プロフィール設問**（管理年数 / チーム規模 / manager-of-managers 経験）を配置。これらは集計対象外（scoring_kind 無し）かつ必須にはしない（必須は各コンピテンシー先頭の経験設問のみ＝10）。
- 設計判断: レベル別にアンケートを出し分けない（プロフィールで申告し本体は単一）。

### F4: テスト慣習（infra-sre で実証）

- vitest include は `*.integration.test.ts`。DB ゲート（`DATABASE_URL` 未設定 skip）、migrator 自己適用、クリーン DB 推奨（bulr_em_test 等を docker exec の psql で都度 CREATE）。

## Design Decisions

### D1: 1 コンピテンシー = 1 カテゴリ（2 breadth + 1 proficiency）

- 各コンピテンシーを 1 カテゴリオブジェクトとし、2 つの breadth multi_choice（観点を分割）＋ 1 つの proficiency single_choice で構成。先頭 breadth を `isRequired=true`。
- proficiency は計 10（コンピテンシーごと 1）。

### D2: 規模

- プロフィール 3 + コンピテンシー 10×3 + 自由記述 3 = **約 36 設問**、proficiency 10。EM は 1 設問あたりの多肢選択（breadth）が濃く、IC の設問数（46–69）より少なめでも選択肢総数は同等規模。必要なら各コンピテンシーの breadth を追加分割して拡張可能。

### D3: 自由記述

- マネジメント哲学（戦略・組織運営）／難しい意思決定の学び（ピープルマネジメント）／印象的な育成事例（育成・キャリア支援）の 3 問を free_text（任意・scoring_kind 無し）で配置。

## Risks

- **R-1（低）**: 設計駆動のため設問の網羅性・粒度がレビュー依存 → design にコンピテンシー別設問プランを全件掲載。
- **R-2（低）**: 設問数が IC より少ない → breadth の多肢選択で深さを確保。拡張容易（seed 冪等）。
- **R-3（低）**: 標準習熟度ラベル L2 の文言（「実装」→「実践」）の整合 → EM 文脈の label を用い、level の意味（0–3）は不変に保つ。
