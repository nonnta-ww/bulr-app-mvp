# Research & Design Decisions

## Summary

- **Feature**: `turn-pipeline-tx-separation`
- **Discovery Scope**: Extension（既存 realtime-interview-capture の内部リファクタ）
- **Key Findings**:
  - FK 制約 `transcript_segment.logical_turn_id → interview_turn.id` により、segment claim の前に `interview_turn` 行が存在する必要がある。現行はそのため analysis 後に INSERT しており、LLM がロック内クリティカルパスに入る。
  - `interview_turn` の `llm_analysis` / `pattern_match_confidence` / `question_source` / `question_text` は NOT NULL かつ LLM 由来。ターン確定を LLM 前に切り出すにはこれらの nullable 化が必要。
  - tick は `live-state route` がレスポンス構築後に `runSegmenterTick({ consumer: createWriteBackConsumer(sessionId) })` を呼ぶ。解析フェーズはこの直後にロック外で起動できる。

## Research Log

### 現行 processTurn の LLM 呼び出し位置

- **Context**: どの処理がロック内 LLM で、何が構造的（LLM 不要）かを切り分ける。
- **Sources**: `apps/business/lib/capture/turn-pipeline.ts:74-293`（processTurn 前半）, `:536-641`（writeBackLogicalTurns / cap gate / consumer）。
- **Findings**: 構造的（確定時に既知）= duration / sequence_no / raw transcript / fingerprint。LLM 由来 = interviewer/candidate 分離（pendingSplit 時）/ llm_analysis / pattern 解決 / question_source。cap gate（checkRateLimit read-only 150）は `writeBackLogicalTurns` 冒頭、increment は processTurn 内（rate-limit.ts の SQL 複製）。
- **Implications**: 確定フェーズは構造フィールドのみで INSERT 可能。LLM 4〜5 種は解析フェーズへ全て移す。increment は解析前へ移動し executor 注入で一本化。

### interview_turn consumer の棚卸し

- **Context**: LLM 由来列を nullable 化した際に pending 行を露出させない範囲を把握する。
- **Sources**: grep（llm_analysis / interviewTurn 参照）→ live-state.ts / get-report-data.ts / load-session-with-turns.ts / load-recent-turns.ts / aggregate-heatmap.ts / admin session 系 / turns-next-events.ts / turns/next route / proposal/regenerate route。
- **Findings**: coverage 分類（live-state.ts）は interview_turn.pattern_id を参照。レポート・履歴・heatmap は解析結果に依存。
- **Implications**: これら consumer は `analysis_status='done'` を解析済み条件として扱う（pending は集計・履歴から除外）。ライブ画面は「転写は即時、coverage/質問は解析完了に伴い増える」挙動になり、現行と観測的に一致。

## Architecture Pattern Evaluation

| 案 | 概要 | 長所 | 短所 | 採否 |
| --- | --- | --- | --- | --- |
| **A: analysis_status + nullable 化（staged fill）** | interview_turn を pending で先に確定し後段で UPDATE | 新テーブル・FK 付け替え不要。segment claim/ fingerprint はほぼ現状維持 | LLM 由来 4 列の nullable 化 + consumer の done フィルタ（~9 箇所） | **採用** |
| B: 新 logical_turn staging テーブルへ claim 付け替え | interview_turn は解析後にのみ INSERT | interview_turn consumer が無変更（常に解析済み） | 新テーブル + FK 付け替え + claim セマンティクス変更というスキーマ churn 大 | 見送り |

- **決定**: A を採用。理由は「segment claim の FK 先を確定フェーズで即用意でき、スキーマ変更が additive（列追加 + nullable 化 + backfill=done）に収まる」こと。consumer 変更は done フィルタ追加という機械的・境界の明確な変更で、B の構造変更より低リスク。

## Design Decisions / Risks

- **並行 claim**: 解析フェーズはロック外のため、`UPDATE ... SET analysis_status='processing' WHERE analysis_status='pending' RETURNING` の行レベル条件付き更新で at-most-once を担保。stale `processing`（worker クラッシュ）は `analysis_started_at` タイムアウトで再獲得。
- **コスト保護**: increment を解析前に移し、失敗しても計上を残す（Req 3.2）。上限到達ターンは `skipped` 終端で無限 pending を防ぐ。
- **リスク**: nullable 化に伴う consumer の見落としが pending 行の露出（未解析ターンがレポート/一覧に出る）を招く可能性 → タスク段階で consumer を網羅チェックし、統合テストで pending 露出を検知する。
- **リスク**: 解析フェーズの fire タイミング（tick レスポンス後）が serverless で凍結され得る → 完了保証は「次 tick が残 pending を再度処理」と finalize の解析フェーズが担保（at-least-once）。

## Design Review Outcomes（kiro-validate-design: GO 条件付き）

3 件の Critical Issue を design.md に反映済み:

- **Issue 1（データ整合性）**: 列既定を `'done'` → `'pending'` に変更し、既存行は明示 `UPDATE ... SET analysis_status='done'` で backfill。CHECK 制約 `done ⇒ llm_analysis/pattern_match_confidence 非 null` を追加し、「pending 指定忘れで done+null」事故を DB で構造的に防止。
- **Issue 2（観測的無変更）**: coverage 集約 + 次質問生成を「バッチ末尾で 1 回」ではなく **per-turn**（`prepared_for_turn_no = sequence_no+1`）に維持。これらは現行で既に per-turn try/catch 隔離済みのため、cadence を変えない。
- **Issue 3（順序整合）**: 解析は `sequence_no` 厳密昇順。`failed` ターンは遷移検知の境界として扱い、`finalize` は `analyzePendingTurns` → 未カバレッジ再集約 → レポートの順で遅延・失敗ターンの coverage を収束させる。
