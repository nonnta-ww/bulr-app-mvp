# Implementation Plan

> 中核成果物は単一 seed ファイル `packages/db/src/seeds/skill-surveys/product-manager.ts`（共通ランナー `runSkillSurveySeed` を利用）とその登録・テスト、および `apps/candidate/app/class-diagnosis/_lib/definitions.ts` への `JOBTYPE_DEFAULT_VOCATION` 1行追加。設問は CSV なしの設計駆動で design.md の設問設計表を正本とする。content 作成タスク（2.x）は同一ファイルを編集するため逐次実行（`(P)` 非対象）。

- [x] 1. Foundation: seed 雛形・登録
- [x] 1.1 product-manager seed の型・survey ルートを作成し登録経路へ組み込む
  - `SkillSurveySeedData` 形状の型と `jobType:'product-manager'`・title「プロダクトマネージャー スキルアンケート」の survey ルートオブジェクトを定義（categories は空配列から開始）
  - 共通ランナー `runSkillSurveySeed`（`packages/db/src/seeds/skill-surveys/runner.ts`）を利用した `runProductManagerSkillSurveySeed` を engineering-manager.ts と同型で実装（ランナー自体は変更しない）
  - `packages/db/src/seeds/index.ts` へ re-export を追加し、seed CLI の実行列へ engineering-manager の直後に追加
  - 観測可能な完了条件: seed CLI を実行すると `jobType='product-manager'` のアクティブな survey 行が1件作成され、再実行しても重複しない
  - _Requirements: 1.1, 3.3, 11.1, 11.3_

- [x] 2. Core: プロフィールと8コンピテンシーの設問・選択肢を設計どおり作成
- [x] 2.1 PdM経験プロフィールと前半4コンピテンシーを作成
  - 先頭にカテゴリ「PdM経験プロフィール」を作成し、PdM経験年数・直近プロダクトフェーズ・事業サイド兼務経験の single_choice 設問を配置（scoringKind 無し・非必須・displayOrder 最小）
  - 前半4コンピテンシー（プロダクト戦略 / ディスカバリー・顧客理解 / 優先順位付け・意思決定 / ロードマップ・実行推進）を作成。各カテゴリに breadth multi_choice 2問＋コンピテンシー習熟度 single_choice（proficiency, level 0–3）1問
  - 各コンピテンシー先頭 breadth に `isRequired=true`。design.md 指定の自由記述（プロダクト戦略=思想・判断基準）を free_text・任意で配置
  - 設問文・選択肢に EM アンケートの対象領域（1on1・採用要件・評価レビュー・報酬・組織設計等）を含めないこと（design.md「職能境界」節に準拠）
  - 観測可能な完了条件: seed 実行後、プロフィールが先頭・前半4コンピテンシーに breadth＋proficiency が投入され、各 proficiency 設問が level 0–3 を持つ
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 6.1, 7.1_

- [x] 2.2 後半4コンピテンシーを作成
  - 後半4コンピテンシー（データドリブン運用 / ステークホルダー・組織連携 / GTM・グロース連携 / UX・ビジネス・テクノロジーの越境）を作成。各カテゴリに breadth multi_choice 2問＋コンピテンシー習熟度 single_choice（proficiency）1問
  - 各コンピテンシー先頭 breadth に `isRequired=true`。データドリブン運用に自由記述（データが意思決定を覆した経験）を free_text・任意で配置
  - ステークホルダー・組織連携の設問文を「プロダクト意思決定の合意形成」に限定し、部下の人事評価・採用面接を対象に含めないこと（Req 3.2 準拠、EM「ステークホルダー・コミュニケーション」との名称類似による混同を設問文レベルで回避）
  - 観測可能な完了条件: seed 実行後、後半4コンピテンシーが投入され、計8コンピテンシーに proficiency 設問が1つずつ存在する
  - _Requirements: 2.1, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.4, 6.1, 6.2_

- [x] 3. Integration: 全件投入・職掌マッピング開放
- [x] 3.1 seed 全件投入・displayOrder・必須・proficiency の通し確認
  - seed CLI を実行し、プロフィール＋8コンピテンシーの全設問・全選択肢が投入されることを確認。表示順（プロフィールが先頭、displayOrder 連番）を確認
  - `isRequired=true` が各コンピテンシーに最低1件・計8件、proficiency 設問が8件で選択肢が level 0–3、プロフィール設問は必須でなく scoringKind 無しであることを確認
  - seed を再実行し設問・選択肢の総数が増えないこと（冪等）を確認
  - 観測可能な完了条件: 2回目の seed 実行後も件数が変わらず、8コンピテンシー・8必須・8 proficiency・先頭プロフィールの状態が DB に存在する
  - _Requirements: 2.3, 2.4, 6.1, 6.2, 7.1, 11.2, 11.4_

