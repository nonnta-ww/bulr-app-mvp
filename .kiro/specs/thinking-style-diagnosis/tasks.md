# Implementation Plan

> 実装順の原則（design.md「Implementation Order」）: 判定コア（app ローカル・純関数）→ スキーマ enum → DB seed/クエリ → UI → 検証。
> 本 spec は加算的複製で、マージ済みの playstyle・RPGクラス診断・`@bulr/types`・`@bulr/ai` を一切改修しない。既存動作の退行がないことは Phase 5 で担保する。

## 1. Foundation: 思考スタイル判定コア（app ローカル）

- [x] 1.1 軸・極・16アーキタイプ定義（app ローカル型）
  - 4軸（抽象⇔具体／論理⇔直感／収束⇔発散／理論先行⇔実践先行）・8極のラベルと canonical order・中点を定義。軸・極・code・充足度・summary の型を app ローカルに定義（`@bulr/types` は変更しない）。16 code すべてに対応するアーキタイプ（名称・短ラベル・説明・次の一歩）をキュレーテッド手書きで定義し、欠落は型エラーになるようにする。
  - 文言に数値・他者比較・順位を含めない。軸キーは気質軸とは別個の思考スタイル軸として定義する。
  - 完了状態: 16 code が型で網羅され、各アーキタイプが名称・shortLabel・説明・nextStep を持ち、app の typecheck が通る。
  - _Requirements: 1.1, 1.3, 1.6, 2.4_
  - _Boundary: thinking-style axes, archetypes_

- [x] 1.2 (P) 思考スタイルのスコアリング純関数（partial 対応）
  - 回答を4軸で採点し、回答済み軸のみ determined、中点ちょうどは既定極＋balanced、充足度（none/partial/full）と full 時のみ非null の code を決定論導出。逆転設問の向きを吸収する。外部サービス（LLM 等）に依存しない。
  - 単体テスト: 空（none）／一部軸のみ（partial・未回答軸 determined=false）／4軸（full・code 非null）／中点 balanced／逆転吸収／同一入力同一出力。
  - 完了状態: 単体テストが緑で、部分回答が嘘の完全型にならず、4軸回答で16型のいずれかに確定する。
  - _Requirements: 1.2, 1.4, 1.5, 3.4_
  - _Boundary: thinking-style score_
  - _Depends: 1.1_

- [x] 1.3 (P) アンケート回答→軸マッピング
  - アンケートのカテゴリ名→思考スタイル軸の対応（4軸ぶん）と、回答束→採点入力への写像を定義する。「level 高＝第2極（具体／直感／発散／実践先行）」の向き契約を維持し、逆転設問メタを採点入力へ引き渡す。未対応カテゴリは無視する。
  - 単体テスト: 4カテゴリの回答が4軸の採点入力に写像され、未対応カテゴリは無視される。
  - 完了状態: マッピングが単一箇所に定義され、page から利用できる形で公開される。
  - _Requirements: 5.2_
  - _Boundary: thinking-style answers_
  - _Depends: 1.1_

## 2. Foundation: スキーマ（アンケート種別）

- [ ] 2.1 アンケート種別 enum に思考スタイルを追加
  - `survey_kind` enum に `thinking_style` 値を追加し、drizzle migration を生成する。既存値は不変（後方互換）。マージ時の migration 番号衝突は既存運用（振り直し）で解消する。
  - 完了状態: migration 適用後、`kind='thinking_style'` を持つ survey を保存でき、既存 survey は影響を受けない。
  - _Requirements: 5.1_
  - _Boundary: skill-survey schema_

## 3. DB: seed とクエリ

- [ ] 3.1 (P) 思考スタイルアンケートの seed（4軸24問）
  - `kind`/`jobType`='thinking_style'、4カテゴリ（抽象と具体／論理と直感／収束と発散／理論と実践）×6問（自然表現3＋反転表現3）＝24問を投入。level 高＝第2極 に正規化。category 名は 1.3 の軸マッピングと一致させ、subcategory は非null。冪等 upsert で再投入しても重複・破壊しない。seed runner のバレルに登録。
  - DB 統合テスト（inline env・直列）: seed 後に `kind/jobType='thinking_style'` が1件・期待 title・4カテゴリ×6問・subcategory 非null。4カテゴリの回答から4軸すべてが determined の採点入力になる。
  - 完了状態: seed 実行で4軸24問が投入され、4軸回答から16型が確定できる。
  - _Requirements: 5.1, 5.3, 5.4_
  - _Boundary: thinking-style survey seed_
  - _Depends: 1.3, 2.1_

- [ ] 3.2 (P) アンケート id 解決クエリ
  - 思考スタイルアンケート（`kind='thinking_style'`）の id を1件返すクエリを追加しバレル登録。未投入時は null。
  - DB 統合テスト: 解決 id が直接 SELECT と一致し、未投入で null が返る。
  - 完了状態: seed 済み環境で思考スタイルアンケートの id が取得でき、未投入で null が返る。
  - _Requirements: 6.1_
  - _Boundary: getThinkingStyleSurveyId_
  - _Depends: 2.1_

- [ ] 3.3 (P) 本人回答取得クエリ
  - 認証済み候補者本人の思考スタイルアンケート最新回答を取得するクエリを追加しバレル登録。他者スコープの回答は取得しない。
  - DB 統合テスト: 本人回答が取得でき、他候補者の回答は取得されない。
  - 完了状態: 本人スコープでのみ最新回答が取得できる。
  - _Requirements: 6.3_
  - _Boundary: getCandidateThinkingStyleResponse_
  - _Depends: 2.1_

