# Implementation Plan

- [ ] 1. スキーマとマイグレーション（self_analysis）
- [x] 1.1 self_analysis テーブルと型を定義する
  - `self_analysis`（candidate_profile_id cascade / skill_survey_id / source_response_id / source_submitted_at / aggregated_snapshot jsonb / llm_output jsonb null可 / metadata jsonb null可 / regeneration_count / regeneration_window_start / timestamps）と `(candidate_profile_id, skill_survey_id)` 一意インデックスを定義
  - `AggregatedSnapshot` / `SelfAnalysisNarrative` / `SelfAnalysisMetadata`(llm_cost_estimate) 型を定義し schema barrel から export
  - 完了条件: スキーマファイルが型 export され `pnpm --filter @bulr/db typecheck` が通る
  - _Requirements: 6.1, 9.1_
- [x] 1.2 マイグレーションを生成・適用する
  - self_analysis の drizzle マイグレーションを生成し、ローカル DB に適用（push）して実テーブルが作成される
  - 完了条件: ローカル Postgres に self_analysis テーブルと一意インデックスが存在する
  - _Requirements: 6.1_
  - _Depends: 1.1_

- [ ] 2. データ読み書きクエリ
- [x] 2.1 (P) 自己分析用の skill-survey 読み出しクエリを実装する
  - 候補者の回答済み survey を特定する関数と、最新回答を「カテゴリ名・選択肢ラベル付き」で束ねて返す関数を実装（skill_survey 系テーブルは read-only、書き込みしない）
  - 複数回答時は最新提出の survey 1 件を対象（複数職種横断は対象外）
  - queries barrel から export
  - 完了条件: 候補者IDから回答が「カテゴリ名＋選択ラベル＋自由記述」の構造で取得でき、未回答時は null を返す
  - _Requirements: 1.2, 2.1, 7.2_
  - _Boundary: analysis-source-query_
- [x] 2.2 (P) self_analysis 読み書きと再生成抑制カウンタを実装する
  - 取得（本人 candidate_profile_id 固定）・upsert（一意キーで最新1件上書き・source_submitted_at 記録）・narrative のみ更新・日次再生成カウンタ判定（行内 regeneration_count/window_start、mock の quota_reset_at は使わない）を実装
  - queries barrel から export
  - 完了条件: 同一(候補者,survey)で upsert が最新1件を保持し、日次上限超過時に判定が拒否を返す
  - _Requirements: 1.5, 5.1, 5.3, 6.1, 6.2, 6.3, 9.1, 9.2, 9.3_
  - _Boundary: self-analysis-query_
  - _Depends: 1.1_

- [ ] 3. 自然言語生成パッケージ（@bulr/ai-self-analysis）
- [x] 3.1 LLM パッケージを scaffold する
  - 新パッケージ `@bulr/ai-self-analysis`（package.json/tsconfig、deps: ai / @ai-sdk/anthropic / zod / @bulr/ai）を作成し、`@bulr/db` に依存させない
  - `pnpm-workspace.yaml` と `turbo.json` に `packages/ai/self-analysis` を登録し、workspace がパッケージを解決できることを確認する
  - 完了条件: パッケージが workspace に認識され（pnpm install/解決が通る）空 barrel が typecheck を通る
  - _Requirements: 3.1_
- [x] 3.2 強み弱みサマリ・成長アクション生成関数を実装する
  - 集計スナップショット＋回答文脈（選択ラベル/自由記述）を入力に、強み・弱み・成長アクションを structured output（Zod）で生成し `{output, usage}` を返す
  - Grounding: 入力を当該候補者の回答由来データのみに限定し、system プロンプトで「回答に存在する選択ラベル/自由記述に紐づけて言及」「回答に無いスキルを断定しない」「数値スコア・他者比較・順位を出力しない」を制約
  - 完了条件: 任意の回答文脈入力に対し強み/弱み/成長アクションの文字列配列が返り、出力に数値スコア・他者比較が含まれない
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - _Depends: 3.1_

- [ ] 4. 集計・コスト（純関数）
- [x] 4.1 (P) 決定論的集計ロジックを実装する
  - 回答からカテゴリ別カバレッジ（answered/total）・選択の広さ・自由記述の有無・全体網羅度を算出する純関数。同一入力→同一出力。数値スコア化・他者比較を含めない
  - 完了条件: 同じ回答入力に対し常に同一の AggregatedSnapshot を返し、序列化スコアを含まない
  - _Requirements: 2.1, 2.2, 2.3_
  - _Boundary: aggregate_
  - _Depends: 2.1_
- [x] 4.2 (P) LLM コスト推定の純関数を実装する
  - usage(input/output tokens) から estimated_usd を $3/$15 per M で算出
  - 完了条件: 既知のトークン数に対し estimated_usd が $3/$15 式と一致する
  - _Requirements: 9.1, 9.2_
  - _Boundary: cost_

