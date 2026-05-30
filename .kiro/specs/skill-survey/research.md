# Research Log — skill-survey

## Discovery Summary

**Feature Type**: Complex Integration（新規エンティティ群 + 既存 upstream との統合 + Wave 3 向け公開 seam）

**Discovery Process**: Light discovery（既存 codebase のパターン確認 + upstream spec の設計精査）

---

## 調査項目

### 1. docs/backend-skills.csv 構造確認

**調査内容**: CSV のカラム構造・行数・カテゴリ分布を確認

**結果**:
- タブ区切り、ヘッダー行 1 行 + データ行 118 行（合計 119 行）
- カラム構造: `カテゴリ` / `サブカテゴリ` / `質問` / `回答1` / `回答2` / ... / `回答N`（回答は可変列数）
- カテゴリ（8種）: プログラミング、フレームワーク・ライブラリ、データベース、API開発、アーキテクチャ設計、テスト、DevOps・インフラ、セキュリティ（認証・認可以外）、パフォーマンス・チューニング
- 各質問の回答（選択肢）は「はい/いいえ」の 2 択から 30 選択肢超まで幅がある
- 「はい/いいえ」型質問の直後に「活用レベルを教えてください」等のフォローアップ質問が続くパターンが多い

**設計への影響**:
- `skill_survey_choice` テーブルで可変数の選択肢を正規化して保持する設計が適切
- 「はい/いいえ」+ フォローアップの質問は `display_order` で管理し、フォーム上でのグループ化は UI レベルで処理
- CSV の「サブカテゴリ」は `skill_survey_category.subcategory` カラムに格納（別テーブル正規化は Wave 4 以降）

### 2. assessment-pattern-seed の seed パターン確認

**調査内容**: `packages/db/src/seeds/index.ts` と `assessment-patterns.ts` の構造を確認

**結果**:
- `seeds/index.ts` は現在 `export type` と `export const` のバレルのみで、実行エントリーポイントとしての `main()` 関数は持たない
- 実行は `scripts/seed-assessment-patterns.ts` がルートから直接 import する構造
- 本 spec では `seeds/index.ts` にエントリーポイント関数 `runAllSeeds(db)` を追加し、その中で `runBackendSkillSurveySeed(db)` を呼び出す形が natural な拡張

**設計への影響**:
- `seeds/index.ts` を実行エントリーポイントとして改修し、スクリプトから `runAllSeeds(db)` を呼び出す統一パターンにする
- または、既存パターンを踏襲して `scripts/seed-skill-surveys.ts` を別スクリプトとして追加し、ルート `package.json` に `seed:skill-surveys` を追加する

**決定**: brief.md の「`packages/db/src/seeds/index.ts` から呼び出す」指示に従い、`seeds/index.ts` に `runBackendSkillSurveySeed` の呼び出しを追加する形で実装する。`seeds/index.ts` が純粋な型/データバレルから「seed 実行エントリーポイント」に変わることを tasks で明示する。

### 3. candidate-auth-onboarding の requireCandidate・authedAction インターフェース確認

**調査内容**: `packages/auth/src/guards.ts` の `requireCandidate` 戻り値型と `authedAction` の使用パターン確認

**結果**（design.md から）:
```typescript
export async function requireCandidate(): Promise<{
  user: User;
  session: Session;
  candidateProfile: CandidateProfile;
}>;
```
- `authedAction` は `apps/candidate` 内で `createCandidateProfile` と同等のパターンで使用済み

**設計への影響**:
- `SubmitSurveyAction` は `authedAction(schema, async ({ ... }, { userId }) => { ... })` パターンで実装
- `candidateProfileId` は `userId` から DB で引くか、`requireCandidate` を Server Action 内で別途呼ぶか選択が必要
- **決定**: `authedAction` コンテキストに `candidateProfileId` が含まれていない場合は、`requireCandidate()` を Server Action 内でも呼び出して取得する（多層防御の観点からも望ましい）

### 4. apps/candidate 既存ルート構造確認

**調査内容**: 現在の `apps/candidate/app/` ディレクトリ構造確認

**結果**:
- `sign-in/page.tsx` と `page.tsx` のみ存在（onboarding 等は `candidate-auth-onboarding` spec で追加予定）
- `_components/` ディレクトリが存在（header.tsx、sign-out-button.tsx）
- skill-survey ルートは未実装

**設計への影響**:
- 本 spec で `app/skill-survey/` 配下を全て新規作成する

---

## Architecture Pattern Evaluation

### 再回答の意味論

**検討したアプローチ**:
1. **上書き（UPSERT + DELETE/INSERT）**: `skill_survey_response` を 1 件保持し、`skill_survey_answer` を全件差し替え
2. **履歴保持**: 回答ごとに `skill_survey_response` を INSERT し、`getLatest` クエリで最新版を取得

**決定**: アプローチ 1（上書き）を採用

**理由**:
- brief.md に「同一カテゴリで再回答 = 最新版を保持」と明示されている
- Wave 2 の「将来像は見据えるが実装は最小」原則に合致
- `UNIQUE(candidate_profile_id, skill_survey_id)` 制約で意味論を DB レベルで強制でき、コードのバグを防げる
- Wave 3 が「最新回答」を参照するのみであれば、履歴テーブルは不要

### `skill_survey_answer` の ON DELETE CASCADE

**検討**: `skill_survey_response` を upsert する際、`skill_survey_answer` をどう更新するか

**決定**: `skill_survey_answer` に `ON DELETE CASCADE` を設定し、upsert 時は既存 `answer` を一括 DELETE してから INSERT する（Drizzle の `db.delete().where()` + `db.insert()`）。CASCADE により response 削除時も answer が自動削除される。

**理由**: 部分更新（回答した設問だけ UPDATE）は複雑性が高い。全件差し替えの方がシンプルで誤りが少ない。

---

## Design Decisions

| 決定 | 内容 | 理由 |
|------|------|------|
| `skill_survey_category.subcategory` カラム | CSV のサブカテゴリを別テーブルにせず同一テーブルの nullable カラムで保持 | Wave 4 admin CMS まで過剰な正規化を避ける。Wave 4 で分離が必要になれば migration で対応 |
| Zod スキーマの配置 | `apps/candidate/_actions/submit-survey.ts` 内に定義（`packages/types` に置かない） | candidate アプリ固有の入力検証であり、他アプリから共有されない。apps→packages の単方向依存を保つ |
| Server Component ファースト | マスタデータの取得・結果表示は Server Component で完結 | Client Components の範囲を最小化（DB アクセスはサーバー側のみ）。Next.js 16 App Router の方針に準拠 |
| seed の upsert conflict target | テーブル別に異なる一意キーを設計（job_type / name+subcategory+surveyId / text+categoryId / text+questionId） | 人間が読みやすいビジネスキーを conflict target とし、seed の再実行を冪等に保つ |
| Wave 3 向け seam | `packages/db/src/queries/skill-survey/index.ts` に `getLatestResponseByCandidateProfileId` を定義 | packages/db がクエリの単一の真実となり、Wave 3 は packages/db を import するだけで使える。apps 層に依存しない |
