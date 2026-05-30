# Brief: entry-flow

## Problem

Wave 3 `company-and-opening` で募集 (opening) と招待 (invitation) が作れるようになるが、**候補者がそれに対してエントリーする経路、企業側がそれを受け取って確認する経路がまだ存在しない**。

具体的には:
1. candidate-auth-onboarding 7.1 は invitation 受け取り口 (`/invitations/[token]`) を持つが、`pending_invitation_token` cookie に保存するだけで、その先 `entry` を作成する経路がない
2. 候補者が「自分がどの企業にエントリー済みか」を確認する画面がない (`/entries` 未存在)
3. 企業側がエントリー一覧 (履歴書 + スキルアンケート結果を確認) する画面がない (`apps/business` 側未存在)
4. resume_document と skill_survey_response は entry スナップショット参照の seam (`getPrimaryResumeDocument` / `getLatestResponseByCandidateProfileId`) を Wave 2 で公開済みだが、これを消費する `entry` エンティティが無い

本 spec は **Wave 3 の中核**: 候補者所有資産 (履歴書 + スキルアンケート) と企業所有資産 (opening + invitation) を `entry` でつなぐ。

## Current State

- candidate-auth-onboarding 7.1: `apps/candidate/app/invitations/[token]/page.tsx` が token を `pending_invitation_token` cookie (HttpOnly, Max-Age 3600) に保存 → `/onboarding` または `/` redirect。token 検証・entry 作成は本 spec
- resume-registration 1.3: `getPrimaryResumeDocument(candidateProfileId, kind)` を `@bulr/db` バレル経由で公開済み (Wave 3 seam として明示設計)
- skill-survey 4.1: `getLatestResponseByCandidateProfileId(candidateProfileId, surveyId)` + `SkillSurveyResponseWithAnswers` 型を公開済み (Wave 3 seam)
- `apps/business` には `/openings/[openingId]/entries` 相当のページ未存在 (company-and-opening の brief で「entries 一覧プレースホルダ」とだけ予告)
- `apps/candidate` には `/entries` ルート未存在

## Desired Outcome

- 候補者が招待リンクからサインイン後、`pending_invitation_token` cookie を消費して **エントリー確認画面 → 確定** のフローを完了できる
- 確定時に `entry` 行が作成され、resume_document (primary の id) と skill_survey_response (id) のスナップショット参照を保持する
- 候補者は `bulr.net/entries` で自分のエントリー一覧 (企業名 / 募集名 / エントリー日 / ステータス) を確認できる
- 企業ユーザーは `bz.bulr.net/openings/{openingId}/entries` でエントリー一覧を見て、各候補者の履歴書 (署名 URL 経由) + スキルアンケート結果を確認できる
- `invitation.consumed_at` がエントリー時に設定され、同じ招待リンクの再利用を防ぐ (or 同一候補者の再エントリーを許容するかは要決定)
- Wave 3 `session-from-entry` から `entry.id` を入力に `interview_session` を作成できる seam を提供

## Approach

- **entry スキーマ** (`packages/db/src/schema/entry.ts`):
  - `id` text nanoid PK
  - `candidate_profile_id` FK
  - `opening_id` FK
  - `invitation_id` FK (どの招待リンク経由で作られたか)
  - `resume_document_id` FK nullable (エントリー時点の primary resume へのスナップショット参照、後で resume が変更されても entry はこの ID を保持)
  - `skill_survey_response_id` FK nullable (アンケート未回答でもエントリー可能とするか、必須とするかは design.md で確定。MVP は nullable で柔軟に)
  - `status` enum ('submitted' | 'reviewed' | 'rejected' | 'progressing') — submitted=候補者確定直後、reviewed=企業が確認済み、progressing=面接セッション作成済み
  - `created_at` / `updated_at`
  - `UNIQUE(candidate_profile_id, opening_id)` で同一候補者の同一募集への重複エントリーを防止
- **候補者側エントリー動線**:
  - サインイン直後の middleware/server-side で `pending_invitation_token` cookie を検出 → `/invitations/[token]/confirm` のような確認画面に誘導 (or 直接エントリー処理)
  - 確認画面 (`apps/candidate/app/invitations/[token]/confirm/page.tsx`): 招待元の opening 情報 (会社名 / 募集名) を表示、候補者が「primary 履歴書」「最新スキルアンケート回答」を確認、確定ボタンクリックで `createEntry` Server Action 実行
  - エントリー一覧 (`apps/candidate/app/entries/page.tsx`): 候補者自身のエントリー一覧 (会社名・募集名・エントリー日・ステータス)
- **企業側エントリー一覧**:
  - `apps/business/app/(interviewer)/openings/[openingId]/entries/page.tsx`: entry 一覧表 (候補者名・エントリー日・履歴書プレビューリンク・スキルアンケート結果リンク・面接セッション作成ボタン)
  - `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/page.tsx`: entry 詳細 (候補者プロフィール + 履歴書 (apps/business 側用の署名 URL) + スキルアンケート結果)
- **invitation 消費ロジック**: `entry` 作成 transaction で `invitation.consumed_at = now()` を更新。`consumed_at IS NOT NULL` の invitation は候補者側で `/invitations/[token]` 経路で「使用済みです」表示
- **resume_document_id / skill_survey_response_id スナップショット**:
  - 作成時点: `getPrimaryResumeDocument(candidateProfileId, '履歴書')` で取得した row の id を `entry.resume_document_id` に保存。同様に `getLatestResponseByCandidateProfileId` で取得した response.id を保存
  - resume が後で「primary 切り替え」されても entry は古い ID を参照し続ける (Wave 5+ で「最新版を見る」UI が必要なら別途実装)
  - resume 削除制約: 本 spec で `entry.resume_document_id` が FK で参照するため、`resume_document` の `ON DELETE` を再評価する必要あり。MVP は `ON DELETE SET NULL` (entry は残るが履歴書スナップショット参照は失われる) を採用