- [ ] 5. 生成オーケストレーション（Server Action）
- [x] 5.1 自己分析の生成アクションを実装する
  - authedAction 内で requireCandidate→対象 survey 特定→未回答なら NO_RESPONSE→日次抑制判定で超過なら RATE_LIMITED→回答読出→決定論集計→LLM 生成→コスト算出→upsert（source_submitted_at・カウンタ更新）→/self-analysis を revalidate
  - LLM 生成失敗時は aggregated_snapshot を残し llm_output=null・metadata=null で保存し status を viz_only で返す
  - 完了条件: 回答ありで生成すると self_analysis が永続化され、LLM 失敗時も集計のみ保存されて viz_only が返る
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 4.1, 4.2, 6.1, 7.1, 9.1, 9.3_
  - _Depends: 2.1, 2.2, 3.2, 4.1, 4.2_
- [x] 5.2 自然言語部分の再生成アクションを実装する
  - 保存済み aggregated_snapshot を入力に LLM のみ再実行し llm_output・metadata を更新（集計・source 版は不変）。日次抑制判定を適用
  - 完了条件: viz_only 状態から再生成すると llm_output が埋まり、集計スナップショットは変化しない
  - _Requirements: 4.3, 5.2, 9.3_
  - _Depends: 5.1_

- [ ] 6. 自己分析 UI
- [x] 6.1 (P) 網羅度可視化コンポーネントを実装する
  - AggregatedSnapshot を Tailwind バーで描画（カテゴリ別カバレッジ・広さ・自由記述有無）。数値スコア・他者比較は表示しない
  - 完了条件: スナップショットを渡すとカテゴリ別網羅度バーが描画され、序列化スコア表示が無い
  - _Requirements: 2.1, 2.3_
  - _Boundary: coverage-bars_
  - _Depends: 1.1_
- [x] 6.2 自己分析表示と生成/再生成 UI を実装する
  - 可視化＋強み/弱み/成長アクション表示、生成・再生成 CTA（pending 表示、Result の2段階読み）、llm_output=null 時は可視化＋「サマリ再生成」、陳腐化バナー＋再生成、NO_RESPONSE/RATE_LIMITED のメッセージ表示
  - 生成が全体失敗（集計・LLM 双方失敗など）した場合も失敗メッセージ＋再生成促進を表示する
  - 完了条件: 生成中はローディング、viz_only では可視化＋再試行、全体失敗時は失敗メッセージ＋再生成導線、陳腐化時は再生成導線が表示される
  - _Requirements: 1.4, 4.1, 4.2, 4.3, 5.2, 8.2_
  - _Depends: 5.1, 5.2, 6.1_
- [x] 6.3 自己分析ページ（状態分岐・アクセス制御）を実装する
  - Server Component で requireCandidate（未認証→/sign-in、プロフィール無→/onboarding）。対象 survey・保存済み自己分析・最新回答 submittedAt を取得し NoResponse/Empty/Complete/VizOnly/Stale を分岐。陳腐化＝最新 submittedAt > source_submitted_at。再訪時は再生成なしで保存済みを表示
  - 完了条件: 各状態が正しく出し分けられ、未認証/本人以外はアクセスできず、再訪で再生成なしに表示される
  - _Requirements: 1.1, 1.3, 5.1, 5.3, 6.3, 7.1, 7.2, 8.2_
  - _Depends: 2.1, 2.2, 6.2_

- [ ] 7. 導線統合（ホーム）
- [ ] 7.1 候補者ホームに自己分析導線を追加する
  - ホームの「Wave 2+ 予定」プレースホルダを /self-analysis への導線（前提として skill-survey 回答が必要な旨）に置換
  - 完了条件: ホームから自己分析へ遷移でき、未回答前提の案内が表示される
  - _Requirements: 8.1, 8.2_
  - _Depends: 6.3_

- [ ] 8. 統合確認・検証
- [ ] 8.1 型チェックとビルドを通す
  - 変更パッケージ（@bulr/db / @bulr/ai-self-analysis / @bulr/candidate）の typecheck と candidate の build を通す
  - 完了条件: typecheck・build がエラーなく完了し /self-analysis ルートが生成される
  - _Requirements: 1.1, 3.1_
  - _Depends: 7.1_
- [ ] 8.2 手動スモークテストを完走する
  - 生成→可視化＋サマリ＋成長アクション表示／未回答→NO_RESPONSE 導線／LLM 失敗注入→viz_only＋再試行／回答更新→Stale→再生成／再訪→再生成なし表示／日次上限→RATE_LIMITED／未認証→/sign-in／本人以外非表示／ホーム導線／出力に数値スコア・他者比較が出ないことを確認
  - 完了条件: 上記シナリオがすべて期待どおり動作する
  - _Requirements: 1.3, 1.4, 2.3, 3.4, 4.1, 4.3, 5.1, 5.3, 6.3, 7.2, 8.1, 9.3_
  - _Depends: 8.1_

## Implementation Notes

- skill-survey 系テーブルは read-only。回答スキーマ/読み出し形が変わると 2.1・4.1 の再検証が必要（design Revalidation Triggers）。
- `@bulr/ai-self-analysis` は `@bulr/db` 非依存（DI）。データは Server Action が渡す。
- コストは `self_analysis.metadata.llm_cost_estimate`（mock と同形）。admin `/monitoring` への合流は admin-operations の downstream（本 spec 範囲外）。
- 日次再生成上限の具体値（例 5–10/日）と対象 survey 選定（最新提出の1件・横断対象外）は実装時に確定（design Issue 3）。
- ローカル DB push は drizzle-kit の env 解決（DIRECT_URL/DATABASE_URL inline 上書き）に注意。
