# 要件定義 — resume-registration

## プロジェクト概要（インプット）

候補者が bulr.net 上で「履歴書・職務経歴書・CV・レジュメ」の4種別ドキュメントをアップロード・管理できる機能を構築する。ドキュメントは `candidate_profile` に紐づく候補者所有のポータブル資産として管理され、Vercel Blob（private）に保存する。Wave 3 の `entry-flow` が履歴書スナップショットを参照するための seam を提供するが、本 spec では `entry` エンティティは対象外。既存の Stage 1 Blob 利用（音声ファイル: `interview-turn/...` prefix）と命名空間が衝突しないよう設計する。アクセス制御は `candidate-auth-onboarding` spec が確立する `requireCandidate` ガードを利用する。

## スコープ境界

- **スコープ内**: `resume_document` Drizzle スキーマ＋migration、候補者向けアップロード／一覧／差し替え／削除 UI（`apps/candidate/app/resume/*`）、Vercel Blob 連携（private 保存・署名 URL 発行・命名規約 `candidates/{id}/resumes/{nanoid}.{ext}`）、種別 enum（履歴書 / 職務経歴書 / CV / レジュメ）＋ primary フラグ、サイズ上限・MIME バリデーション、`requireCandidate` ガード経由のアクセス制御
- **スコープ外**: 履歴書テキスト抽出・OCR・AI 解析、`entry` 作成と履歴書スナップショット（Wave 3）、企業側 UI からの閲覧（Wave 3）、スキルアンケート（Wave 2 skill-survey）、履歴書テンプレート生成・diff・バージョン履歴 UI
- **隣接 spec との期待関係**: `candidate-auth-onboarding` が確立する `requireCandidate` ガードと `candidate_profile.id` を必須前提とする。`entry-flow`（Wave 3）が `resume_document.id` を参照するための削除制約 seam を本 spec の design.md で明示する

---

## 要件一覧

### 要件 1: resume_document スキーマと migration

**目的:** 開発者として、`resume_document` テーブルが `packages/db` に定義されていることで、候補者の履歴書データを安全かつ一貫した方法で保存・参照できるようにしたい。

#### 受け入れ基準

1. The db package shall define a `resume_document` table with columns: `id` (nanoid, PK), `candidate_profile_id` (FK to `candidate_profile.id`), `kind` (enum: 履歴書 / 職務経歴書 / CV / レジュメ), `is_primary` (boolean), `blob_url` (text), `blob_pathname` (text), `mime_type` (text), `size_bytes` (integer), `original_filename` (text), `created_at` (timestamp), `uploaded_at` (timestamp).
2. The db package shall generate a Drizzle migration file for the `resume_document` table that can be applied to the Neon Postgres database.
3. The `resume_document.candidate_profile_id` column shall reference `candidate_profile.id`. FK は MVP 段階では `ON DELETE` 句を指定しない（NO ACTION デフォルト）。削除制約の最終決定は Wave 3 `entry-flow` に委ねる。物理削除はアプリ層で Blob 削除後に DB 行を削除する手順で保証する。
4. The db package shall export `resumeDocument` schema, types (`ResumeDocument`, `NewResumeDocument`), and the `resumeKind` enum from the `packages/db` barrel.
5. The `resume_document` table shall be exported from `packages/db/src/schema/index.ts`.

### 要件 2: Vercel Blob 保存と命名規約

**目的:** 開発者として、候補者の履歴書ファイルが `candidates/{candidate_profile_id}/resumes/{nanoid}.{ext}` のプレフィックスで Vercel Blob に private 保存されることで、Stage 1 の音声ファイル（`interview-turn/...` プレフィックス）と命名空間が衝突せず、かつ候補者以外からのアクセスを防げるようにしたい。

#### 受け入れ基準

1. When a candidate uploads a resume file, the resume-registration feature shall store the file in Vercel Blob using the pathname pattern `candidates/{candidate_profile_id}/resumes/{nanoid}.{ext}`, where `{ext}` is derived from the uploaded file's MIME type.
2. The resume-registration feature shall set Vercel Blob access to `private` (not public URL) for all uploaded resume files.
3. The resume-registration feature shall store the `blob_url` and `blob_pathname` returned by the Vercel Blob SDK in the `resume_document` row at upload time.
4. The resume-registration feature shall NOT reuse or collide with the `interview-turn/...` prefix used by Stage 1 audio files.
5. When a candidate deletes a resume document, the resume-registration feature shall delete the corresponding Blob object before removing the `resume_document` row from the database.

### 要件 3: アップロード機能

**目的:** 候補者として、bulr.net/resume/upload で種別を選択してファイルをアップロードすることで、履歴書を bulr に登録し、将来の応募で使い回せるようにしたい。

#### 受け入れ基準

