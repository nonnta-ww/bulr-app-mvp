# Implementation Plan — session-from-entry

- [ ] 1. Foundation: interview_session スキーマ拡張と migration

- [x] 1.1 `interview_session` テーブルに `entry_id` カラムを追加し、`candidate_id` を nullable 化する
  - `packages/db/src/schema/interview-session.ts` の `candidateId` から `.notNull()` を削除する
  - `entryId: text('entry_id').references(() => entry.id)` カラムを追加する（nullable FK）
  - `entry` スキーマのインポートを追加する
  - すべての timestamp が `{ withTimezone: true }` で定義されていることを確認する
  - TypeScript コンパイルが通ること（既存の `candidate_id NOT NULL` 制約に依存するコードのエラーを確認）
  - 注意: candidate_id を nullable 化する際の既存コード影響:
    - assessment-engine spec (Stage 1) が `apps/business/lib/actions/create-session.ts` (または apps/business → apps/web 移行後の現行ファイル) でセッション作成時に `candidateId` を notNull 前提で INSERT している可能性がある
    - 実装前に以下を確認:
      1. `grep -rn "candidateId" apps/business/lib/actions/ apps/business/app/ 2>/dev/null` で参照箇所を特定
      2. `pnpm --filter @bulr/business typecheck` を本タスクの schema 変更後に実行し、型エラーが出る箇所を一覧化
    - 型エラーが発生する場合は本タスク内では修正せず、`### X.Z 既存 Stage 1 セッション作成フローの nullable 対応` として別タスクで対応 (タスク 9.x で対応)
    - 対象ファイル候補: `apps/business/lib/actions/create-session.ts`, `apps/business/app/(interviewer)/interviews/new/page.tsx` の form handler
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - _Boundary: InterviewSessionSchema_

- [x] 1.2 drizzle-kit で migration ファイルを生成し dev DB に適用する
  - `pnpm --filter @bulr/db drizzle-kit generate` で migration SQL ファイルを生成する
  - 生成された SQL に `ALTER COLUMN candidate_id DROP NOT NULL` と `ADD COLUMN entry_id` が含まれることを確認する
  - `DATABASE_URL` inline env override を使用して `drizzle-kit push` で dev DB に適用する
  - dev DB で既存 Stage 1 セッション（`entry_id=NULL`）が正常に読み書きできることを確認する
  - _Requirements: 1.6_
  - _Depends: 1.1_
  - _Boundary: DrizzleMigration_

- [ ] 2. Foundation: getInterviewSession クエリ実装

- [x] 2.1 `getInterviewSession` クエリ関数を実装する
  - `packages/db/src/queries/interview/get-interview-session.ts` を新規作成する
  - `InterviewSessionWithCandidate`（Stage 1 形式）と `InterviewSessionWithEntry`（Stage 2 形式）の型を定義する
  - `InterviewSessionResult = ({ kind: 'stage1' } & ...) | ({ kind: 'stage2' } & ...)` の discriminated union を定義する
  - `session.entryId IS NOT NULL` の場合は `entry → opening → company → candidateProfile → resumeDocument → skillSurveyResponse` を LEFT JOIN する
  - `session.entryId IS NULL` の場合は `candidate` を LEFT JOIN して `kind: 'stage1'` を返す
  - セッションが存在しない場合は `null` を返す
  - TypeScript 型が strict mode でエラーなくコンパイルできること
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - _Depends: 1.1_
  - _Boundary: GetInterviewSession_

- [x] 2.2 `packages/db/src/queries/index.ts` に `getInterviewSession` を re-export する
  - `export * from './interview/get-interview-session'` を追加する
  - `@bulr/db` から `getInterviewSession` と `InterviewSessionResult` 型がインポートできること
  - _Requirements: 4.4_
  - _Depends: 2.1, entry-flow タスク 1.3_ (queries/index.ts は entry-flow が entry クエリを追記した後に本 spec が getInterviewSession を追記する。ファイル全体を置換せず追記すること)
  - _Boundary: GetInterviewSession_

- [ ] 3. Core: createSessionFromEntry Server Action 実装

