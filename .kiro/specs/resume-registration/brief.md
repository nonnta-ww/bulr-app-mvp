# Brief: resume-registration

## Problem

候補者が「履歴書・職務経歴書・CV・レジュメ」を bulr.net 上に登録・管理できる場所が無い。Wave 3 で `entry`（応募）を作るとき、企業側エントリー一覧画面で候補者の履歴書を確認できる必要があるが、そのデータと UI が無いと entry-flow が成立しない。同時に候補者側にとって履歴書は「一度上げれば複数応募で使い回せる**ポータブル資産**」として機能すべきで、企業に紐づくのではなく `candidate_profile` に紐づく必要がある（roadmap.md §10 データオーナーシップ参照）。

## Current State

- Vercel Blob はインフラとして稼働中（Stage 1 `multi-env-infrastructure` で構築済み）
- `apps/business/app/(interviewer)/interviews/[id]` は音声録音→Whisper 用に Blob を使用しており、SDK 設定パターンの先例がある
- 候補者側に履歴書アップロード UI / `resume_document` テーブルは未実装
- 履歴書は形式が多様（PDF / DOCX / 画像 / プレーンテキストの貼り付け）。MVP では PDF 中心 + 任意の補足テキストとする方針

## Desired Outcome

- 候補者は `bulr.net/resume` で履歴書ドキュメントを 1 枚以上アップロード・差し替え・削除できる
- 各ドキュメントは「種別（履歴書 / 職務経歴書 / CV / レジュメ）」を持ち、`candidate_profile` に 1:N で紐づく
- 候補者は同じ種別を複数バージョン保持できる（最新版を「primary」としてフラグ付け）
- ファイルは Vercel Blob に保存され、署名付き URL での閲覧のみ。ファイルそのものは公開しない
- 将来 Wave 3 で `entry` 作成時、`entry` は「その時点で primary だった `resume_document.id`」をスナップショット参照する seam を提供する
- 既存の Stage 1 Blob 利用箇所（音声）と co-exist できる（命名衝突なし）

## Approach

- **resume_document スキーマ**: `packages/db/src/schema/resume-document.ts` 新設。`candidate_profile_id` FK、`kind`（履歴書 / 職務経歴書 / CV / レジュメ の enum）、`is_primary`、`blob_url`、`blob_pathname`、`mime_type`、`size_bytes`、`original_filename`、`created_at`、`uploaded_at`
- **Blob 命名規約**: `candidates/{candidate_profile_id}/resumes/{nanoid}.{ext}` の access=private prefix。Stage 1 で使う `interviews/...` prefix と衝突しない
- **アップロード UI**: `apps/candidate/app/resume/page.tsx` で一覧、`apps/candidate/app/resume/upload/page.tsx` でアップロード（種別選択 + ファイル選択）。クライアントから Server Action 経由で Vercel Blob にアップロード
- **署名 URL**: 閲覧時は server action で `@vercel/blob` の `head()` / 必要なら短期 signed URL を発行。Blob 自体は private 設定
- **primary フラグ**: 同じ `kind` で `is_primary=true` は最大 1 件。新規アップロード時にデフォルト primary、明示的にトグル可能
- **削除**: 論理削除でなく Blob + DB ともに物理削除（履歴書は候補者所有資産で、所有者の削除要求は即時通すべき）。ただし Wave 3 の `entry` がスナップショット参照しているドキュメントは削除不可（FK 制約 or 業務制約）。本 spec ではまだ `entry` が無いので「削除可」だが、将来の制約を design.md で明示
- **L1 棚卸し結果との関係**: スキルアンケートの表示は [[skill-survey]] 担当。本 spec は履歴書のみ
- **package layer 配置**: ファイル種別 enum / Blob 操作ヘルパは `packages/lib` に置くか `apps/candidate` 内に置くか design.md で決める（apps → packages 単方向の原則を守る）

## Scope

- **In**:
  - `resume_document` Drizzle スキーマ + マイグレーション
  - 候補者所有のアップロード／一覧／差し替え／削除 UI（`apps/candidate/app/resume/*`）
  - Vercel Blob 連携（private 保存・署名 URL 発行・命名規約）
  - 種別 enum（履歴書 / 職務経歴書 / CV / レジュメ）+ primary フラグ
  - サイズ上限・MIME バリデーション（PDF / 一般ドキュメント形式中心）
  - `requireCandidate` ガード経由のアクセス制御（[[candidate-auth-onboarding]] 依存）
- **Out**:
  - 履歴書のテキスト抽出・パース・構造化（将来の AI 解析は後続）
  - 履歴書ベースの自動レコメンド / 検索（スカウト層は Wave 5+）
  - `entry` への履歴書スナップショット参照（Wave 3 [[entry-flow]]）
  - 企業側 UI からの履歴書閲覧（Wave 3 [[entry-flow]]）
  - 履歴書の OCR / 画像処理
  - スキルアンケート（Wave 2 [[skill-survey]]）
  - 履歴書テンプレート生成・履歴書フォーマット作成支援

## Boundary Candidates

- `resume_document` スキーマ（DB layer）
- Vercel Blob ストレージアクセス層（命名規約 / 署名 URL / アップロード関数）
- 候補者向け履歴書管理 UI（list / upload / detail / delete）
- 種別 enum + primary フラグのバリデーション
- ファイルバリデーション（MIME / サイズ）

## Out of Boundary

- 履歴書の AI 解析・テキスト抽出
- スキルアンケート（[[skill-survey]]）
- `entry` 作成と履歴書スナップショット参照（Wave 3 [[entry-flow]]）
- 企業側 UI（Wave 3 [[entry-flow]] が `entry` 経由で閲覧 UI を持つ）
- 履歴書のバージョン管理 UI（diff / 履歴）— 本 MVP では「新規アップロードで差し替え」のみ

## Upstream / Downstream

- **Upstream**:
  - [[candidate-auth-onboarding]] — `candidate_profile.id` と `requireCandidate` を必須前提
  - Stage 1 `multi-env-infrastructure` — Vercel Blob の env / SDK が利用可能であること
- **Downstream**:
  - [[entry-flow]]（Wave 3）— `entry` が `resume_document.id` をスナップショット参照
  - `apps/business` のエントリー一覧画面（Wave 3）— 署名 URL 経由で履歴書を閲覧

## Existing Spec Touchpoints

- **Extends**: なし（新規エンティティ）
- **Adjacent**:
  - [[candidate-auth-onboarding]] — `candidate_profile` を共同所有
  - [[skill-survey]] — `candidate_profile` を共同所有、独立データ
  - Stage 1 `assessment-engine` — `interview_session` の音声 Blob 利用先例（命名規約衝突に注意）
  - Wave 3 [[entry-flow]] — 履歴書スナップショット参照の seam

## Constraints

- Vercel Blob を使う（roadmap.md / 設計メモ §4 で確定）
- 「将来像は見据えるが、実装は最小」原則（roadmap.md §Stage 2 制約）
- 履歴書は候補者所有資産。企業側からの強制削除・編集はしない
- Vercel Blob リソース作成系コマンドが `.env.local` を暗黙上書きするため運用時注意（参照: `feedback_vercel_cli_env_pull_overwrite.md`）
- Turborepo `build.env` に `BLOB_READ_WRITE_TOKEN` 等を列挙する必要あり（参照: `feedback_turborepo_env_passthrough.md`）
- packages → apps の依存方向は単方向（参照: `feedback_package_dependency_direction.md`）
- 日本語 UI / 日本語ラベルのみ
