# Brief: session-from-entry

## Problem

Stage 1 で構築された `assessment-engine` は `interview_session.candidate_id → candidate` で「面接官がその場で候補者情報を手入力してセッションを作る」モデル。Wave 2 + Wave 3 (`company-and-opening` + `entry-flow`) で **エントリーモデル** が整備されることで、この旧モデルとの矛盾が発生する:

1. `entry` には既に候補者情報 (resume_document スナップショット + skill_survey_response スナップショット) が紐付くのに、面接セッション作成 UI で再度候補者情報を手入力する必要がある (二重管理 + 不整合リスク)
2. Stage 1 の `candidate` テーブル (apps/business が面接官手入力で作る受動マスタ) は Stage 2 の `candidate_profile` (候補者所有プロフィール) と意味が重複している
3. スキルアンケート結果が seam として公開済み (`getLatestResponseByCandidateProfileId`) なのに、面接官が「どのパターンを深掘りするか」の選定時にこの情報を参照できる UI がない (PRD 機能5「事前問診→パターン選択」の接続点が未配線)
4. 既存の `apps/business/app/(interviewer)/interviews/new/page.tsx` (Stage 1 で作られた候補者手入力フォーム) は entry 経由のフローと共存できない

**本 spec は Wave 3 の最後のピース**: assessment-engine を entry 経由で起動するように改修し、Stage 1 → Stage 2 の意味論的整合を完成させる。

## Current State

- Stage 1 `assessment-engine`:
  - `interview_session` テーブル: `candidate_id` FK → `candidate` (受動マスタ)
  - `apps/business/app/(interviewer)/interviews/new/page.tsx`: 候補者の name / applied_role / background_summary を手入力してセッション作成
  - `interview_turn` / `pattern_coverage` / `session_report` は無変更で済む (`interview_session.id` への参照だけが問題ない)
- Wave 3 [[entry-flow]] 完了時点:
  - `entry` テーブルに `candidate_profile_id` + `opening_id` + `resume_document_id` + `skill_survey_response_id` + status
  - 候補者の `candidate_profile.display_name` などが entry 経由で取れる
- skill-survey 4.1: `getLatestResponseByCandidateProfileId` + `SkillSurveyResponseWithAnswers` 公開済み
- assessment_pattern: 57 パターン × 4 段階質問テンプレ (Stage 1 で投入済み、本 spec で touch しない)
- Stage 1 `candidate` テーブル: 本 spec で **削除も縮退もしない** (Stage 1 で作成した既存セッション群が参照している)。新規 entry 経由のセッションのみ `entry_id` を使うように分岐する

## Desired Outcome

- 面接官が `bz.bulr.net/openings/{openingId}/entries/{entryId}` で「面接セッションを作成」ボタンをクリックすると、`entry_id` を引き継いだ `interview_session` が作成される
- 新規セッションは候補者情報 (name / applied_role / background_summary) を手入力させず、`entry.candidate_profile_id` 経由で `candidate_profile.display_name` + `entry.resume_document` から派生して埋める
- セッション作成画面で、`getLatestResponseByCandidateProfileId(candidate_profile_id, ...)` で取得したスキルアンケート結果を表示し、**「どのパターンを深掘りするか」の選定支援 UI** を提供 (アンケート回答から関連 pattern_id を推奨表示)
- 既存の `interviews/new` ルート (候補者手入力フォーム) は Stage 1 セッション (entry_id 無し) のために残置するが、UI 上では非推奨化 (or 削除して entry 経由に統一)
- 面接後レポート画面 (`/interviews/[sessionId]/report`) で entry 経由のセッションは募集情報 + スキルアンケート結果も併せて表示

## Approach

- **`interview_session` スキーマ拡張**:
  - `entry_id` カラム追加 (nullable text FK → entry.id)。Stage 1 セッション (entry 経由でない) は `entry_id=NULL`、Stage 2 entry 経由セッションは `entry_id` 設定
  - `candidate_id` は残置 (Stage 1 セッション互換のため)。新規 entry 経由セッションでは `candidate_id` を NULL or entry から派生した shadow `candidate` 行を作る (design.md で確定。MVP は NULL を許容するのが simpler)
  - データ整合性: `entry_id IS NOT NULL OR candidate_id IS NOT NULL` の CHECK 制約 (or アプリ層で保証)
- **`assessment-engine` Server Action / Server Component 改修**:
  - `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/_actions/create-session-from-entry.ts`: 新規 Server Action。entry_id を入力にセッション作成、内部で `candidate_profile` + `resume_document` + `skill_survey_response` を引き継ぐ
  - `getInterviewSession(sessionId)` クエリ拡張 (`packages/db/src/queries/interview/`): `entry_id IS NOT NULL` の場合は entry + opening + company + resume + skill_survey_response を JOIN して返す
- **面接アシスタント UI (状態A/B) の互換**:
  - 既存の面接アシスタント UI (5 LLM 関数群) は `interview_session.id` 単独で動くため、entry_id 追加自体は影響しない
  - 候補者情報を表示する部分 (例: セッション開始画面のヘッダ) は、entry_id があれば `candidate_profile.display_name` + opening 情報を表示、なければ Stage 1 互換で `candidate.name` を表示する分岐を入れる
- **パターン選定支援 UI**:
  - `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/page.tsx` (entry-flow で作られた詳細ページ) に「面接セッションを作成」ボタンと、その上に「スキルアンケート回答ベースの推奨パターン」セクションを追加
  - 推奨ロジック: skill_survey_response の回答 (例: 「Java 経験あり」「Postgres 経験あり」) と assessment_pattern のタグ (もしあれば) のキーワードマッチング。完全な ML ではなく、シンプルな含有判定でも MVP には十分
  - 面接官が推奨パターン (or 自由選択) を選んでセッション作成 → セッション作成 transaction で session_pattern_coverage を初期化
