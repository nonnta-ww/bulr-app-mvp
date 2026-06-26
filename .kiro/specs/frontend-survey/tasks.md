# Implementation Plan

> 中核成果物は単一 seed ファイル `packages/db/src/seeds/skill-surveys/frontend.ts` とその登録・テスト。content 作成タスク（2.x）は同一ファイルを編集するため逐次実行（`(P)` 非対象）。

- [x] 1. Foundation: seed 雛形・冪等ランナー・登録
- [x] 1.1 frontend seed の型・survey ルート・冪等ランナーを作成し登録経路へ組み込む
  - `FrontendSurveySeedData` 型と `jobType:'frontend'`・title「フロントエンドエンジニア スキルアンケート」の survey ルートオブジェクトを定義（categories は空配列から開始）
  - backend seed と同型の `runFrontendSkillSurveySeed(db)` を実装：トランザクション内で survey→category→question→choice を `onConflictDoUpdate` で upsert、id は不変、投入件数を console 出力
  - 登録経路へ `runFrontendSkillSurveySeed` を re-export し、seed CLI の実行列へ backend / ai-driven の直後に追加
  - 観測可能な完了条件: seed CLI を実行すると `jobType='frontend'` のアクティブな survey 行が 1 件作成され、再実行しても重複しない
  - _Requirements: 1.1, 9.1, 9.3_

- [x] 2. Core: CSV 準拠カテゴリ・設問・選択肢の作成
- [x] 2.1 HTML・CSS / JavaScript カテゴリを作成
  - HTML・CSS（CSV 行1–8）を言語スキル/CSSプリプロセッサ/CSSフレームワーク/CSS設計のサブカテゴリで作成。行3+4（デザインシステム）は標準習熟度4段階の proficiency single_choice に正規化、行8は bare yes/no の single_choice
  - JavaScript（CSV 行9–13）を言語スキル/DOM操作・イベント/非同期処理・API通信/OOP・モジュール化/パフォーマンス最適化で作成
  - 両カテゴリに代表習熟度ペア（「最も得意な X を1つ」single_choice ＋ 習熟度 proficiency single_choice level 0–3）を追加（HTML・CSS=スタイリング技術プール、JavaScript=言語プール）
  - 各カテゴリ先頭の経験設問（行1, 行9）に `isRequired=true` を付与
  - 観測可能な完了条件: seed 実行後、HTML・CSS と JavaScript の全設問・選択肢が投入され、各カテゴリに proficiency level 0–3 を持つ設問が存在する
  - _Requirements: 2.1, 2.2, 3.1, 4.1, 4.2, 4.3, 4.4, 5.1, 6.1_

- [x] 2.2 フレームワーク・ライブラリ カテゴリを作成
  - CSV 行14–22 を UIライブラリ/コンポーネントライブラリ(行15,16)/SSRフレームワーク/ルーティング/バリデーション/ステート管理/SSR・CSR・SSG理解/i18n のサブカテゴリで作成
  - 代表習熟度ペア（最も得意な UI フレームワーク = React/Vue/Angular/Solid/Svelte/Qwik ＋ 習熟度 proficiency）を追加
  - 先頭の経験設問（行14）に `isRequired=true` を付与
  - 観測可能な完了条件: seed 実行後、フレームワーク・ライブラリ配下に 8 スキル領域＋代表習熟度ペアの設問が投入される
  - _Requirements: 2.1, 2.2, 3.1, 4.1, 4.2, 4.4, 5.1, 6.1_

- [x] 2.3 UI/UXスキル / バックエンド連携 カテゴリを作成
  - UI/UXスキル（CSV 行23–32）を情報設計/デザイン原則/状態フィードバック/レスポンシブ(行26,27)/視覚的インタラクション/アクセシビリティ(行29,30,31)/行動データ改善で作成
  - バックエンド連携（CSV 行33–39）を API呼び出し(行33,34)/型安全性/エラーハンドリング/認証トークン/再試行/キャッシュ制御で作成。行35の `OpeinAPI`→`OpenAPI` を補正
  - 各カテゴリ先頭の経験設問（行23, 行33）に `isRequired=true` を付与。経験選択 multi_choice は scoringKind 無し
  - 観測可能な完了条件: seed 実行後、両カテゴリの全設問が multi_choice として投入され、scoringKind が付与されていない
  - _Requirements: 2.1, 2.2, 3.1, 4.1, 5.2, 6.1_