- [x] 3.1 `createSessionFromEntry` Server Action を実装する
  - `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/_actions/create-session-from-entry.ts` を新規作成する
  - `authedAction` + `requireCompanyUser` の二重防御パターンで認証・認可する
  - `getEntryWithSnapshots(entryId)` で entry を取得し、`entry.opening.companyId === companyId` の所有権を検証する
  - `SELECT interview_session WHERE entry_id = entryId` で既存セッションを確認し、存在する場合は既存 ID を返す
  - 新規作成時: `interview_session` に `{ entryId, candidateId: null, plannedPatternCodes: selectedPatternCodes }` で INSERT する
  - INSERT 成功後に `UPDATE entry SET status='progressing'` を実行する
  - 作成した（または既存の）`sessionId` を返す
  - `{ ok: true, data: { sessionId } }` の形式で返すこと（呼び出し元が `/interviews/{sessionId}` へリダイレクトできる）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - _Boundary: CreateSessionFromEntryAction_

- [ ] 4. Core: パターン選定支援 UI 実装（apps/business、entry 詳細ページ拡張）(P)

- [ ] 4.1 (P) `PatternMatchingUtil` キーワードマッチング純関数を実装する
  - `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/_lib/pattern-matching.ts` を新規作成する（またはコンポーネントと同じファイル内の純関数でも可）
  - `matchPatterns(answers, patterns)` を実装する：回答テキスト（選択肢 + 記述）の単語セットと、各パターンの `title + description` の単語セットをキーワードマッチングする
  - `matchScore > 0` のパターンを `matchScore` 降順で返す
  - ML・ベクトル検索は使用しない（文字列の部分一致・単語マッチングのみ）
  - TypeScript strict mode でコンパイルできること
  - _Requirements: 3.2, 3.7_
  - _Boundary: PatternMatchingUtil_

- [ ] 4.2 (P) `PatternRecommendation` Server Component を実装する
  - `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/_components/pattern-recommendation.tsx` を新規作成する
  - props: `{ skillSurveyResponse: SkillSurveyResponseWithAnswers | null, patterns: AssessmentPattern[] }`
  - `skillSurveyResponse` が null の場合「スキルアンケート未回答のため推奨パターンを表示できません」を表示する
  - `PatternMatchingUtil.matchPatterns` の結果をスコア降順で最大 10 件表示する
  - 各推奨パターンにパターン名・カテゴリ・マッチしたキーワードを表示する
  - 推奨が「ヒント」であることを明示するラベル（例：「推奨パターン（参考）」）を付与する
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - _Boundary: PatternRecommendation_

- [ ] 4.3 `CreateSessionForm` Client Component を実装する
  - `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/_components/create-session-form.tsx` を新規作成する
  - `'use client'` を指定する
  - props: `{ entryId: string, recommendedPatternCodes: string[], allPatterns: AssessmentPattern[] }`
  - 初期選択状態として `recommendedPatternCodes` をセットし、面接官が自由に変更できるチェックボックス UI を提供する
  - 最低 1 パターン選択のクライアントバリデーション（未選択時「1 つ以上のパターンを選択してください」を表示）
  - 「面接セッションを作成」ボタン押下で `createSessionFromEntry({ entryId, selectedPatternCodes })` を呼ぶ
  - `useTransition` でローディング状態を表示する
  - 成功時: `router.push('/interviews/sessionId')` でリダイレクトする
  - エラー時: インラインエラーメッセージを表示する
  - _Requirements: 3.3, 3.5, 3.6_
  - _Depends: 3.1_
  - _Boundary: CreateSessionForm_

- [ ] 4.4 entry 詳細ページを拡張してパターン選定支援 UI を統合する
  - `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/page.tsx` を更新する
  - `assessment_pattern` テーブルから全アクティブパターンを取得する
  - `PatternRecommendation` コンポーネントに `skillSurveyResponse` と `patterns` を渡す
  - `CreateSessionForm` に `entryId`・`recommendedPatternCodes`・`allPatterns` を渡す
  - 既存のプレースホルダ「面接セッションを作成」ボタンを `CreateSessionForm` に置き換える
  - `/openings/{openingId}/entries/{entryId}` でページが正常に表示されること
  - _Requirements: 3.1, 3.4_
  - _Depends: 4.1, 4.2, 4.3, entry-flow タスク 4.2_ (entry-flow が作成する entry 詳細ページに本 spec が追記する形のため、entry-flow 4.2 完了が前提)
  - _Boundary: BusinessEntryDetailPage_

