# 実装計画

## タスク一覧

---

- [ ] 1. DB スキーマ・migration・クエリ関数
- [x] 1.1 `mock_interview` Drizzle スキーマを作成する (P)
  - `packages/db/src/schema/mock-interview.ts` に `mockInterview` テーブルを定義する
  - `candidateProfileId`（FK → `candidate_profile.id`, ON DELETE CASCADE）・`patternCode`・`startedAt`・`endedAt`（nullable）・`turnCount`（default 0）・`formativeFeedback`（JSONB nullable）・`metadata`（JSONB nullable）・`createdAt`・`updatedAt` カラムを含む
  - `FormativeFeedback` / `MockInterviewMetadata` の TypeScript インターフェースを同ファイルで定義する
  - `MockInterview` / `NewMockInterview` の Drizzle 推論型を export する
  - **クロステーブル拡張**: `packages/db/src/schema/candidate-profile.ts` の `candidateProfile` テーブル定義に `quotaResetAt: timestamp('quota_reset_at', { withTimezone: true })` カラムを追加する（nullable、`candidate-auth-onboarding` が所有するテーブルへの mock-interview spec の拡張）
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 8, 要件 1_
  - _Boundary: DBスキーマ_

- [ ] 1.2 `packages/db/src/schema/index.ts` に `mock-interview` を追加する (P)
  - `export * from './mock-interview';` を追記する
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 8_
  - _Boundary: DBスキーマ_
  - _Depends: 1.1_

- [ ] 1.3 drizzle-kit で migration ファイルを生成・適用する
  - `pnpm drizzle-kit generate` を実行し migration ファイルが生成されること
  - `pnpm drizzle-kit push`（開発 DB）または `pnpm drizzle-kit migrate`（本番 DB）で `mock_interview` テーブルが作成されること
  - `candidate_profile_id` と `created_at` のインデックスが生成 SQL に含まれること
  - 生成 SQL に `ALTER TABLE "candidate_profile" ADD COLUMN "quota_reset_at" TIMESTAMPTZ` が含まれること（`candidate-profile.ts` への拡張カラム追加の反映）
  - _Requirements: 要件 8, 要件 1_
  - _Depends: 1.1_

- [ ] 1.4 `mock_interview` クエリ関数を実装する (P)
  - `packages/db/src/queries/mock-interview.ts` に以下の関数を実装する
    - `countMockInterviewsInQuotaWindow(candidateProfileId: string, quotaResetAt: Date | null): Promise<number>` — クォータウィンドウ内の件数を返す。ウィンドウ開始 = `GREATEST(date_trunc('month', now()), COALESCE(quotaResetAt, date_trunc('month', now())))` をアプリ層で計算し、`WHERE created_at >= windowStart` で絞り込む（または SQL の `GREATEST`/`COALESCE` を Drizzle の `sql` タグで直接使用する）
    - `createMockInterview({ candidateProfileId, patternCode })` — INSERT し生成レコードを返す
    - `getMockInterviewByIdAndOwner(id, candidateProfileId)` — ID + 所有者検証付き SELECT
    - `incrementMockInterviewTurnCount(id)` — `turn_count` を `turn_count + 1` に UPDATE
    - `finalizeMockInterview(id, { endedAt, formativeFeedback, turnCount, metadata })` — 終了時 UPDATE
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 1, 4, 5, 6_
  - _Boundary: DBクエリ_
  - _Depends: 1.1_

- [ ] 1.5 `packages/db/src/queries/index.ts` にクエリ関数を re-export する (P)
  - `export * from './mock-interview';` を追記する
  - **クロス spec 注記**: このタスクで追加される re-export（`countMockInterviewsInQuotaWindow` 等）は `admin-operations` spec がコスト集計クエリを実装する際の前提となる。admin-operations のタスクはこのタスク完了後に着手すること。
  - _Requirements: 要件 8_
  - _Boundary: DBクエリ_
  - _Depends: 1.4_

---

