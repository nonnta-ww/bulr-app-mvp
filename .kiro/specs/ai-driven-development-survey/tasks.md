# Implementation Plan

- [ ] 1. Foundation: スキーマと型の拡張
- [x] 1.1 score_kind に frequency 値を追加しマイグレーションを生成・適用
  - `scoreKind` pgEnum を `['proficiency','recency','frequency']` に変更する
  - drizzle-kit generate で `ALTER TYPE "public"."score_kind" ADD VALUE 'frequency'` のマイグレーションを生成する
  - ローカル DB に migrate を適用する（drizzle-kit は DIRECT_URL>DATABASE_URL。`.env.local` の例 URL 誤検出を避けるため DIRECT_URL+DATABASE_URL を inline 上書きで実行）
  - 観測可能完了: DB の `score_kind` enum に `'frequency'` が存在し、migrate が成功する
  - _Requirements: 4.1_
  - _Boundary: score_kind enum + migration_

- [x] 1.2 (P) カテゴリ別カバレッジ型に頻度フィールドを追加
  - `CategoryCoverage` に `frequencyScore?: number | null` と `answeredFrequencyCount?: number` を optional 追加する（既存 proficiency/recency と同じ後方互換方針）
  - 観測可能完了: 型がコンパイルし、frequency フィールドが欠落する旧スナップショットと後方互換である
  - _Requirements: 4.2_
  - _Boundary: CategoryCoverage 型拡張_

- [ ] 2. Core: 集計と seed
- [x] 2.1 (P) 集計純関数に頻度の独立系統を追加
  - frequency 分岐と独立アキュムレータを追加し、`frequencyScore`（level 平均→0..100 正規化、寄与0件なら null）と `answeredFrequencyCount` を算出する
  - 頻度を proficiency 指標へ加算しない。`selectedLevels` 欠落の旧データは null 安全にスキップする
  - 純関数性（I/O・乱数・時刻参照なし、同一入力→同一出力）を維持する
  - 観測可能完了: frequency 回答が `frequencyScore` に反映され、同一入力での proficiency/recency 出力が frequency 追加前と完全一致する
  - _Depends: 1.2_
  - _Requirements: 4.2, 4.3, 4.4, 7.5_
  - _Boundary: aggregate frequency 拡張_

- [ ] 2.2 (P) AI駆動開発アンケートの seed データと冪等投入関数を作成
  - 6 カテゴリ / 18 設問 / 必須 3 問（利用ツール・活用深度・生成コード検証レベル）/ frequency 2 問 を、Survey Content Blueprint に従い型付きデータで定義する
  - 全カテゴリに非 null の `subcategory`、各スケール選択肢に `level`(0-3)、スコア対象設問に `scoringKind`、必須3問に `isRequired: true` を付与する
  - backend.ts と同じ冪等 upsert 規約（survey: jobType / category: (surveyId,name,subcategory) / question: (categoryId,body) / choice: (questionId,label) を `onConflictDoUpdate`）の投入関数を実装する
  - 観測可能完了: 投入関数を実行すると `jobType='ai-driven-development'` の survey が 6 カテゴリ / 18 設問 / 必須3問 / level 付与で投入される
  - _Depends: 1.1_
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 5.1, 8.1, 8.3, 8.4_
  - _Boundary: AI survey seed_

- [ ] 3. Integration: 登録と適用
- [ ] 3.1 seed を登録経路に組み込み実行する
  - `seeds/index.ts` の barrel export と `main()` に投入関数を追加し、backend に続けて実行されるようにする
  - seed を実行し AI アンケートを DB へ投入する
  - 観測可能完了: `tsx packages/db/src/seeds/index.ts` 実行で AI アンケートが投入され、候補者のアンケート一覧に出現する
  - _Depends: 2.2_
  - _Requirements: 8.1, 8.2_
  - _Boundary: seeds/index_

- [ ] 4. Validation: テストと非回帰
- [ ] 4.1 (P) 頻度集計のユニットテストを追加
  - frequency 反映 / proficiency 非混入（同一入力で既存出力が不変）/ 寄与0件で null / 旧データ（scoringKind=null・selectedLevels 欠落）後方互換 を網羅する
  - 観測可能完了: 集計純関数のユニットテストが緑になり、既存 proficiency/recency ケースも不変で緑のまま
  - _Depends: 2.1_
  - _Requirements: 4.2, 4.3, 4.4, 9.3_

- [ ] 4.2 (P) seed と回答経路の結合テストを追加
  - 二重実行で重複ゼロ（冪等）、投入件数（6 カテゴリ / 18 設問 / 必須3問 / level / frequency 2問）が正しいこと、回答→ソース構築→集計で frequency が `frequencyScore` に反映されることを検証する
  - 観測可能完了: 結合テストが緑になり、seed 二重実行で重複レコードが生成されない
  - _Depends: 3.1_
  - _Requirements: 8.2, 8.4, 4.2_

- [ ] 4.3 候補者フローと自己分析の再利用・非回帰を確認
  - AI アンケートの一覧表示・必須3問バリデーション・30日クールダウン・独立スナップショット生成・既存カバレッジ/熟練度レーダー表示・頻度のみカテゴリの radar 除外が、既存コンポーネントで成立することを確認する（新規描画コンポーネントを追加しない）
  - 既存 backend アンケートの一覧 / 回答 / 必須判定 / クールダウン / 集計 / 既存スナップショットが不変であることを確認する
  - 観測可能完了: 既存テストスイートが緑で、上記 AI アンケート挙動が既存コンポーネントの再利用のみで成立する
  - _Depends: 3.1_
  - _Requirements: 1.2, 1.3, 1.4, 3.5, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 9.1, 9.2_

## Implementation Notes

- **@bulr/ui dist 前提（worktree 共通）**: この worktree は `@bulr/ui` の dist が未ビルドで、`@bulr/candidate` の typecheck が `Cannot find module '@bulr/ui'` で失敗する（本 spec の変更とは無関係の前提課題、memory: @bulr/ui は dist ビルドで消費）。apps/candidate を typecheck する必要のあるタスク（2.1 集計, 4.1, 4.3）の前に親側で `@bulr/ui` を dist ビルドする。`aggregate.ts` は型のみ `@bulr/db` 参照で UI 非依存のため、vitest 単体テストは UI 未ビルドでも実行可能な見込み。
- **drizzle-kit env（task 1.1 実績）**: ローカル DB は `postgresql://bulr:dev_password@localhost:5434/bulr_dev`。generate/migrate は DIRECT_URL+DATABASE_URL を inline 上書きで実行。psql 未インストールのため DB 確認は `docker exec docker-postgres-1 psql -U bulr -d bulr_dev ...`。