- [ ] 5. Core: 面接アシスタント UI ヘッダー Stage 1/2 分岐 (P)

- [ ] 5.1 (P) `SessionHeader` コンポーネントを実装する
  - `apps/business/app/(interviewer)/interviews/[sessionId]/_components/session-header.tsx` を新規作成する
  - props: `{ session: InterviewSessionResult }`
  - `session.kind === 'stage2'` の場合: `candidateProfile.displayName` と `opening.title` を表示する
  - `session.kind === 'stage1'` の場合: `candidate.name` と `session.session.role` を表示する（Stage 1 互換）
  - _Requirements: 5.1, 5.2_
  - _Depends: 2.1_
  - _Boundary: SessionHeader_

- [ ] 5.2 (P) 面接アシスタントページに `SessionHeader` を組み込む
  - `apps/business/app/(interviewer)/interviews/[sessionId]/page.tsx` を更新する
  - `getInterviewSession(sessionId)` を使ってセッションデータを取得する
  - `<SessionHeader session={session} />` を面接 UI の上部に配置する
  - 状態 A/B の UI（LLM 処理・録音）への変更を一切行わない
  - Stage 1 セッション・Stage 2 セッションのどちらでもページが正常に表示されること
  - _Requirements: 5.1, 5.2, 5.3_
  - _Depends: 5.1_
  - _Boundary: InterviewSessionPage_

- [ ] 6. Core: 面接後レポート Stage 2 拡張 (P)

- [ ] 6.1 (P) `EntryContextSection` コンポーネントを実装する
  - `apps/business/app/(interviewer)/interviews/[sessionId]/report/_components/entry-context-section.tsx` を新規作成する
  - props: `{ session: InterviewSessionResult }`
  - `session.kind === 'stage2'` の場合のみ内容を返す（`session.kind === 'stage1'` の場合は `null`）
  - `opening.title` + `company.name` + `candidateProfile.displayName` を表示する
  - `session.skillSurveyResponse` が null でない場合: スキルアンケートの回答カテゴリ・スキル一覧のサマリーを表示する
  - `session.skillSurveyResponse` が null の場合: 「スキルアンケート回答なし」を表示する
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Depends: 2.1_
  - _Boundary: EntryContextSection_

- [ ] 6.2 (P) 面接後レポートページに `EntryContextSection` を組み込む
  - `apps/business/app/(interviewer)/interviews/[sessionId]/report/page.tsx` を更新する
  - `getInterviewSession(sessionId)` でセッションデータを取得する
  - `<EntryContextSection session={session} />` を面接スコアセクションの上部に配置する
  - `session.kind === 'stage1'` の既存レポート表示（`candidate.name` + 面接スコア）を維持する
  - Stage 1・Stage 2 どちらのセッションでもレポートページが正常に表示されること
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Depends: 6.1_
  - _Boundary: ReportPage_

- [ ] 7. Core: /interviews/new ナビゲーション非表示化 (P)

- [ ] 7.1 (P) `apps/business` ナビゲーションから `/interviews/new` へのリンクを削除する
  - `apps/business` の layout.tsx または nav コンポーネントファイルを特定する
  - `/interviews/new` へのリンクを削除する（`page.tsx` ファイルは削除しない）
  - サイドバー・ヘッダーなどのナビゲーション UI に `/interviews/new` リンクが表示されないこと
  - `/interviews/new` へ直接 URL アクセスすると従来通りフォームが表示されること（ルートは温存）
  - `/interviews`（セッション一覧）への既存リンクは維持されること
  - _Requirements: 7.1, 7.2, 7.3_
  - _Boundary: Nav_

- [ ] 8. Core: admin セッション一覧・詳細 entry 経由対応 (P)