- [ ] 2. `packages/ai/mock/` パッケージを新設する
- [ ] 2.1 `@bulr/ai-mock` パッケージ雛形を作成する (P)
  - `packages/ai/mock/package.json` を作成する（name: `@bulr/ai-mock`、dependencies: `ai`, `@ai-sdk/anthropic`, `zod`）
  - **`@bulr/db` は runtime dependencies に含めない**: `@bulr/ai-mock` の LLM 関数（`conductMockInterview` / `generateFormativeFeedback`）は純粋関数であり、パターンデータ・会話履歴を引数として受け取るだけでDB に直接アクセスしない。型のみが必要な場合は `devDependencies` に追加し、引数型は型として import するのみとする（循環依存の回避、パッケージ境界の明確化）。
  - `packages/ai/mock/src/index.ts` （空バレル）を作成する
  - `pnpm-workspace.yaml` に `packages/ai/mock` を追記する
  - `apps/candidate/package.json` に `@bulr/ai-mock: workspace:*` 依存を追加する
  - `pnpm install` でワークスペースが正常解決されること
  - _Requirements: 要件 9_
  - _Boundary: AIパッケージ_

- [ ] 2.2 `conductMockInterview` 関数を実装する (P)
  - `packages/ai/mock/src/conduct-mock-interview.ts` を作成する
  - `conductMockInterviewOutputSchema`（`next_question`, `current_level`, `notes` フィールド）を Zod で定義する
  - `generateObject` + `claudeSonnet46` で LLM を呼び出し、構造化出力を返す
  - プロンプトにパターンの `level_1_intro`〜`level_4_focus`・`ai_perspective`・`signals`・会話履歴を組み込む
  - `validateAndFallback` で Zod 検証（失敗時はセーフフォールバック）
  - 戻り値に `usage: { input_tokens, output_tokens }` を含める
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 3, 9_
  - _Boundary: AIパッケージ_
  - _Depends: 2.1_

- [ ] 2.3 `generateFormativeFeedback` 関数を実装する (P)
  - `packages/ai/mock/src/generate-formative-feedback.ts` を作成する
  - `generateFormativeFeedbackOutputSchema`（`authenticity`, `judgment`, `scope`, `meta_cognition`, `ai_literacy`, `overall` フィールド）を Zod で定義する
  - `generateObject` + `claudeSonnet46` で LLM を呼び出し、構造化出力を返す
  - プロンプトに 5 次元ルーブリック定義・パターン情報・会話履歴全体を組み込む
  - bulr 語彙（スコアなし・成長示唆文体）をシステムプロンプトで固定する
  - `validateAndFallback` で Zod 検証（失敗時はセーフフォールバック）
  - 戻り値に `usage: { input_tokens, output_tokens }` を含める
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 4, 9_
  - _Boundary: AIパッケージ_
  - _Depends: 2.1_

- [ ] 2.4 `packages/ai/mock/src/index.ts` バレルに両関数を export する (P)
  - `conductMockInterview`, `conductMockInterviewOutputSchema` を export する
  - `generateFormativeFeedback`, `generateFormativeFeedbackOutputSchema` を export する
  - `TurnItem`（`{ role: 'interviewer' | 'candidate'; content: string }`）型を export する
  - `pnpm build`（`packages/ai/mock`）でエラーがないこと
  - _Requirements: 要件 9_
  - _Boundary: AIパッケージ_
  - _Depends: 2.2, 2.3_

---

- [ ] 3. API Routes を実装する
  - _Depends: 1.4, 2.4_

- [ ] 3.1 `/api/mock-interview/turns/next` Route Handler を実装する (P)
  - `apps/candidate/app/api/mock-interview/turns/next/route.ts` を作成する
  - `requireCandidate()` で認証・candidateProfileId 取得
  - リクエストボディを Zod で検証（`sessionId`, `userMessage`, `history`, `patternCode`）
  - `getMockInterviewByIdAndOwner` で所有者確認（不一致は 403）
  - `getAssessmentPatternByCode` でパターン取得
  - `conductMockInterview` を呼び出し、結果を `{ question, currentLevel }` として返す
  - `incrementMockInterviewTurnCount` でターン数更新
  - レスポンスに `usage` を含め、クライアント側累積に利用できるようにする
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 3, 6, 7_
  - _Boundary: APIRoute_

