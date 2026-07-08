# Implementation Plan

> 実装順の原則（design.md「Implementation Order」）: 契約型 → 気質判定コア → 既存 rpg-class-diagnosis 消費者の追従（ここで既存スイートを緑に戻す）→ DB/seed → UI → 検証。契約型変更は下流を一時的に赤にするため、Phase 2 完了まで UI に着手しない。

## 1. Foundation: 契約型と気質判定コア

- [x] 1.1 気質の契約型を4軸16型へ拡張（@bulr/types）
  - `TemperamentAxis` を4軸（探索⇔深化／個人⇔協調／計画⇔即興／堅実⇔挑戦）へ拡張し、極 union（軸ごと2値）・`TemperamentCode`（極の直積 template-literal 型で16通りを型網羅）・`TemperamentCompleteness`・`TemperamentSummary` を定義。
  - `ClassResult.temperament` を `TemperamentSummary | null` へ変更、`temperamentBalanced` を廃止（summary の `balancedAxes` へ）。旧4値は `LegacyTemperament` として legacy 正規化の入力にのみ温存。
  - 完了状態: `@bulr/types` の typecheck が通り、`TemperamentCode` が16通りを型で表現し、`ClassResult` が新 temperament 形状になる。
  - _Requirements: 1.1, 1.4, 7.1, 7.3_
  - _Boundary: temperament types_

- [x] 1.2 (P) 気質の軸・極・16アーキタイプ定義（app core）
  - 4軸・8極のラベルと canonical order・中点を定義し、16 code すべてに対応するアーキタイプ（型名・短ラベル・説明・次の一歩）を `Record<TemperamentCode, Archetype>` で定義（欠落は型エラー）。
  - 文言に数値・他者比較・順位を含めない。
  - 完了状態: 16 code が型で網羅され、各アーキタイプが名称・shortLabel・説明・nextStep を持ち typecheck が通る。
  - _Requirements: 1.1, 1.3, 2.1, 2.2_
  - _Boundary: axes.ts, archetypes.ts_
  - _Depends: 1.1_

- [x] 1.3 気質スコアリング純関数（partial 対応）
  - 気質回答を4軸で採点し、回答済み軸のみ `determined=true`（未回答軸は中点で埋めない）、中点ちょうどは既定極＋balanced、充足度（none/partial/full）と full 時のみ非null の code を決定論導出。ClassResult 用 summary への射影も提供。
  - 単体テスト: 空（none）／2軸のみ（partial・未回答軸 determined=false）／4軸（full・code 非null）／中点 balanced／逆転吸収／同一入力同一出力。
  - 完了状態: 単体テストが緑で、部分回答が嘘の完全型にならず、4軸回答で16型のいずれかに確定する。
  - _Requirements: 1.2, 1.5, 1.6, 3.1, 3.2, 3.3, 3.4_
  - _Boundary: score.ts_
  - _Depends: 1.1, 1.2_

- [x] 1.4 (P) 気質アンケート回答→軸マッピング（seed 契約の単一ソース）
  - アンケートのカテゴリ名→気質軸の対応（4軸ぶん）と、回答束→採点入力への写像を共有コアに集約（class 診断側は import に切替）。「level 高＝第2極」の向き契約を維持。
  - 単体テスト: 4カテゴリの回答が4軸の採点入力に写像され、未対応カテゴリは無視される。
  - 完了状態: マッピングが単一箇所に定義され、standalone とクラス診断の双方が同一関数を使う。
  - _Requirements: 5.2, 7.1_
  - _Boundary: answers.ts_
  - _Depends: 1.1_

- [x] 1.5 (P) 旧4型レコードの互換正規化
  - 永続化済みの旧気質値（4象限）を、探索/深化・個人/協調の2軸のみ determined の partial summary へ写像。新 summary はそのまま（冪等）、null は null。総関数（未知値でも throw しない）。
  - 単体テスト: 旧4値→2軸 determined partial（code=null）／新 summary 冪等／null。
  - 完了状態: 旧レコードの temperament を渡しても例外なく partial summary に正規化される。
  - _Requirements: 7.3, 7.4_
  - _Boundary: legacy.ts_
  - _Depends: 1.1_

## 2. 既存 rpg-class-diagnosis の契約追従（型変更を緑に戻す）

- [x] 2.1 クラス組み立て・生成ロジックの追従
  - className 組成を簡潔化（full 時のみ短ラベルを埋め込み、partial/none は気質省略）、クラス判定が気質 summary を採用、アンケート→軸マッピングを共有コアの import へ切替。
  - 既存の該当単体テスト（className 組成・クラス組み立て）を新契約へ更新。
  - 完了状態: クラス組み立ての単体テストが緑で、full は「称号・短ラベルな職掌」、partial/none は気質なし className を返す。
  - _Requirements: 7.1, 7.2, 7.5_
  - _Boundary: assemble.ts, build-diagnosis.ts_
  - _Depends: 1.3, 1.4_

- [ ] 2.2 クラスカード・レーダーの気質描画追従
  - クラスカードを気質 summary（極・短ラベル）から描画し、partial 時は「残り軸に回答」導線を出す。職掌レーダーの未使用 temperamentAxes prop を撤去。
  - 既存の該当コンポーネントテストを新契約へ更新。
  - 完了状態: クラスカードが新 summary で崩れず描画され、partial で残軸導線が出る。
  - _Requirements: 7.2, 7.4_
  - _Boundary: class-card.tsx, vocation-radar.tsx_
  - _Depends: 1.1, 2.1_

