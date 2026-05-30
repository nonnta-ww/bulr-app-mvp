# 実装計画 — resume-registration

## タスク一覧

- [ ] 1. 基盤: resume_document スキーマと migration
- [x] 1.1 resume_document テーブルと resumeKind enum の Drizzle スキーマを定義する
  - `packages/db/src/schema/resume-document.ts` を新規作成し、`resumeKind` pgEnum（4値）と `resumeDocument` pgTable を定義する
  - `candidateProfileId` カラムに `candidateProfile.id` への FK を設定する
  - `isPrimary`, `blobUrl`, `blobPathname`, `mimeType`, `sizeBytes`, `originalFilename`, `createdAt`, `uploadedAt` カラムを定義する
  - `ResumeDocument`, `NewResumeDocument`, `ResumeKind` 型をエクスポートする
  - `packages/db/src/schema/index.ts` に `export * from './resume-document'` を追加する
  - `pnpm --filter @bulr/db typecheck` が成功すること
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - _Boundary: ResumeDocumentSchema_
  - _Depends: candidate-auth-onboarding task 3.1_（schema/index.ts は candidate-auth-onboarding が candidate_profile を追加した後に、resume_document の export 行を追記する。ファイル全体を置換せず追記すること。）

- [x] 1.2 drizzle-kit migration を生成して dev DB に適用する
  - `pnpm drizzle-kit generate` を実行して migration ファイル（`*_resume_document.sql`）を生成する
  - `pnpm drizzle-kit push`（dev）を実行して `resume_document` テーブルと `resume_kind` enum が Neon dev ブランチに作成されること
  - `packages/db` ビルドが成功すること（`pnpm --filter @bulr/db build`）
  - _Requirements: 1.2_
  - _Boundary: ResumeDocumentSchema_
  - _Depends: 1.1_

- [x] 1.3 候補者の履歴書一覧クエリと primary 取得クエリを実装する
  - `packages/db/src/queries/resume/get-resume-documents.ts` を新規作成し、`candidate_profile_id` でスコープした `uploaded_at DESC` 一覧を返す関数を実装する
  - `packages/db/src/queries/resume/get-primary-resume-document.ts` を新規作成し、`candidate_profile_id` と `kind` で絞り込んだ `is_primary=true` ドキュメントを返す関数を実装する
  - `packages/db/src/queries/index.ts` に resume クエリの re-export を追加する。queries/index.ts への追加はファイル全体を置換せず追記すること。同ファイルは Wave 2 内で skill-survey も追記する。
  - Wave 3 `entry-flow` がこれらの関数を利用できる公開 API として確認できること（型チェックが通ること）
  - _Requirements: 4.1, 4.2, 10.1, 10.2_
  - _Boundary: GetResumeDocuments, GetPrimaryResumeDocument_
  - _Depends: 1.1_

- [ ] 2. apps/candidate のパッケージ依存追加
- [x] 2.1 @vercel/blob と nanoid を apps/candidate の依存に追加する
  - `apps/candidate/package.json` の `dependencies` に `@vercel/blob: ^0.27.3` と `nanoid: ^5` を追加する
  - `pnpm install` を実行してロックファイルを更新する
  - `turbo.json` の `build.env` に `BLOB_READ_WRITE_TOKEN` が含まれていることを確認する（既存エントリあり、変更不要）
  - `pnpm --filter @bulr/candidate typecheck` が成功すること
  - _Requirements: 9.1, 9.2_
  - _Boundary: apps/candidate package.json_

- [ ] 3. Server Actions の実装
- [x] 3.1 (P) ファイルアップロード Server Action を実装する
  - `apps/candidate/app/resume/_actions/upload-resume.ts` を新規作成する
  - `requireCandidate()` で `candidateProfile.id` を取得し、Zod で file（File 型）と kind（enum 4値）を検証する
  - MIME チェック（pdf / msword / docx / txt）と 10MB サイズ上限チェックをサーバーサイドで実施する
  - `candidates/{candidateProfileId}/resumes/{nanoid()}.{ext}` のパスで `put(path, file, { access: 'private' })` を呼ぶ
  - 同 kind の既存ドキュメント件数に応じて `isPrimary` を決定して `resume_document` を INSERT する
  - 成功時 `{ ok: true, data: { id } }`、失敗時 `{ ok: false, error }` を返すこと
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.2, 8.3, 9.2_
  - _Boundary: UploadResumeAction_
  - _Depends: 1.1, candidate-auth-onboarding task 3.1_

- [ ] 3.2 (P) primary フラグ更新 Server Action を実装する
  - `apps/candidate/app/resume/_actions/set-primary-resume.ts` を新規作成する
  - `requireCandidate()` で所有権確認後、DB トランザクション内で同 `candidate_profile_id` + 同 `kind` の全ドキュメントを `is_primary=false` に UPDATE し、指定ドキュメントを `is_primary=true` に UPDATE する
  - atomic な更新後、対象ドキュメントのみ `is_primary=true` になっていること（他の同 kind は全て false）
  - _Requirements: 6.1, 6.2, 8.1, 8.2, 8.3, 8.4_
  - _Boundary: SetPrimaryResumeAction_
  - _Depends: 1.1, candidate-auth-onboarding task 3.1_