- [x] 3.2 JOBTYPE_DEFAULT_VOCATION へ策士マッピングを追加
  - `apps/candidate/app/class-diagnosis/_lib/definitions.ts` の `JOBTYPE_DEFAULT_VOCATION` に `"product-manager": "strategist"` を1行追加し、既存キー（frontend/backend/infrastructure-sre/engineering-manager/ai-driven-development）の値は変更しない
  - 「sage・strategist は対応 survey 未整備のため本マップに含めない」旨のコメントを、strategist 開放を反映する記述へ更新
  - 観測可能な完了条件: `resolveCategoryVocationWeights('product-manager', anyCategoryName)` が `CATEGORY_AFFINITY` に明示エントリが無い限り `{ strategist: 1 }` を返す
  - _Depends: 3.1_
  - _Requirements: 10.1, 10.3, 10.4_

- [x] 4. Validation: 自動テストと再利用・非回帰の検証
- [x] 4.1 seed 統合テストを作成
  - DB ゲート方式（`DATABASE_URL` 未設定時 skip、migrator で自己適用、クリーン DB、`fileParallelism:false`）の統合テストを作成
  - 検証: 冪等（再実行で件数不変）/ `jobType='product-manager'` survey 1件・isActive・title / コンピテンシー8カテゴリ存在・プロフィールが displayOrder 先頭 / 各コンピテンシーに breadth multi_choice と proficiency single_choice 共存・proficiency 計8・level 0–3 / `isRequired` 計8・プロフィール非必須 / scoringKind が `proficiency` のみ / free_text 設問が存在し全て非必須
  - EM 領域非重複検証: PdM survey の設問本文・カテゴリ名が EM survey の対象領域キーワード（1on1・採用要件・評価レビュー・報酬等）と重複しないことをテキストレベルで確認
  - 非回帰: backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager / product-manager の6 seed 投入で各 jobType が衝突せず共存することを確認
  - 観測可能な完了条件: テストスイートがローカル Postgres 接続時に全項目 green、DB 無し環境では skip される
  - _Requirements: 1.1, 2.1, 3.1, 4.4, 5.1, 5.3, 6.1, 6.3, 7.1, 11.2, 12.1, 12.2, 12.4_

- [x] 4.2 職掌マッピングの単体テストを作成
  - `JOBTYPE_DEFAULT_VOCATION['product-manager']` が `'strategist'` であることを検証するテストを作成（既存 definitions テストファイルがあれば追加、無ければ新規作成）
  - 既存5 jobType（frontend/backend/infrastructure-sre/engineering-manager/ai-driven-development）の既定職掌マッピング値が変更されていないことを検証
  - `resolveCategoryVocationWeights('product-manager', '任意のカテゴリ名')` が `{ strategist: 1 }` を返すことを検証
  - 観測可能な完了条件: 3件の検証がすべて green で通過する
  - _Depends: 3.2_
  - _Requirements: 10.1, 10.2, 10.3, 12.3_

- [x] 4.3 候補者フローと自己分析での再利用挙動を検証
  - 候補者として product-manager アンケートが一覧に表示・回答可能であること、送信時に未回答の必須設問が拒否されること、送信後に既存の回答保存経路へ追記版として保存されることを確認
  - 自己分析画面で本アンケートのスナップショットがカバレッジ・熟練度レーダーに独立表示され、既存（IC 4種＋EM）の表示を破壊しないこと、再回答クールダウン（既定30日）がアンケート単位で適用されることを確認
  - 回答投入後にクラス診断の職掌判定を実行し `vocationVector.strategist` が0より大きくなること、Strategist アーキタイプ（`resolveArchetype`）が到達可能になることを確認
  - 観測可能な完了条件: 本アンケートの回答→保存→自己分析表示→クールダウン適用→策士職掌スコア算出→Strategist到達が既存基盤の改修なしで一貫して動作する
  - _Depends: 4.1, 4.2_
  - _Requirements: 1.2, 1.3, 1.4, 4.5, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 10.2, 12.1, 12.2_