- [ ] 2.3 (P) クラスフレーバー生成（AI）の消費追従
  - `@bulr/ai-class-diagnosis` の ClassResult 消費箇所を確認し、temperament を直接参照している箇所を新形状へ修正（className 文字列利用なら最小変更）。
  - 完了状態: `@bulr/ai-class-diagnosis` の typecheck/build が新 ClassResult で通る。
  - _Requirements: 7.1_
  - _Boundary: @bulr/ai-class-diagnosis_
  - _Depends: 1.1_

## 3. DB: deep-link とアンケート seed 拡張

- [ ] 3.1 (P) プレイスタイルアンケートの id 解決クエリ
  - 気質アンケート（playstyle 種別）の id を1件返すクエリを追加しバレル登録。未投入時は null。
  - DB 統合テスト（inline env・直列）で id が返ることを確認。
  - 完了状態: seed 済み環境で気質アンケートの id が取得でき、未投入で null が返る。
  - _Requirements: 6.1_
  - _Boundary: getPlaystyleSurveyId_

- [ ] 3.2 気質アンケートの4軸 seed 拡張
  - 「計画と即興」「堅実と挑戦」の2カテゴリ×6問（自然表現3＋反転表現3）を追加し4軸24問化。level 高＝即興／挑戦 に正規化。既存2軸カテゴリは不変、冪等 upsert で既存回答を保全。カテゴリ名は 1.4 の軸マッピングと一致させる。
  - DB 統合テスト: 4カテゴリの回答から4軸すべてが determined の採点入力になる。既存の「気質アンケートが職種一覧に出ない」挙動が退行しない。
  - 完了状態: seed 実行で4軸24問が投入され、4軸回答から16型が確定できる。
  - _Requirements: 5.1, 5.3, 5.4_
  - _Depends: 1.4_
  - _Boundary: playstyle survey seed_

## 4. UI: 独立体験と導線

- [ ] 4.1 (P) 4軸バイポーラ可視化
  - 各軸を第1極⇔第2極のトラックに描き、寄りをマーカーで示す（数値ラベルなし）。未回答軸は淡色＋未回答表示。素の SVG/CSS。
  - 完了状態: 4軸のバーが数値なしで描画され、determined/未回答が視覚的に区別される。
  - _Requirements: 2.2, 2.3_
  - _Boundary: axis-bars.tsx_
  - _Depends: 1.2_

- [ ] 4.2 共有プレゼンテーション（none/partial/full 分岐）
  - 充足度で分岐し、full はアーキタイプ（名称・説明・次の一歩）＋4軸バー＋共有、partial は判定済み軸の寄り＋残軸への回答導線、none はアンケート誘導を表示。数値は非表示。standalone とクラス診断の両方から使う単一実装。
  - 完了状態: 3状態が正しく描画され、full でアーキタイプ、partial で残軸導線が出る。
  - _Requirements: 2.1, 2.3, 3.1, 3.2, 3.3_
  - _Boundary: playstyle-result.tsx_
  - _Depends: 1.2, 1.3, 4.1_

- [ ] 4.3 (P) 共有パネル
  - full 時にアーキタイプ名のみを含む共有表現を生成。個人特定情報・回答生データ・数値を含めない。
  - 完了状態: 共有操作でアーキタイプ名のみの共有テキストが得られ、PII を含まない。
  - _Requirements: 4.1, 4.2, 4.3_
  - _Boundary: playstyle-share-panel.tsx_
  - _Depends: 1.2_

- [ ] 4.4 独立ルート（プレイスタイル診断ページ）とナビ
  - 認証済み候補者の気質回答をライブ算出し、充足度に応じて結果を表示する専用ページを新設。気質 CTA の直行先（アンケート id 解決、未解決時は一覧フォールバック）を用意。ナビに導線を追加。本人所有スコープで取得。
  - 完了状態: `/playstyle-diagnosis` が本人の最新気質結果を表示し、ナビから到達でき、回答更新が再訪時に反映される。
  - _Requirements: 2.5, 3.5, 6.1, 6.4_
  - _Boundary: playstyle-diagnosis page, nav-items_
  - _Depends: 1.3, 1.4, 3.1, 4.2_

- [ ] 4.5 クラス診断ページの気質のみ回答者分岐と deep-link
  - クラス診断ページの「スキル未回答」状態を気質回答有無で分岐し、気質のみ回答者に気質結果＋スキル解放 CTA を表示。気質 CTA をアンケートへ直行させる。既存レコードの気質を legacy 正規化してから描画する。
  - 完了状態: スキル未回答＋気質回答済みの候補者がクラス診断ページで気質結果とスキル解放導線を見られ、気質 CTA がアンケートへ直行する。
  - _Requirements: 6.2, 6.3, 7.4_
  - _Boundary: class-diagnosis-view, class-diagnosis page_
  - _Depends: 1.3, 1.5, 3.1, 4.2_

## 5. Validation: E2E・退行

- [ ] 5.1 独立体験と導線の E2E/UI 検証
  - standalone の none/partial/full 描画と数値非表示、気質 CTA のアンケート直行、クラス診断ページの気質のみ受け皿、共有テキストの PII/数値非含、旧4型レコードの無害描画＋残軸導線を検証。
  - 完了状態: 上記ユーザー可視挙動が自動テストで緑になる。
  - _Requirements: 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 7.3, 7.4_
  - _Depends: 4.4, 4.5_

- [ ] 5.2 退行・統合検証
  - 既存 rpg-class-diagnosis のテスト群が新契約で緑に戻ること、DB 統合（アンケート id 解決・4軸集計・気質アンケートの職種一覧除外の退行防止）を確認。再診断で16型気質が反映されることを含む。
  - 完了状態: 既存＋新規のユニット/統合/コンポーネントテストが全て緑で、候補者 typecheck とビルドが通る。
  - _Requirements: 5.5, 7.1, 7.5_
  - _Depends: 2.1, 2.2, 2.3, 3.1, 3.2_