## 4. UI: 独立体験と導線

- [ ] 4.1 (P) 4軸バイポーラ可視化
  - 各軸を第1極⇔第2極のトラックに描き、寄りをマーカーで示す（数値ラベルなし）。未回答軸は淡色＋未回答表示。素の SVG/CSS。
  - 完了状態: 4軸のバーが数値なしで描画され、determined/未回答が視覚的に区別される。
  - _Requirements: 2.2, 2.3_
  - _Boundary: axis-bars.tsx_
  - _Depends: 1.1_

- [ ] 4.2 結果プレゼンテーション（none/partial/full 分岐）
  - 充足度で分岐し、full はアーキタイプ（名称・キュレーテッド説明・次の一歩）＋4軸バー＋共有、partial は判定済み軸の寄り＋残軸への回答導線、none はアンケート誘導を表示。数値は非表示。
  - 完了状態: 3状態が正しく描画され、full でアーキタイプ、partial で残軸導線が出る。
  - _Requirements: 2.1, 2.3, 2.4, 3.1, 3.2, 3.3_
  - _Boundary: thinking-style-result.tsx_
  - _Depends: 1.1, 1.2, 4.1_

- [ ] 4.3 (P) 共有パネル
  - full 時にアーキタイプ名のみを含む共有表現を生成。個人特定情報・回答生データ・数値・code を含めない。共有 API 不在環境では例外を投げず劣化する。
  - 完了状態: 共有操作でアーキタイプ名のみの共有テキストが得られ、PII を含まない。
  - _Requirements: 4.1, 4.2, 4.3_
  - _Boundary: thinking-style-share-panel.tsx_
  - _Depends: 1.1_

- [ ] 4.4 独立ルート（思考スタイル診断ページ）＋deep-link＋ナビ
  - 認証済み候補者の思考スタイル回答をライブ算出し、充足度に応じて結果を表示する専用ページを新設。CTA の直行先（アンケート id 解決、未解決時は一覧フォールバック）を用意。ナビに導線を追加。本人所有スコープで取得。永続化なしのため回答更新は再訪時に自動反映。
  - 完了状態: `/thinking-style-diagnosis` が本人の最新結果を表示し、ナビから到達でき、CTA がアンケートへ直行し、回答更新が再訪時に反映される。
  - _Requirements: 2.5, 3.5, 6.1, 6.2, 6.3_
  - _Boundary: thinking-style-diagnosis page, nav-items_
  - _Depends: 1.2, 1.3, 3.1, 3.2, 3.3, 4.2_

## 5. Validation: E2E・退行

- [ ] 5.1 独立体験と導線の E2E/UI 検証
  - standalone の none/partial/full 描画と数値非表示、CTA のアンケート直行、ナビ入口、共有テキストの PII/数値/code 非含を検証。
  - 完了状態: 上記ユーザー可視挙動が自動テストで緑になる。
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 6.2_
  - _Depends: 4.4_

- [ ] 5.2 DB統合・退行・全体検証
  - DB 統合（アンケート提供・id 解決・本人回答取得）に加え、思考スタイルアンケートが既存の職種スキルアンケート一覧・自己分析対象に**含まれない**こと（既存 `kind='skill'` 包含フィルタによる自動除外）を検証。候補者 typecheck とビルドが通り、既存テスト群が退行しないことを確認。
  - 完了状態: 新規＋既存のユニット/統合/コンポーネントテストが全て緑で、候補者 typecheck とビルドが通り、思考スタイルアンケートが一覧に漏出しない。
  - _Requirements: 5.1, 5.4, 5.5, 6.1, 6.3_
  - _Depends: 3.1, 3.2, 3.3, 4.4_

## Implementation Notes

- **加算的複製・非改修**: 本 spec は playstyle 対応物を思考スタイル版に複製する。playstyle・RPGクラス診断・`@bulr/types`・`@bulr/ai` は触らない。挙動契約は同一、固有語（気質→思考スタイル）と軸/アーキタイプ内容のみ差し替える。
- **型は app ローカル**: thinking-style の型はクロスパッケージ消費者を持たないため `apps/candidate/app/_lib/thinking-style/` に定義（`@bulr/types` へ足さない）。依存方向 types→db→ai→apps を厳守。
- **一覧除外はコード変更なし**: 既存 `answered-surveys-query.ts` のフィルタは `kind='skill'` 包含型で、`thinking_style` は自動除外される。5.2 のテストで担保する（R5.5）。
- **vitest(esbuild) は型チェックしない**: 個別ファイルの vitest は esbuild トランスパイルのため型エラーを素通りする。`noUncheckedIndexedAccess` 由来の型エラーは full `tsc --noEmit` で初めて顕在化する。Foundation の純関数タスクは vitest 緑でも full typecheck は task 5.2 まで担保されない（AXES の分割代入等はガードを入れる）。
- **DB 統合テストは直列・inline env**: `packages/db` の統合テストは `fileParallelism:false`／inline env、`DATABASE_URL` 未設定なら describe.skip。クリーンな dev DB で実行する。
- **seed の環境反映**: enum migration 適用後、思考スタイル seed を dev/prod にシードスクリプトで投入し動作確認する（自動反映ではない）。
- **enum migration 番号衝突**: `survey_kind` への値追加 migration はマージ時に番号衝突しうる。既存運用（振り直し）で解消する。