- [ ] 3.2 `/api/mock-interview/finalize` Route Handler を実装する (P)
  - `apps/candidate/app/api/mock-interview/finalize/route.ts` を作成する
  - `requireCandidate()` で認証・candidateProfileId 取得
  - リクエストボディを Zod で検証（`sessionId`, `history`, `patternCode`, `accumulatedUsage`）
  - `getMockInterviewByIdAndOwner` で所有者確認（不一致は 403）
  - `generateFormativeFeedback` を呼び出す
  - `finalizeMockInterview` で DB 更新（`ended_at`・`formative_feedback`・`turn_count`・`metadata.llm_cost_estimate`）
    - `estimated_usd = (accumulatedUsage.input_tokens * 3 + accumulatedUsage.output_tokens * 15) / 1_000_000`
  - レスポンス `{ sessionId }` を返す
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 4, 6, 7_
  - _Boundary: APIRoute_

---

- [ ] 4. Server Action・パターン選択 UI を実装する
  - _Depends: 1.4, 1.5_

- [ ] 4.1 `createMockInterviewSessionAction` Server Action を実装する (P)
  - `apps/candidate/app/mock-interview/_actions/create-session.ts` を作成する（`'use server'`）
  - `requireCandidate()` で認証・candidateProfileId 取得
  - `db.select({ quotaResetAt: candidateProfile.quotaResetAt }).from(candidateProfile).where(eq(candidateProfile.id, profile.id))` で `quota_reset_at` を取得する
  - `countMockInterviewsInQuotaWindow(profile.id, quotaResetAt)` でクォータ検査（>= 3 なら `{ error: '今月の上限に達しました（3 回 / 月）' }` 返却）
  - `createMockInterview` で INSERT
  - `redirect('/mock-interview/' + session.id)` を実行する
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 1, 2, 6_
  - _Boundary: ServerAction_

- [ ] 4.2 パターン選択画面（`/mock-interview`）を実装する (P)
  - `apps/candidate/app/mock-interview/page.tsx`（Server Component）を作成する
  - `requireCandidate()` でガード（未認証 → `/sign-in`、プロフィール未設定 → `/onboarding`）
  - `candidate_profile.quota_reset_at` を SELECT して取得する
  - `countMockInterviewsInQuotaWindow(profile.id, quotaResetAt)` でクォータ消費数を取得し、残数 = `3 - count` を計算する
  - `db.select().from(assessmentPattern).where(isActive=true)` でパターン一覧取得
  - `skill_survey_response` が候補者に存在するか boolean で確認する（`response_data` カラムは存在しないため読み取らない）
  - クォータ残数・パターン一覧・`hasSkillSurvey: boolean` を `PatternList` + `QuotaStatus` コンポーネントに渡す
  - クォータ上限到達時は「今月の上限に達しました（3 回 / 月）」を表示し「開始」ボタンを無効化する
  - 57 パターンが 6 カテゴリ（D / T / P / S / O / A）に分類して表示されること
  - _Requirements: 要件 2, 1_
  - _Boundary: UIページ_
  - _Depends: 4.1_

- [ ] 4.3 `PatternList` コンポーネントを実装する (P)
  - `apps/candidate/app/mock-interview/_components/PatternList.tsx` を作成する
  - Props: `patterns: AssessmentPattern[]`, `quotaRemaining: number`, `disabled: boolean`, `hasSkillSurvey: boolean`
  - `hasSkillSurvey=true` の場合は上部に「あなたへのおすすめ」セクションとして汎用的なヒント文言を表示する（`response_data` は存在しないため特定パターンの抽出は行わない）
  - カテゴリ別タブまたはセクション表示でパターン一覧を表示する
  - 各パターンカードに `title`・`description`（先頭 80 文字程度）・「このパターンで開始」ボタンを表示する
  - `disabled=true` の場合は全「開始」ボタンを `disabled` 属性で無効化する
  - `createMockInterviewSessionAction` をフォームアクションとして呼び出す
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 2_
  - _Boundary: UIコンポーネント_
  - _Depends: 4.1_

- [ ] 4.4 `QuotaStatus` コンポーネントを実装する (P)
  - `apps/candidate/app/mock-interview/_components/QuotaStatus.tsx` を作成する
  - Props: `remaining: number` (0-3)
  - 「今月の残り回数: X 回」を表示する
  - remaining=0 の場合は警告スタイル（赤系）で「今月の上限に達しました」を表示する
  - _Requirements: 要件 1_
  - _Boundary: UIコンポーネント_

---

