# Implementation Plan

## 1. 基盤（スキーマ・共有ユーティリティ）

- [ ] 1.1 `interview_turn` に解析状態を追加するマイグレーション
  - `turn_analysis_status` enum（pending/processing/done/failed/skipped）を作成する
  - `analysis_status`（NOT NULL, 既定 `pending`）/ `analysis_retry_count`（NOT NULL, 既定 0）/ `analysis_started_at` を追加する
  - `llm_analysis` / `pattern_match_confidence` / `question_source` / `question_text` を nullable 化する
  - 既存行を明示 `UPDATE ... SET analysis_status='done'` で backfill する
  - CHECK 制約 `analysis_status='done' ⇒ llm_analysis IS NOT NULL AND pattern_match_confidence IS NOT NULL` を追加する
  - `(session_id, sequence_no) WHERE analysis_status IN ('pending','processing')` の partial index を追加する
  - 観測可能な完了: `drizzle-kit migrate` 後、既存行が全て `done` になり、`done` かつ `llm_analysis=NULL` の INSERT が CHECK 制約で拒否される
  - _Requirements: 6.1, 9.4_

- [ ] 1.2 rate-limit の executor 注入対応 (P)
  - `checkAndIncrement` に executor 引数（既定 = グローバル db）を追加し、トランザクション外からも計上できるようにする
  - `turn-pipeline.ts` に複製されている increment SQL を廃し、この共通関数へ寄せる
  - 観測可能な完了: 単体テストで、tx 外呼び出しの計上が LLM 失敗後も巻き戻らず残ること、および 150 到達後に追加計上されないことを確認できる
  - _Requirements: 3.1, 3.2_
  - _Boundary: rate-limit_

## 2. コア（確定フェーズ・解析フェーズ）

- [ ] 2.1 確定フェーズ（ロック内・LLM なし）の実装
  - advisory lock の tx 内で、確定ターンごとに未 claim 確認 → `sequence_no = MAX+1` 採番 → `interview_turn` を `pending` + 生 transcript（raw）+ duration + fingerprint で INSERT → segment を claim する
  - LLM 呼び出しを一切含めない。`(session_id, turn_fingerprint)` 一意制約 + `onConflictDoNothing` で冪等、既 claim 済みは放棄する
  - `writeBackLogicalTurns` をこの確定フェーズへ委譲するよう再構成する
  - 観測可能な完了: LLM を呼ばずに pending 行と claim 済みセグメントが生成され、同一 fingerprint の再実行が no-op になることをテストで確認できる
  - _Requirements: 1.1, 1.2, 1.3, 6.1_

- [ ] 2.2 解析フェーズの claim と LLM 解析（done 化）
  - advisory lock を取得せず、`pending`（+ stale `processing`）ターンを `sequence_no` 厳密昇順で取得する
  - 各ターンを `pending→processing` の条件付き UPDATE で claim（0 行なら別 worker が処理中としてスキップ）する
  - cap gate（`checkAndIncrement` を解析前に実行）→ 話者分離 → ターン分析 → パターン解決 → 質問候補照合 → 解析結果と `done` を UPDATE する
  - `analysis_started_at` のタイムアウト超過 `processing` を再獲得可能にする
  - 解析コンテキスト（直近ターン履歴）はコミット済み `done` ターンから読む
  - 観測可能な完了: pending→processing→done 遷移が起き、並行実行で同一ターンが二重解析されないことをテストで確認できる
  - _Requirements: 2.1, 3.1, 3.3, 5.1, 5.2, 6.2, 6.3_
  - _Depends: 1.1, 1.2_

- [ ] 2.3 per-turn の集約・次質問生成と障害/上限の終端化
  - `done` UPDATE に続けて、当該ターン単位でカバレッジ集約（Prepare-1a/1b）+ 次質問生成（`prepared_for_turn_no = sequence_no+1`）を実行し per-turn cadence を維持する
  - LLM 失敗はターン単位で捕捉し `retry_count++`、上限未満は `pending` 復帰・上限到達は `failed` にする（他ターン・確定行に波及させない）
  - cap 到達時は `analysis_capped_at` 設定 + 当該ターンを `skipped`（終端）にする
  - 先行 `failed` ターンは Prepare-1a の遷移検知で「解析不能な境界」として扱い、後続の集約・採番を妨げない
  - 観測可能な完了: 失敗時の retry_count 増加と上限での failed、cap での skipped、per-turn の proposal 採番維持、先行 failed でも後続続行、をテストで確認できる
  - _Requirements: 2.2, 2.3, 4.1, 4.2, 4.3_
  - _Depends: 2.2_

## 3. 統合（tick・finalize・consumer 配線）

- [ ] 3.1 tick / live-state への配線
  - segmenter tick の consumer を「確定のみ」に変更する
  - live-state route がレスポンス構築後に解析フェーズをロック外で起動するよう配線する
  - ライブ状態 API のレスポンス形状・意味を変更しない
  - 観測可能な完了: live-state のレスポンス契約が不変で、tick 後に pending ターンの解析が起動することを確認できる
  - _Requirements: 1.1, 7.1, 7.2_
  - _Depends: 2.1, 2.2, 2.3_

- [ ] 3.2 finalize への配線
  - `finalize-session` を「セグメント flush → 解析フェーズ → 既存の未カバレッジ再集約（現行⑤）→ レポート生成」の順に配線する
  - 上限到達等で残るターンがあっても best-effort でレポート生成を継続する
  - 観測可能な完了: 未解析ターンが最終化前に解析され、遅延・失敗ターンの coverage が再集約で収束することをテストで確認できる
  - _Requirements: 8.1, 8.2_
  - _Depends: 2.2, 2.3_

- [ ] 3.3 consumer の done フィルタ対応 (P)
  - coverage 分類・レポート・履歴・heatmap・admin セッション系・次質問イベント等の consumer が、解析済み条件として `analysis_status='done'` を用い、pending/processing/failed/skipped 行を集計・履歴・レポートに露出させないようにする
  - 観測可能な完了: pending 行が存在する状態でも、レポート・一覧・ライブ coverage に未解析ターンが現れないことを確認できる
  - _Requirements: 6.1, 7.1, 9.4_
  - _Boundary: interview_turn consumers_
  - _Depends: 1.1_

## 4. 検証（テスト・回帰）

- [ ] 4.1 単体・統合テストの新規追加
  - 確定フェーズ（LLM 非呼び出し・claim・冪等）と解析フェーズ（状態遷移・retry/failed・cap/skipped・並行二重解析防止）の単体テストを追加する
  - CHECK 制約が `done+null` を拒否すること、per-turn の `question_proposal` 採番（`prepared_for_turn_no = sequence_no+1`）が維持されること、先行 `failed` ターンでも後続が進み finalize 再集約で収束すること、を統合テスト（実 DB）で確認する
  - 観測可能な完了: 追加テストが実 Postgres で全て pass する
  - _Requirements: 2.1, 3.2, 4.2, 6.2, 6.3, 8.1_
  - _Depends: 2.1, 2.2, 2.3, 3.2_

- [ ] 4.2 既存テストの 2 フェーズ追随と回帰確認
  - `turn-pipeline.test.ts` / `e2e-scenarios.test.ts` 等の既存期待を確定/解析の 2 フェーズ構成へ追随させる
  - `capture_status` 状態機械・`evaluate` の入出力・LLM プロンプトが不変であることを確認する
  - 観測可能な完了: 既存 + 新規テストを含む apps/business のスイートが実 Postgres で全て pass する
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - _Depends: 3.1, 3.2, 3.3, 4.1_