- **`interviews/new` (Stage 1) の扱い**:
  - 削除はせず、ナビゲーションから非表示にする (隠しルートとして温存)
  - or: 削除して Stage 1 セッション作成は完全に廃止 (本番 DB の既存セッションは閲覧のみ可)
  - design.md で方針確定。本 spec のスコープ判断では「非表示 + 温存」が安全
- **Stage 1 `candidate` テーブルの扱い**:
  - 本 spec で削除しない (Stage 1 セッションの FK が残っている)
  - 将来 Stage 1 セッションが全て自然に終了した後、別 spec で `candidate` テーブルを論理削除 or 縮退

## Scope

- **In**:
  - `interview_session.entry_id` カラム追加 + migration (nullable text FK)
  - `interview_session.candidate_id` を nullable に変更 (entry 経由は NULL 許容)
  - データ整合性 (entry_id IS NOT NULL OR candidate_id IS NOT NULL) のアプリ層保証
  - `createSessionFromEntry` Server Action (apps/business、entry_id 入力)
  - entry 詳細ページにパターン選定支援 UI を追加 (skill survey ベース推奨)
  - `getInterviewSession` クエリ拡張 (entry 経由情報の併用)
  - 面接アシスタント UI のヘッダ部分の Stage 1/2 分岐表示
  - 面接後レポート画面 (`/interviews/[sessionId]/report`) の Stage 2 拡張 (entry 情報併用表示)
  - 既存 `/interviews/new` ルートの非表示化 (ナビゲーション削除、ファイル温存)
- **Out**:
  - 面接アシスタント本体 (5 LLM 関数、状態A/B 遷移ロジック) — Stage 1 から無改修
  - assessment_pattern マスタの追加・編集 (Wave 4 [[admin-operations]])
  - Stage 1 `candidate` テーブルの削除・縮退 (将来別 spec)
  - 候補者側からの面接セッション可視化 (進捗確認、Wave 5+ で UX 改善時)
  - 面接結果の自動公開・候補者側通知 (MVP では企業側 UI のみ)
  - パターン選定の ML ベース最適化 (MVP は単純なキーワードマッチング)
  - L4 模擬面接結果のセッションへの引き継ぎ (Wave 4 [[mock-interview]])

## Boundary Candidates

- `interview_session` スキーマ拡張 (entry_id 追加、candidate_id nullable 化)
- `createSessionFromEntry` Server Action (apps/business)
- パターン選定支援 UI (entry 詳細ページ拡張、apps/business)
- `getInterviewSession` クエリ拡張 (entry 経由 JOIN)
- 面接アシスタント UI ヘッダの Stage 1/2 分岐
- 面接後レポート画面の Stage 2 拡張
- `/interviews/new` 非表示化 (nav 削除)

## Out of Boundary

- 5 LLM 関数本体 (analyzeTurn 等) — 触らない
- 状態 A/B 遷移ロジック — 触らない
- `interview_turn` / `pattern_coverage` / `session_report` テーブル — 触らない
- assessment-pattern-seed (57 パターン) — 触らない
- Stage 1 candidate テーブル削除 — 触らない
- L4 模擬面接 — Wave 4

## Upstream / Downstream

- **Upstream**:
  - [[entry-flow]] (Wave 3) — entry エンティティ + resume_document_id + skill_survey_response_id
  - Stage 1 [[assessment-engine]] — interview_session スキーマ + 面接アシスタント UI
  - [[skill-survey]] (Wave 2) — getLatestResponseByCandidateProfileId + パターン選定支援の入力
- **Downstream**:
  - 直接の downstream spec はない (Wave 3 の最終ピース)
  - Wave 4 [[mock-interview]] — 直接の依存はないが、entry 経由のセッションが正常稼働することが mock-interview の意味付け (本番面接の練習場) を保証する
  - Wave 5+ スカウト機能 — entry → session の動線が完成していれば、スカウト経由でのエントリーも同じ flow で吸収できる

## Existing Spec Touchpoints

- **Extends**:
  - Stage 1 [[assessment-engine]] — `interview_session` テーブル拡張 + UI ヘッダ拡張 + クエリ拡張。**本 spec が直接 Stage 1 のコードを改修する spec**
  - [[entry-flow]] (Wave 3 直前) — entry 詳細ページに本 spec の機能 (パターン選定支援 + セッション作成) を追加
- **Adjacent**:
  - [[company-and-opening]] — 直接触らないが、opening 情報を `interview_session` 表示時に間接参照
  - [[admin-review-panel]] (Stage 1) — admin の検証パネルは `interview_session` を見る。entry 経由セッションも見えるように一覧表示拡張が必要 (本 spec のスコープに含める)

## Constraints

- 既存 monorepo + Drizzle Postgres を継続
- 日本語 UI
- 「将来像は見据えるが実装は最小」(roadmap.md §Stage 2 制約)
- packages → apps の単方向依存
- Drizzle timestamp は `{ withTimezone: true }` で統一
- drizzle-kit push は inline env override
- **Stage 1 互換性**: Stage 1 セッション (entry_id=NULL) も引き続き正常表示・閲覧できること (既存データの破壊禁止)
- **assessment-engine 本体は無改修**: 5 LLM 関数 / 状態 A/B / interview_turn / pattern_coverage / session_report は本 spec で触らない (responsibility seam を保つ)
- **データ整合性**: entry_id と candidate_id の少なくとも一方が必須。アプリ層で保証 (CHECK 制約は MVP ではアプリ層に委ねる)
- **パターン選定の信頼性**: MVP のキーワードマッチング推奨は「ヒント」であり、面接官が必ず承認する (フルオートでパターンを決定しない、面接官の判断を尊重する設計)