- [ ] 8.1 (P) admin セッション一覧クエリを拡張して entry 経由セッションの候補者名を取得できるようにする
  - 注意: 実装前に admin セッション一覧クエリの現在のファイルパスを確認すること:
    - 候補 1: `packages/db/src/queries/admin/session-list-query.ts` (assessment-engine spec 経由で作成された場合)
    - 候補 2: `apps/admin/app/sessions/_queries/*.ts` (monorepo-app-split で apps/admin に移設された場合)
    - 候補 3: 上記いずれも存在せず、admin の sessions ページが直接 `db.select()` を inline で書いている場合
    - 実装前確認手順:
      1. `grep -rn "interview_session" apps/admin/ packages/db/src/queries/admin/ 2>/dev/null` で参照箇所を特定
      2. 最も近い場所 (apps/admin 内の sessions ページか packages/db のクエリファイル) を更新対象とする
      3. 当該ファイルの SELECT 文に LEFT JOIN を追加し、entry / opening / company を併用取得 (entry_id IS NULL のセッションも表示できるよう LEFT JOIN)
    - このタスクは具体的なファイルパスを実装時に確定する。
  - `packages/db/src/queries/admin/session-list-query.ts` を更新する
  - `interview_session.entry_id IS NOT NULL` の場合に `entry → candidate_profile` を LEFT JOIN する
  - `apps/admin/app/sessions/page.tsx` を更新して `entry_id IS NOT NULL ? candidateProfile.displayName : candidate.name` の分岐表示を実装する
  - `/admin/sessions` で entry 経由セッションの候補者名に `candidateProfile.displayName` が使われること
  - Stage 1 セッションが従来通り `candidate.name` を表示すること
  - _Requirements: 8.1, 8.2_
  - _Depends: 1.1_
  - _Boundary: AdminSessionList_

- [ ] 8.2 (P) admin セッション詳細に entry 情報を追加表示する
  - `packages/db/src/queries/admin/session-detail-query.ts` を更新して entry 経由 JOIN を追加する（または `getInterviewSession` を利用する）
  - `apps/admin/app/sessions/[id]/page.tsx` を更新して `entry_id IS NOT NULL` の場合に opening タイトル・会社名・candidateProfile.displayName を追加表示する
  - `/admin/sessions/{id}` で entry 経由セッションの opening / entry 情報が表示されること
  - 既存の手動評価入力・LLM 評価突合・CSV/JSON エクスポートが entry 経由セッションに対しても正常動作すること
  - _Requirements: 8.3, 8.4_
  - _Depends: 2.1_
  - _Boundary: AdminSessionDetail_

- [ ] 9. Integration: 全体統合・ビルド検証

- [ ] 9.1 全 packages・apps のタイプチェックとビルドが通ることを確認する
  - `pnpm typecheck` を実行して全 workspace でエラーがないことを確認する
  - `pnpm build` を実行して全 packages + apps (business, admin, candidate) がビルド成功することを確認する
  - `candidate_id` nullable 化により影響を受けた既存コードがある場合は修正する（Stage 1 セッション作成フロー等）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 6.1, 7.1, 7.2, 8.1, 8.2_
  - _Depends: 4.4, 5.2, 6.2, 7.1, 8.1, 8.2_

- [ ] 9.2 entry 経由セッション作成の E2E smoke test を手動で実施する
  - dev 環境で `/openings/{openingId}/entries/{entryId}` にアクセスしパターン選定支援 UI が表示されること
  - パターンを選択して「面接セッションを作成」を押下し、`interview_session` が entry_id 付きで作成され、`entry.status='progressing'` になること
  - 作成後 `/interviews/{sessionId}` に遷移し、Stage 2 ヘッダー（candidateProfile.displayName + opening.title）が表示されること
  - 面接後レポートで entry 情報・スキルアンケートサマリーが表示されること
  - Stage 1 セッション（既存）の面接アシスタント UI・レポートが従来通り表示されること
  - `/admin/sessions` で entry 経由セッションが正しい候補者名で表示されること
  - _Requirements: 2.6, 3.5, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 7.2, 7.3, 8.1, 8.3_
  - _Depends: 9.1_

---

## Implementation Notes

- **1.1**: `candidate_id` の nullable 化により downstream で型エラーが出る。task 9.1 で修正対象:
  - `apps/business/lib/queries/build-llm-context.ts:34` — `eq(schema.candidate.id, session.candidate_id)` が `string | null` 不可で TS2769。null ガードか非nullアサートが必要。
  - 参考: `apps/business/lib/actions/create-session.ts:82`、`apps/business/app/(interviewer)/interviews/page.tsx:66` も `candidate_id` を使用（現状エラーなしだが getInterviewSession 移行時に要確認）。