- **企業側の履歴書閲覧 (signed URL)**: resume-registration 3.4 は candidate-owned の getSignedUrlAction だが、企業ユーザー側からも署名 URL が必要。`getResumeSignedUrlForBusiness(entryId, requestingUserId)` のような新規 Server Action を `apps/business` 側に作成し、`entry.opening_id → opening.company_id === user_profile.company_id` で所有権検証

## Scope

- **In**:
  - `entry` Drizzle スキーマ + migration (UNIQUE 制約 + status enum + 5 FK)
  - `resume_document.ON DELETE` 制約の更新 (NO ACTION → SET NULL on entry's FK to resume)
  - 候補者側エントリー確認画面 (`/invitations/[token]/confirm`)
  - 候補者側エントリー一覧 (`/entries`)
  - 企業側エントリー一覧 (`/openings/[id]/entries`)
  - 企業側エントリー詳細 (`/openings/[id]/entries/[entryId]`)
  - `createEntry` Server Action (token 検証 + invitation consume + entry INSERT + snapshot 参照保存)
  - `getResumeSignedUrlForBusiness` Server Action (apps/business 側、所有権検証)
  - 候補者向け queries: `getEntriesByCandidateProfileId`
  - 企業向け queries: `getEntriesByOpeningId` + `getEntryWithSnapshots`
- **Out**:
  - 面接セッション作成 (Wave 3 [[session-from-entry]])
  - エントリーの拒否・進捗管理ワークフロー (MVP は status の手動更新のみ)
  - 候補者がエントリーを取り消す機能 (Wave 5+)
  - エントリー時の追加情報入力 (志望動機等) — 単純な「履歴書 + アンケートでエントリー」のみ
  - スカウト機能 (Wave 5+)
  - エントリー通知メール (企業ユーザーへ) (MVP は UI 確認のみ)
  - L4 模擬面接結果のエントリー紐付け (Wave 4 [[mock-interview]])

## Boundary Candidates

- entry スキーマ (DB layer + UNIQUE + status enum + 5 FK)
- resume_document の ON DELETE 制約更新 (resume-registration への back-edit)
- 候補者側エントリー動線 (confirm + 一覧)
- 企業側エントリー UI (一覧 + 詳細)
- createEntry Server Action (transaction + invitation consume + snapshot)
- 企業向け署名 URL 発行 Server Action (所有権検証)
- entries 読み出し queries (候補者用 + 企業用)

## Out of Boundary

- 面接セッション作成 → [[session-from-entry]]
- 招待トークン発行 → [[company-and-opening]]
- 履歴書アップロード / 削除 → [[resume-registration]] (本 spec は resume-document.id をスナップショット参照するのみ)
- スキルアンケート回答 → [[skill-survey]]
- 候補者プロフィール編集 → [[candidate-auth-onboarding]]
- L4 模擬面接 → Wave 4 [[mock-interview]]

## Upstream / Downstream

- **Upstream**:
  - [[company-and-opening]] (Wave 3) — `opening` / `invitation` を作る
  - [[resume-registration]] (Wave 2) — `getPrimaryResumeDocument` + `resume_document.id`
  - [[skill-survey]] (Wave 2) — `getLatestResponseByCandidateProfileId` + `skill_survey_response.id`
  - [[candidate-auth-onboarding]] (Wave 2) — `pending_invitation_token` cookie + `candidate_profile`
- **Downstream**:
  - [[session-from-entry]] (Wave 3) — `entry.id` を入力に `interview_session` を作成
  - Wave 4 [[mock-interview]] — 直接の依存はないが、entry がある候補者向けに L4 を勧めるレコメンドが将来可能
  - Wave 4 [[admin-operations]] — 運営 admin が全 entry の状況を俯瞰

## Existing Spec Touchpoints

- **Extends**:
  - [[resume-registration]] — `resume_document` の `ON DELETE` 制約を NO ACTION → entry の FK 側で SET NULL に変更 (本 spec が制約変更を担当)
- **Adjacent**:
  - [[candidate-auth-onboarding]] — invitation 受け取り後の確認画面動線を本 spec が引き継ぐ
  - [[company-and-opening]] — invitation.consumed_at を本 spec が更新する seam を持つ
  - Stage 1 [[assessment-engine]] — `interview_session.candidate_id` の `entry_id` 化は次の [[session-from-entry]] で実施。本 spec では触らない

## Constraints

- 既存 monorepo + Drizzle Postgres を継続
- 日本語 UI
- 「将来像は見据えるが実装は最小」(roadmap.md §Stage 2 制約)
- packages → apps の単方向依存 (`feedback_package_dependency_direction.md`)
- Drizzle timestamp は `{ withTimezone: true }` で統一
- drizzle-kit push は inline env override (`feedback_drizzle_kit_env_resolution.md`)
- 企業側の所有権検証は多層 (proxy で軽くチェック + Server Action / Server Component で必ず再検証、CVE-2025-29927 対策)
- 候補者の resume / survey スナップショット参照: 削除耐性 (`ON DELETE SET NULL`) を持たせ、entry 自体は残るようにする
- entry 重複防止: `UNIQUE(candidate_profile_id, opening_id)` で同一候補者の同一募集への複数エントリーを DB 制約レベルで弾く (Wave 5+ で再エントリーを許容したくなったら制約緩和)
- token consume の race condition: 同時クリックでも片方しか成功しないよう、entry INSERT + invitation update を同一 transaction で実施 + invitation の `consumed_at IS NULL` を WHERE 句で確認 (or `SELECT ... FOR UPDATE` 相当)