- [x] 2.4 セキュリティ / アーキテクチャ設計 カテゴリを作成（その他統合・崩れ行救済）
  - セキュリティ（CSV 行40–45）を XSS・CSRF/セキュリティヘッダー/環境変数・機密情報/依存パッケージ脆弱性/設計力/エラー・ログ管理で作成。行44の `教会設計`→`境界設計` を補正
  - アーキテクチャ設計（CSV 行46–50）を構成パターン/スコープ設計/スケーラビリティ/コンポーネント設計/状態管理設計で作成
  - CSV「その他」行63–67 は重複として統合（新規設問を追加しない）。行68・行69 を正規 multi_choice に救済し コンポーネント設計 配下へ（Storybook 等コード化・設計ポリシー / Figma 等デザインツール連携）
  - 各カテゴリ先頭の経験設問（行40, 行46）に `isRequired=true` を付与
  - 観測可能な完了条件: seed 実行後、`その他` カテゴリは存在せず、行68・69 由来の回答可能な選択肢付き設問がアーキテクチャ設計配下に存在する
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 6.1_

- [x] 2.5 パフォーマンス・チューニング / テスト / ビルド・デプロイ カテゴリを作成
  - パフォーマンス・チューニング（CSV 行51–54）。行54の `Crome`→`Chrome`/`Crome Dev Tools`→`Chrome DevTools`/`Server Worker`→`Service Worker` を補正
  - テスト（CSV 行55–58）を単体テスト(行55,56)/結合・E2E(行57,58)で作成。行55の `Svelt Testing Library`→`Svelte Testing Library` を補正
  - ビルド・デプロイ（CSV 行59–62）を ビルドツール/バンドル最適化/環境構築(行61,62)で作成。行61の `Tailwind CSSS`→`Tailwind CSS`・末尾空 `（）` を補正
  - 各カテゴリ先頭の経験設問（行51, 行55, 行59）に `isRequired=true` を付与
  - 観測可能な完了条件: seed 実行後、3 カテゴリが投入され、補正対象の誤字が選択肢・設問文に含まれない
  - _Requirements: 2.1, 2.2, 3.1, 3.3, 6.1_

- [x] 3. Integration: 全件投入と一貫性確認
- [x] 3.1 seed 全件投入・displayOrder・必須・誤字の通し確認
  - seed CLI を実行し、10 トップカテゴリ・全設問・全選択肢が投入されることを確認。表示順（カテゴリ/設問/選択肢の displayOrder）が CSV 出現順で連番になっていることを確認
  - `isRequired=true` が各トップカテゴリに最低 1 件・計 10 件付与されていること、proficiency 設問の選択肢が level 0–3 を持つことを確認
  - seed を再実行し設問・選択肢の総数が増えないこと（冪等）を確認
  - 観測可能な完了条件: 2 回目の seed 実行後も件数が変わらず、10 カテゴリ・10 必須設問・誤字補正済みの状態が DB に存在する
  - _Requirements: 2.4, 3.3, 5.1, 6.1, 9.2, 9.4_

- [x] 4. Validation: 自動テストと再利用挙動の検証
- [x] 4.1 seed 統合テストを作成
  - DB ゲート方式（`DATABASE_URL` 未設定時 skip、migrator で自己適用）の統合テストを作成
  - 検証: 冪等（再実行で件数不変）/ `jobType='frontend'` survey 1 件・isActive・title / トップカテゴリ distinct=10 かつ `その他` 不在 / `isRequired` 計 10 件 / proficiency 設問の level 0–3 / 代表習熟度ペアが HTML・CSS・JavaScript・フレームワーク・ライブラリに存在 / scoringKind が `proficiency` のみで `recency`・`frequency` 未使用 / 補正対象文字列（`Crome`,`Server Worker`,`教会`,`OpeinAPI`,`Svelt Testing`）の不在
  - 非回帰: backend / ai-driven-development / frontend の 3 seed を投入し、各 jobType の survey・カテゴリが衝突せず共存することを確認
  - 観測可能な完了条件: テストスイートがローカル Postgres 接続時に全項目 green、DB 無し環境では skip される
  - _Requirements: 1.1, 2.1, 2.3, 3.3, 4.2, 4.4, 5.1, 5.3, 9.2, 10.1, 10.2, 10.3_

- [ ] 4.2 候補者フローでの再利用挙動を検証
  - 候補者として frontend アンケートが一覧に表示・回答可能であること、送信時に未回答の必須設問が拒否されること、送信後に既存の回答保存経路へ追記版として保存されることを確認
  - 自己分析画面で frontend スナップショットがカバレッジ・熟練度レーダーに独立表示され、既存（backend / ai-driven）の表示を破壊しないこと、再回答クールダウン（既定 30 日）がアンケート単位で適用されることを確認
  - 観測可能な完了条件: frontend アンケートの回答→保存→自己分析表示→クールダウン適用が既存基盤の改修なしで一貫して動作する
  - _Requirements: 1.2, 1.3, 1.4, 4.5, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_
