# Implementation Plan

> 中核成果物は単一 seed ファイル `packages/db/src/seeds/skill-surveys/ai-ml.ts`（共通ランナー `runner.ts` を利用）とその登録・テスト、および `apps/candidate/app/class-diagnosis/_lib/definitions.ts` への1行追加。設問は CSV なしの設計駆動で design.md の設問設計表を正本とする。content 作成タスク（2.x）は同一ファイルを編集するため逐次実行（`(P)` 非対象）。

- [x] 1. Foundation: seed 雛形・冪等ランナー登録
- [x] 1.1 ai-ml seed の型・survey ルート・冪等ランナーを作成し登録経路へ組み込む
  - 型と `jobType:'ai-ml'`・title「AI/ML・データ スキルアンケート」の survey ルートオブジェクトを定義（categories は空配列から開始）
  - 共通ランナー `runSkillSurveySeed`（`packages/db/src/seeds/skill-surveys/runner.ts`）を利用した `runAiMlSkillSurveySeed(db)` を実装（infrastructure-sre.ts と同型：トランザクション内で survey→category→question→choice を `onConflictDoUpdate` で upsert、id は不変、投入件数を console 出力）
  - `packages/db/src/seeds/index.ts` へ re-export し、seed CLI の実行列へ既存 seed の直後に追加
  - 既存スキーマ・`score_kind` enum に対する変更を行わず、既存テーブルへの行追加のみで実装する
  - 観測可能な完了条件: seed CLI を実行すると `jobType='ai-ml'` のアクティブな survey 行が 1 件作成され、再実行しても重複せず、DB マイグレーションが一切発生しない
  - _Requirements: 1.1, 5.4, 9.1, 9.3_

- [x] 2. Core: 6カテゴリの設問・選択肢を設計どおり作成
- [x] 2.1 機械学習基礎・モデル開発・評価を作成
  - design.md の設問設計表に従い 2 カテゴリの経験選択 multi_choice 設問・選択肢を作成
  - 各カテゴリに代表習熟度ペア（最も得意な対象を1つ選ぶ single_choice ＋ 習熟度 proficiency single_choice level 0–3）を付与
  - 各カテゴリ先頭の経験設問（手法／フレームワーク）に `isRequired=true` を付与
  - `ai-driven-development-survey` の選択肢（Copilot 等のコーディング支援ツール）と重複しないことを確認する
  - 観測可能な完了条件: seed 実行後、2 カテゴリの設問・選択肢が投入され、各カテゴリに level 0–3 を持つ proficiency 設問が存在する
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 6.1_

- [x] 2.2 データエンジニアリング・MLOpsを作成
  - design.md に従い 2 カテゴリの経験選択 multi_choice 設問・選択肢を作成
  - 各カテゴリに代表習熟度ペアを付与
  - 各カテゴリ先頭の経験設問（パイプライン／運用）に `isRequired=true` を付与。経験選択 multi_choice は scoringKind 無し
  - 観測可能な完了条件: seed 実行後、2 カテゴリが投入され、両カテゴリに代表習熟度ペア（level 0–3 の proficiency 設問）が存在する
  - _Requirements: 2.1, 2.2, 2.4, 3.1, 4.1, 4.2, 5.1, 5.2, 6.1_

- [x] 2.3 推薦・検索、分析・可視化を作成
  - design.md に従い 2 カテゴリの経験選択 multi_choice 設問・選択肢を作成（代表習熟度ペアなし）
  - 分析・可視化カテゴリに自由記述設問（free_text, 任意）を 1 問配置
  - 各カテゴリ先頭の経験設問に `isRequired=true` を付与
  - 観測可能な完了条件: seed 実行後、6 カテゴリすべてが投入済みとなり、分析・可視化カテゴリに free_text 設問が存在する
  - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.4, 5.2, 6.1_

- [x] 3. Integration: 全件投入・職掌マッピング追加・一貫性確認
- [x] 3.1 (P) seed 全件投入・displayOrder・必須・proficiency の通し確認
  - seed CLI を実行し、6 トップカテゴリ・全設問・全選択肢が投入されることを確認。表示順（カテゴリ/設問/選択肢の displayOrder）が宣言順で連番であることを確認
  - `isRequired=true` が各トップカテゴリに最低 1 件・計 6 件、proficiency 設問が代表習熟度の 4 カテゴリに存在し選択肢が level 0–3 を持つことを確認
  - seed を再実行し設問・選択肢の総数が増えないこと（冪等）を確認
  - 観測可能な完了条件: 2 回目の seed 実行後も件数が変わらず、6 カテゴリ・6 必須設問・4 proficiency 設問・単一領域として現実的な総設問数（目標 18–28）の状態が DB に存在する
  - _Requirements: 2.4, 2.5, 5.1, 6.1, 9.2, 9.4_
  - _Boundary: ai-ml seed_

