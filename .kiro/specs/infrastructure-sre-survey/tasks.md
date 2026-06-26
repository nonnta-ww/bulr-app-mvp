# Implementation Plan

> 中核成果物は単一 seed ファイル `packages/db/src/seeds/skill-surveys/infrastructure-sre.ts` とその登録・テスト。設問は CSV なしの設計駆動で design.md の設問設計表を正本とする。content 作成タスク（2.x）は同一ファイルを編集するため逐次実行（`(P)` 非対象）。

- [ ] 1. Foundation: seed 雛形・冪等ランナー・登録
- [ ] 1.1 infrastructure-sre seed の型・survey ルート・冪等ランナーを作成し登録経路へ組み込む
  - 型と `jobType:'infrastructure-sre'`・title「インフラ・SREエンジニア スキルアンケート」の survey ルートオブジェクトを定義（categories は空配列から開始）
  - frontend seed と同型の冪等ランナーを実装：トランザクション内で survey→category→question→choice を `onConflictDoUpdate` で upsert、id は不変、投入件数を console 出力
  - 登録経路へ re-export し、seed CLI の実行列へ frontend の直後に追加
  - 観測可能な完了条件: seed CLI を実行すると `jobType='infrastructure-sre'` のアクティブな survey 行が 1 件作成され、再実行しても重複しない
  - _Requirements: 1.1, 9.1, 9.3_

- [ ] 2. Core: 12カテゴリの設問・選択肢を設計どおり作成
- [ ] 2.1 共通インフラ層前半（クラウド / コンテナ・オーケストレーション / IaC）を作成
  - design.md の設問設計表に従い 3 カテゴリの経験選択 multi_choice 設問・選択肢を作成
  - 各カテゴリに代表習熟度ペア（最も得意な対象を1つ選ぶ single_choice ＋ 習熟度 proficiency single_choice level 0–3）を付与
  - 各カテゴリ先頭の経験設問（クラウド/コンテナ/IaC）に `isRequired=true` を付与
  - 観測可能な完了条件: seed 実行後、3 カテゴリの設問・選択肢が投入され、各カテゴリに level 0–3 を持つ proficiency 設問が存在する
  - _Requirements: 2.1, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 6.1_

- [ ] 2.2 共通インフラ層後半（ネットワーク / CI・CD / OS・ミドルウェア）を作成
  - design.md に従い 3 カテゴリの経験選択 multi_choice 設問・選択肢を作成
  - CI/CD カテゴリに代表習熟度ペアを付与
  - 各カテゴリ先頭の経験設問に `isRequired=true` を付与。経験選択 multi_choice は scoringKind 無し
  - 観測可能な完了条件: seed 実行後、3 カテゴリが投入され CI/CD に代表習熟度ペアが存在する
  - _Requirements: 2.1, 2.4, 3.1, 4.1, 4.2, 5.1, 5.2, 6.1_

- [ ] 2.3 SRE・信頼性層前半（可観測性 / 信頼性設計 / インシデント対応・オンコール）を作成
  - design.md に従い 3 カテゴリの設問・選択肢を作成。可観測性に代表習熟度ペアを付与
  - 信頼性固有の観点（SLI/SLO・エラーバジェット・ポストモーテム）を設問・選択肢に含める。インシデント対応に自由記述（free_text, 任意）を 1 問配置
  - 各カテゴリ先頭の経験設問に `isRequired=true` を付与
  - 観測可能な完了条件: seed 実行後、SLI/SLO・エラーバジェット・ポストモーテムの語が設問/選択肢に存在し、可観測性に proficiency 設問が存在する
  - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.4, 4.1, 4.2, 5.1, 6.1_

- [ ] 2.4 SRE・信頼性層後半（自動化・トイル削減 / セキュリティ・コンプライアンス / パフォーマンス・スケーラビリティ・コスト最適化）を作成
  - design.md に従い 3 カテゴリの経験選択 multi_choice 設問・選択肢を作成
  - トイル削減・FinOps（コスト最適化）の観点を設問・選択肢に含める
  - 各カテゴリ先頭の経験設問に `isRequired=true` を付与
  - 観測可能な完了条件: seed 実行後、3 カテゴリが投入され、トイル・コスト最適化の観点が設問/選択肢に存在する
  - _Requirements: 2.2, 2.3, 2.4, 3.1, 5.2, 6.1_

- [ ] 3. Integration: 全件投入と一貫性確認
- [ ] 3.1 seed 全件投入・displayOrder・必須・proficiency の通し確認
  - seed CLI を実行し、12 トップカテゴリ・全設問・全選択肢が投入されることを確認。表示順（カテゴリ/設問/選択肢の displayOrder）が宣言順で連番であることを確認
  - `isRequired=true` が各トップカテゴリに最低 1 件・計 12 件、proficiency 設問が代表習熟度の 5 カテゴリに存在し選択肢が level 0–3 を持つことを確認
  - seed を再実行し設問・選択肢の総数が増えないこと（冪等）を確認
  - 観測可能な完了条件: 2 回目の seed 実行後も件数が変わらず、12 カテゴリ・12 必須設問・5 proficiency 設問・単一トラックとして現実的な総設問数（目標 50–70）の状態が DB に存在する
  - _Requirements: 2.4, 2.5, 5.1, 6.1, 9.2, 9.4_

- [ ] 4. Validation: 自動テストと再利用挙動の検証
- [ ] 4.1 seed 統合テストを作成
  - DB ゲート方式（`DATABASE_URL` 未設定時 skip、migrator で自己適用、クリーン DB）の統合テストを作成
  - 検証: 冪等（再実行で件数不変）/ `jobType='infrastructure-sre'` survey 1 件・isActive・title / トップカテゴリ distinct=12（共通インフラ6＋SRE・信頼性6）/ `isRequired` 計 12 件 / proficiency 設問の level 0–3・代表習熟度ペアが対象 5 カテゴリに存在 / scoringKind が `proficiency` のみ / 信頼性固有語（SLO・エラーバジェット・ポストモーテム・トイル）の出現
  - 非回帰: backend / frontend / ai-driven-development / infrastructure-sre の 4 seed 投入で各 jobType が衝突せず共存することを確認
  - 観測可能な完了条件: テストスイートがローカル Postgres 接続時に全項目 green、DB 無し環境では skip される
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 4.3, 5.1, 5.3, 9.2, 10.1, 10.2, 10.3_

- [ ] 4.2 候補者フローでの再利用挙動を検証
  - 候補者として infrastructure-sre アンケートが一覧に表示・回答可能であること、送信時に未回答の必須設問が拒否されること、送信後に既存の回答保存経路へ追記版として保存されることを確認
  - 自己分析画面で本アンケートのスナップショットがカバレッジ・熟練度レーダーに独立表示され、既存（backend/frontend/ai-driven）の表示を破壊しないこと、再回答クールダウン（既定 30 日）がアンケート単位で適用されることを確認
  - 観測可能な完了条件: 本アンケートの回答→保存→自己分析表示→クールダウン適用が既存基盤の改修なしで一貫して動作する
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 3.5, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5_