- [ ] 5. チャット画面を実装する
  - _Depends: 3.1, 3.2, 1.4_

- [ ] 5.1 チャット画面 Server Component を実装する (P)
  - `apps/candidate/app/mock-interview/[sessionId]/page.tsx`（Server Component）を作成する
  - `requireCandidate()` でガード
  - `getMockInterviewByIdAndOwner` でセッション取得（所有者不一致は `notFound()`）
  - `getAssessmentPatternByCode` でパターン取得
  - `MockInterviewChat` Client Component に `initialSession`・`pattern` を props で渡す
  - `ended_at` が設定済みの場合は `redirect('/mock-interview/[sessionId]/result')` を実行する
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 6, 10_
  - _Boundary: UIページ_

- [ ] 5.2 `MockInterviewChat` Client Component を実装する (P)
  - `apps/candidate/app/mock-interview/[sessionId]/_components/MockInterviewChat.tsx` を作成する（`'use client'`）
  - State: `history: TurnItem[]`, `isLoading: boolean`, `accumulatedUsage: { input_tokens: number, output_tokens: number }`
  - セッション開始時（履歴が空の場合）に `/api/mock-interview/turns/next` を呼び出し最初の質問を取得する
  - テキスト入力欄（Enter 送信、Shift+Enter 改行）と「送信」ボタンを実装する
  - 「面接を終了する」ボタン押下で `/api/mock-interview/finalize` を呼び出し、完了後 `router.push('/mock-interview/[sessionId]/result')` にナビゲートする
  - `isLoading=true` 中は入力欄・送信ボタンを disabled にしてローディングインジケータを表示する
  - 会話ビューはインタビュアー（左）と候補者（右）のバブル形式で表示する
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 3, 4, 10_
  - _Boundary: UIコンポーネント_

---

- [ ] 6. フィードバック結果画面を実装する
  - _Depends: 1.4_

- [ ] 6.1 フィードバック結果画面（Server Component）を実装する
  - `apps/candidate/app/mock-interview/[sessionId]/result/page.tsx` を作成する
  - `requireCandidate()` でガード
  - `getMockInterviewByIdAndOwner` でセッション取得（所有者不一致は `notFound()`）
  - `formative_feedback` が null の場合はローディング表示（`<Suspense>` + revalidate）
  - `formative_feedback` がある場合は 5 次元（真贋・判断力・射程・メタ認知・AI 活用リテラシー）+ 総合所感をセクション表示する
  - パターン名・セッション日時・ターン数を補足情報として表示する
  - 「新しい模擬面接を開始」ボタン/リンク（`href="/mock-interview"`）を表示する
  - `pnpm typecheck` でエラーがないこと
  - _Requirements: 要件 5_
  - _Boundary: UIページ_

---

- [ ] 7. 統合スモークテスト（型チェック・ビルド・手動検証）
  - _Depends: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 6.1_

- [ ] 7.1 `pnpm typecheck` と `pnpm build` が全パッケージ・アプリで通過する
  - `pnpm typecheck` がエラーなし（`packages/db`, `packages/ai/mock`, `apps/candidate` 全て）
  - `pnpm build` が `packages/ai/mock`, `packages/db`, `apps/candidate` でエラーなし
  - _Requirements: 要件 8, 9_

- [ ] 7.2 月次クォータの手動スモークテスト
  - 同一候補者で 3 セッションを開始・終了し、4 回目の「開始」ボタン押下で「今月の上限に達しました（3 回 / 月）」が表示されること
  - パターン選択画面でクォータ残数が 0 になると全「開始」ボタンが無効化されること
  - _Requirements: 要件 1, 2_

- [ ] 7.3 AI チャットフローの手動スモークテスト
  - 57 パターンの中から 1 つを選択してセッションが作成されること
  - チャット画面で回答送信後に AI の次の質問が表示されること
  - 「面接を終了する」押下後にフィードバック結果ページに遷移し、5 次元フィードバックが表示されること
  - _Requirements: 要件 3, 4, 5_

- [ ] 7.4 セッション所有権の手動スモークテスト
  - 別候補者のセッション URL（`/mock-interview/[他人のsessionId]`）に直接アクセスして 404 が返ること
  - 未認証状態で `/mock-interview` にアクセスして `/sign-in` にリダイレクトされること
  - _Requirements: 要件 6_