- [x] 3.2 (P) JOBTYPE_DEFAULT_VOCATION に ai-ml→sage を1行追加
  - `apps/candidate/app/class-diagnosis/_lib/definitions.ts` の `JOBTYPE_DEFAULT_VOCATION` に `'ai-ml': 'sage'` を追加
  - 「sage・strategist は対応 survey 未整備のため本マップに含めない」旨のコメントを sage 分について更新（strategist は依然非活性枠のまま維持）
  - 既存 jobType（frontend / backend / infrastructure-sre / engineering-manager / ai-driven-development）のマッピング値を変更しない
  - 観測可能な完了条件: `resolveCategoryVocationWeights('ai-ml', 'MLOps')` 等が `{ sage: 1 }` を返し、既存 jobType の解決結果が変更前と一致する
  - _Requirements: 10.1, 10.2, 10.4, 11.4_
  - _Boundary: class-diagnosis definitions.ts_

- [x] 4. Validation: 自動テストと再利用挙動の検証
- [x] 4.1 (P) seed 統合テストを作成
  - DB ゲート方式（`DATABASE_URL` 未設定時 skip、migrator で自己適用、クリーン DB、`fileParallelism:false` で直列実行）の統合テストを作成
  - 検証: 冪等（再実行で件数不変）/ `jobType='ai-ml'` survey 1 件・isActive・title / トップカテゴリ distinct=6（機械学習基礎／モデル開発・評価／データエンジニアリング／推薦・検索／MLOps／分析・可視化）/ `isRequired` 計 6 件 / proficiency 設問の level 0–3・代表習熟度ペアが対象 4 カテゴリに存在 / scoringKind が `proficiency` のみ
  - 非回帰: backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager / ai-ml の全 seed 投入で各 jobType が衝突せず共存することを確認
  - 観測可能な完了条件: テストスイートがローカル Postgres 接続時に全項目 green、DB 無し環境では skip される
  - _Requirements: 1.1, 2.1, 4.3, 5.1, 5.3, 9.2, 11.1, 11.2, 11.3_
  - _Boundary: ai-ml seed_
  - _Depends: 3.1_

- [x] 4.2 (P) definitions.ts の単体テストを更新
  - 「sage/strategist に対応する jobType は存在しない（非活性枠）」テストを更新し、sage は `ai-ml` で開放済み・strategist は依然非活性であることを検証するケースに書き換える
  - `EXPECTED_JOBTYPE_DEFAULT` フィクスチャに `ai-ml: 'sage'` を追加し、`resolveCategoryVocationWeights('ai-ml', category)` が全 seed 済みカテゴリで非空へ解決されることを検証する既存テストのループ対象に組み込む
  - 既存 jobType の `resolveCategoryVocationWeights` 結果が本変更前後で不変であることを検証するケースを追加
  - 観測可能な完了条件: `definitions.test.ts` が green で、`ai-ml → sage` の解決と既存 jobType の非回帰の両方が検証されている
  - _Requirements: 10.1, 10.2, 10.4, 11.4_
  - _Boundary: class-diagnosis definitions.ts_
  - _Depends: 3.2_

- [x] 4.3 候補者フロー・自己分析・クラス診断での再利用挙動を検証
  - 候補者として ai-ml アンケートが一覧に表示・回答可能であること、送信時に未回答の必須設問が拒否され、自由記述・任意設問は未回答でも送信を妨げないこと、全必須設問回答済みで送信が受理され、送信後に既存の回答保存経路へ追記版として保存されることを確認
  - 自己分析画面で本アンケートのスナップショットがカバレッジ・熟練度レーダーに独立表示され、既存（backend/frontend/ai-driven-development/infrastructure-sre/engineering-manager）の表示を破壊しないこと、再回答クールダウン（既定 30 日）がアンケート単位で適用されることを確認
  - ai-ml アンケート回答後、RPG クラス診断で `vocationVector.sage` が非零となり Researcher アーキタイプが到達可能になることを確認（`diagnosis-archetypes` の判定ロジックは無変更のまま、入力データの変化のみで到達性が変わることを確認）
  - 観測可能な完了条件: 本アンケートの回答→必須検証（拒否／受理）→保存→自己分析表示→クールダウン適用→職掌 sage 反映→Researcher 到達性が、既存基盤・既存導出ロジックの改修なしで一貫して動作する
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 3.5, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 10.3_
  - _Depends: 4.1, 4.2_