1. When a candidate submits the upload form with a file and a valid `kind`, the resume-registration feature shall upload the file to Vercel Blob, create a `resume_document` row, and redirect to the resume list page.
2. The resume-registration feature shall accept files of MIME types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`.
3. If a candidate submits a file exceeding 10 MB, the resume-registration feature shall reject the upload and display a Japanese-language error message.
4. If a candidate submits a file with an unsupported MIME type, the resume-registration feature shall reject the upload and display a Japanese-language error message.
5. When a candidate uploads a file and no `resume_document` of the same `kind` exists yet, the resume-registration feature shall set `is_primary = true` on the new document.
6. When a candidate uploads a file and a `resume_document` of the same `kind` already exists, the resume-registration feature shall set `is_primary = false` on the new document (explicit primary promotion is done separately).
7. The resume-registration feature shall display a kind selector with the four options: 履歴書 / 職務経歴書 / CV / レジュメ.

### 要件 4: 一覧表示

**目的:** 候補者として、bulr.net/resume で自分がアップロードした全ドキュメントを種別・primary 状態とともに確認できるようにしたい。

#### 受け入れ基準

1. When a candidate visits `/resume`, the resume-registration feature shall display all `resume_document` rows belonging to the candidate's `candidate_profile`, ordered by `uploaded_at` descending.
2. The resume-registration feature shall display for each document: `original_filename`, `kind`, `is_primary` フラグ（「メイン」バッジ等）、`uploaded_at`（日本時間、日付のみ）.
3. While the candidate has no uploaded documents, the resume-registration feature shall display a Japanese-language empty state message and a link to the upload page.
4. The resume-registration feature shall require the candidate to be authenticated with a valid `candidate_profile`; if not, it shall redirect to `/sign-in` or `/onboarding` as appropriate (via `requireCandidate`).

### 要件 5: ドキュメント閲覧（署名 URL）

**目的:** 候補者として、アップロード済みの履歴書を bulr.net 上で安全にプレビューできるようにしたい。ファイルは public URL で公開されず、短期間だけ有効な署名付き URL 経由で表示されたい。

#### 受け入れ基準

1. When a candidate requests to view a resume document, the resume-registration feature shall generate a short-lived signed URL (expiry: 60 seconds) via a server action and redirect the candidate's browser to that URL.
2. The resume-registration feature shall NOT expose the raw Vercel Blob URL to the client; all download/preview access shall be mediated through server-side signed URL generation.
3. If the signed URL generation fails, the resume-registration feature shall display a Japanese-language error message to the candidate.
4. The resume-registration feature shall verify that the `resume_document.candidate_profile_id` matches the authenticated candidate's `candidate_profile.id` before generating a signed URL.

### 要件 6: primary フラグの管理

**目的:** 候補者として、同じ種別の複数バージョンの中から「メインの履歴書」を指定できるようにしたい。それにより、企業側が参照する際に常に最新の主要バージョンが提供される。

#### 受け入れ基準

1. The resume-registration feature shall enforce that at most one `resume_document` per `candidate_profile` per `kind` has `is_primary = true` at any given time.
2. When a candidate promotes a document to primary, the resume-registration feature shall atomically set `is_primary = true` on the target document and `is_primary = false` on all other documents of the same `kind` for the same candidate.
3. When a candidate deletes the only primary document of a given `kind`, the resume-registration feature shall not automatically promote another document to primary (the candidate must explicitly set a new primary).
4. When a candidate deletes a non-primary document, the resume-registration feature shall leave the primary flag of other documents unchanged.

### 要件 7: ドキュメント削除

**目的:** 候補者として、不要になった履歴書ドキュメントを削除できるようにしたい。履歴書は候補者所有の資産であり、削除要求は即座に反映されるべきだ。

#### 受け入れ基準

1. When a candidate confirms deletion of a `resume_document`, the resume-registration feature shall delete the Blob object from Vercel Blob and then delete the `resume_document` row from the database.
2. The resume-registration feature shall verify that the `resume_document.candidate_profile_id` matches the authenticated candidate's `candidate_profile.id` before allowing deletion.
3. If the Blob deletion fails, the resume-registration feature shall not delete the database row and shall display a Japanese-language error message.
4. The resume-registration feature shall display a confirmation dialog before executing deletion.
5. The resume-registration feature shall redirect the candidate to the resume list page after successful deletion.

### 要件 8: アクセス制御

**目的:** 開発者として、履歴書管理の全操作が `requireCandidate` ガードで保護されることで、未認証アクセスや他候補者のデータへのアクセスを防ぎたい。

#### 受け入れ基準

1. The resume-registration feature shall protect all resume routes (`/resume`, `/resume/upload`) and all Server Actions (upload, set-primary, delete, signed-URL) using `requireCandidate` from `@bulr/auth/server`.
2. If the `requireCandidate` guard throws `AuthError('UNAUTHORIZED')`, the resume-registration feature shall redirect to `/sign-in`.
3. If the `requireCandidate` guard throws `AuthError('CANDIDATE_PROFILE_MISSING')`, the resume-registration feature shall redirect to `/onboarding`.
4. The resume-registration feature shall scope all database queries by `candidate_profile_id` matching the authenticated candidate, preventing cross-candidate data access.
5. The resume-registration feature shall use `authedAction` or `candidateAction` wrapper for all Server Actions, following the same multi-layer defense pattern established in `packages/auth`.

### 要件 9: Turborepo ビルド環境変数

**目的:** 開発者として、Vercel Blob に必要な環境変数が Turborepo `build.env` に列挙されていることで、Vercel デプロイ時にビルドへ確実に届くようにしたい。

#### 受け入れ基準

1. The turbo.json `build.env` array shall include `BLOB_READ_WRITE_TOKEN` if not already present, so that the candidate app's resume upload and Blob operations receive the token during Vercel builds.
2. The resume-registration feature shall read `BLOB_READ_WRITE_TOKEN` only in server-side code (Server Actions, API Routes); it shall never be referenced in Client Component code.

### 要件 10: Wave 3 エントリーフロー seam

**目的:** 開発者として、Wave 3 の `entry-flow` が `resume_document.id` をスナップショット参照できるよう、設計上の seam（接合点）が明示されていることで、将来の entry 作成時に履歴書データが取得可能であると確信できるようにしたい。

#### 受け入れ基準

1. The resume-registration feature shall expose a query function (or direct DB schema access) that allows `entry-flow` to retrieve the `is_primary = true` document for a given `candidate_profile_id` and `kind`.
2. The design.md shall document that in Wave 3, when `entry` references `resume_document.id`, deletion of that row must be blocked (FK constraint or application-level guard). In MVP, no such constraint exists because `entry` is out of scope.
