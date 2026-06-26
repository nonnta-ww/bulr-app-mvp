# Implementation Plan

> 中核成果物は単一 seed ファイル `packages/db/src/seeds/skill-surveys/engineering-manager.ts` とその登録・テスト。設問は CSV なしの設計駆動で design.md の設問設計表を正本とする。content 作成タスク（2.x）は同一ファイルを編集するため逐次実行（`(P)` 非対象）。

- [x] 1. Foundation: seed 雛形・冪等ランナー・登録
- [x] 1.1 engineering-manager seed の型・survey ルート・冪等ランナーを作成し登録経路へ組み込む
  - 型と `jobType:'engineering-manager'`・title「エンジニアリングマネージャー スキルアンケート」の survey ルートオブジェクトを定義（categories は空配列から開始）
  - infrastructure-sre seed と同型の冪等ランナーを実装：トランザクション内で survey→category→question→choice を `onConflictDoUpdate` で upsert、id は不変、投入件数を console 出力
  - 登録経路へ re-export し、seed CLI の実行列へ infrastructure-sre の直後に追加
  - 観測可能な完了条件: seed CLI を実行すると `jobType='engineering-manager'` のアクティブな survey 行が 1 件作成され、再実行しても重複しない
  - _Requirements: 1.1, 9.1, 9.3_

- [x] 2. Core: プロフィールと10コンピテンシーの設問・選択肢を設計どおり作成
- [x] 2.1 マネジメント経験プロフィールと前半5コンピテンシーを作成
  - 先頭にカテゴリ「マネジメント経験プロフィール」を作成し、管理年数・チーム規模・manager-of-managers 経験の single_choice 設問を配置（scoringKind 無し・非必須・displayOrder 最小）
  - 前半5コンピテンシー（ピープルマネジメント / 採用・チーム組成 / 育成・キャリア支援 / パフォーマンスマネジメント / デリバリーマネジメント）を作成。各カテゴリに breadth multi_choice 2問＋コンピテンシー習熟度 single_choice（proficiency, level 0–3）1問
  - 各コンピテンシー先頭 breadth に `isRequired=true`。design.md 指定の自由記述（ピープル=難しい意思決定の学び / 育成=印象的な育成事例）を free_text・任意で配置
  - 観測可能な完了条件: seed 実行後、プロフィールが先頭・前半5コンピテンシーに breadth＋proficiency が投入され、各 proficiency 設問が level 0–3 を持つ
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 6.1_

- [x] 2.2 後半5コンピテンシーを作成
  - 後半5コンピテンシー（技術リーダーシップ / ステークホルダー・コミュニケーション / 戦略・組織運営 / チーム文化・エンゲージメント / プロセス・オペレーショナルエクセレンス）を作成。各カテゴリに breadth multi_choice 2問＋コンピテンシー習熟度 single_choice（proficiency）1問
  - 各コンピテンシー先頭 breadth に `isRequired=true`。戦略・組織運営に自由記述（マネジメント哲学）を free_text・任意で配置
  - プロセス・オペレーショナルエクセレンスに生産性メトリクス（DORA/SPACE）・インシデント文化の観点を含める
  - 観測可能な完了条件: seed 実行後、後半5コンピテンシーが投入され、計10コンピテンシーに proficiency 設問が1つずつ存在する
  - _Requirements: 2.1, 3.1, 3.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 6.1_

- [x] 3. Integration: 全件投入と一貫性確認
- [x] 3.1 seed 全件投入・displayOrder・必須・proficiency の通し確認
  - seed CLI を実行し、プロフィール＋10コンピテンシーの全設問・全選択肢が投入されることを確認。表示順（プロフィールが先頭、displayOrder 連番）を確認
  - `isRequired=true` が各コンピテンシーに最低1件・計10件、proficiency 設問が10件で選択肢が level 0–3、プロフィール設問は必須でなく scoringKind 無しであることを確認
  - seed を再実行し設問・選択肢の総数が増えないこと（冪等）を確認
  - 観測可能な完了条件: 2回目の seed 実行後も件数が変わらず、10コンピテンシー・10必須・10 proficiency・先頭プロフィールの状態が DB に存在する
  - _Requirements: 2.3, 2.4, 5.1, 5.2, 6.1, 9.2, 9.4_

- [ ] 4. Validation: 自動テストと再利用挙動の検証
- [x] 4.1 seed 統合テストを作成
  - DB ゲート方式（`DATABASE_URL` 未設定時 skip、migrator で自己適用、クリーン DB）の統合テストを作成
  - 検証: 冪等（再実行で件数不変）/ `jobType='engineering-manager'` survey 1件・isActive・title / コンピテンシー10カテゴリ存在・プロフィールが displayOrder 先頭 / 各コンピテンシーに breadth multi_choice と proficiency single_choice 共存・proficiency 計10・level 0–3 / `isRequired` 計10・プロフィール非必須 / scoringKind が `proficiency` のみ / free_text 設問が存在し全て非必須
  - 非回帰: backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager の 5 seed 投入で各 jobType が衝突せず共存することを確認
  - 観測可能な完了条件: テストスイートがローカル Postgres 接続時に全項目 green、DB 無し環境では skip される
  - _Requirements: 1.1, 2.1, 3.4, 4.1, 4.3, 5.1, 5.3, 6.1, 9.2, 10.1, 10.2, 10.3_

- [ ] 4.2 候補者フローでの再利用挙動を検証
  - 候補者として engineering-manager アンケートが一覧に表示・回答可能であること、送信時に未回答の必須設問が拒否されること、送信後に既存の回答保存経路へ追記版として保存されることを確認
  - 自己分析画面で本アンケートのスナップショットがカバレッジ・熟練度レーダーに独立表示され、既存（IC 4種）の表示を破壊しないこと、再回答クールダウン（既定 30 日）がアンケート単位で適用されることを確認
  - 観測可能な完了条件: 本アンケートの回答→保存→自己分析表示→クールダウン適用が既存基盤の改修なしで一貫して動作する
  - _Requirements: 1.2, 1.3, 1.4, 3.5, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_