- [ ] 3.3 (P) ドキュメント削除 Server Action を実装する
  - `apps/candidate/app/resume/_actions/delete-resume.ts` を新規作成する
  - `requireCandidate()` と `candidate_profile_id` スコープで所有権確認後、`blob_pathname` を SELECT する
  - `del(blobPathname)` で Blob を削除し、成功後のみ DB の `resume_document` 行を DELETE する
  - Blob 削除失敗時は DB を変更せず `{ ok: false, error: { code: 'BLOB_DELETE_FAILED' } }` を返すこと
  - _Requirements: 2.5, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4_
  - _Boundary: DeleteResumeAction_
  - _Depends: 1.1, candidate-auth-onboarding task 3.1_

- [ ] 3.4 (P) 署名 URL 発行 Server Action を実装する
  - `apps/candidate/app/resume/_actions/get-signed-url.ts` を新規作成する
  - `requireCandidate()` と `candidate_profile_id` スコープで所有権確認後、`blob_pathname` を SELECT する
  - `head(blobPathname, { token: BLOB_READ_WRITE_TOKEN })` を呼び、`downloadUrl` を取得して返す
  - Blob raw URL をクライアントに返さず、`downloadUrl`（TTL 付き）のみを返すこと
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 8.2, 8.3, 8.4_
  - _Boundary: GetSignedUrlAction_
  - _Depends: 1.1, candidate-auth-onboarding task 3.1_

- [ ] 4. クライアントコンポーネントとページの実装
- [ ] 4.1 アップロードフォームのクライアントコンポーネントを実装する
  - `apps/candidate/app/resume/_components/resume-upload-form.tsx` を `'use client'` で新規作成する
  - 4種別の `<select>` と `<input type="file" accept=".pdf,.doc,.docx,.txt">` を持つフォームを実装する
  - クライアント側で 10MB 超のファイルを検出してエラーメッセージを表示する
  - `uploadResumeAction(formData)` を呼び出し、成功後に `router.push('/resume')` でリダイレクトする
  - フォーム送信中はボタンを disabled にして二重送信を防ぐこと
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7_
  - _Boundary: ResumeUploadForm_
  - _Depends: 3.1_

- [ ] 4.2 アップロードページ（Server Component）を実装する
  - `apps/candidate/app/resume/upload/page.tsx` を新規作成する
  - `requireCandidate()` で認証・プロフィール存在確認を行い、未認証 / プロフィール未作成の場合は適切にリダイレクトする
  - `<ResumeUploadForm />` をレンダリングする
  - ページタイトル・見出しが日本語で表示されること
  - _Requirements: 3.7, 8.1, 8.2, 8.3_
  - _Boundary: UploadPage_
  - _Depends: 4.1_

- [ ] 4.3 履歴書一覧のクライアントコンポーネントを実装する
  - `apps/candidate/app/resume/_components/resume-list.tsx` を `'use client'` で新規作成する
  - ドキュメントごとに `original_filename`、`kind`、`is_primary`（「メイン」バッジ）、`uploaded_at`（日本時間・日付）を表示する
  - 「メインにする」ボタンクリックで `setPrimaryResumeAction` を呼び UI を更新する
  - 「プレビュー」ボタンクリックで `getSignedUrlAction` を呼び `window.open(signedUrl, '_blank')` を実行する
  - 「削除」ボタンクリックで確認ダイアログを表示し、確認後に `deleteResumeAction` を呼ぶ
  - ドキュメントが0件の場合は空状態メッセージとアップロードページへのリンクを表示すること
  - _Requirements: 4.1, 4.2, 4.3, 5.1, 6.1, 7.4, 7.5_
  - _Boundary: ResumeList_
  - _Depends: 3.2, 3.3, 3.4_

- [ ] 4.4 履歴書一覧ページ（Server Component）を実装する
  - `apps/candidate/app/resume/page.tsx` を新規作成する
  - `requireCandidate()` で認証・プロフィール存在確認を行い、未認証 / プロフィール未作成の場合は適切にリダイレクトする
  - `getResumeDocuments(candidateProfile.id)` で一覧を取得して `<ResumeList documents={documents} />` に渡す
  - `pnpm --filter @bulr/candidate typecheck` が成功し、`/resume` ページがブラウザで表示されること
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 8.1, 8.2, 8.3_
  - _Boundary: ResumeListPage_
  - _Depends: 1.3, 4.3_

- [ ] 5. 統合確認と smoke test
- [ ] 5.1 アップロード・一覧・primary 管理の統合 smoke test を実施する
  - 候補者としてサインインし `/resume/upload` で PDF をアップロードする → `/resume` に一覧表示されること
  - 同じ種別を2回アップロードする → 1枚目が `is_primary=true`、2枚目が `is_primary=false` であること
  - 2枚目の「メインにする」をクリックする → atomic に primary が切り替わること（DB で確認）
  - _Requirements: 3.1, 3.5, 3.6, 6.1, 6.2_

- [ ] 5.2 署名 URL・削除・アクセス制御の統合 smoke test を実施する
  - 「プレビュー」をクリックする → 新タブで PDF が表示されること
  - Blob の raw URL（`blob_url`）を直接ブラウザに入力する → 403 またはアクセス拒否になること（private access 確認）
  - 「削除」を実行する → DB 行が消え、Blob からも削除されること
  - 未認証でアクセスする → `/sign-in` にリダイレクトされること
  - _Requirements: 2.2, 5.1, 5.2, 7.1, 7.5, 8.1, 8.2, 8.3, 8.5_

- [ ] 5.3 ビルドと型チェックで全 workspace の健全性を確認する
  - `pnpm typecheck` が全 workspace（packages/db, apps/candidate）で成功すること
  - `pnpm build` が packages/db および apps/candidate で成功すること
  - _Requirements: 9.1, 9.2_
