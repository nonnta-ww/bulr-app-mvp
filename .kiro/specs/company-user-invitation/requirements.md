# Requirements Document

## Project Description (Input)

企業ユーザーを会社に招待・紐付けるフローを追加する。

### 背景

現状 admin で会社作成（`apps/admin/app/companies/_actions/create-company.ts`）と会社メンバー（面接官）一覧の表示（`apps/admin/app/companies/[id]/page.tsx`、読み取りのみ）はできるが、企業ユーザー(`user_profile`)を会社(`company`)に紐付ける = `user_profile.company_id` を設定する経路がソースに一切存在しない。better-auth サインアップフック（`packages/auth/src/server.ts` の `databaseHooks.user.create.after`）は `user_profile` を `userId` + `displayName` のみで作成し `company_id` は NULL のまま。

そのため全企業ユーザーが `requireCompanyUser()`（`packages/auth/src/guards.ts`）で `COMPANY_NOT_ASSOCIATED` となり、`/openings` 等の会社ゲート付き business ページに入れず、唯一通る `/interviews`（`requireUser` のみ）へ二段リダイレクト（`/openings` → `/sign-in` → `/interviews`）される。現状の紐付けは手動 DB 編集でしか不可能。

### 確定した方針（要件化の前提）

1. **招待方式**: admin がメール宛にトークンを発行 → 企業ユーザーがリンクから受諾 → `user_profile.company_id` を設定する「招待トークン受諾フロー」を採用（候補者側 `apps/candidate/app/invitations/[token]/confirm` を参考実装とする）。
2. **会社ステータス管理**: 会社に「有効 / 一時停止 / 解約」のステータスを持たせ、一時停止と解約を区別して管理する。どちらも会社ゲート機能は利用不可だが、状態として分離する。解約後のデータ削除請求対応は今回スコープ外だが、終端状態として識別できるよう設計上考慮する。
3. **未所属 UX**: `COMPANY_NOT_ASSOCIATED` の場合に `/sign-in` へ飛ばさず、専用ページ `/no-company` で状況を明示する。
4. **役割設定**: 招待発行・受諾時に組織内の役割（`role_in_org`）を設定する。

## Introduction

本機能は、企業ユーザー（面接官）を会社に紐付ける唯一の正規経路を新設する。管理者（admin）が宛先メールと役割を指定して招待を発行し、招待を受けた企業ユーザーがリンクから受諾することで `user_profile.company_id` と `role_in_org` が設定される。あわせて、会社のライフサイクル（有効・一時停止・解約）をステータスとして管理し、未所属または利用停止中の企業ユーザーには `/no-company` で状況を明示する。認可は各サーバ境界（Server Component / Server Action）で独立に成立させ、proxy/middleware に依存しない（CVE-2025-29927 の教訓）。

## Boundary Context

- **In scope**:
  - admin による会社ユーザー招待の発行・取り消し
  - 招待トークンの受諾による `user_profile.company_id` と `role_in_org` の設定
  - admin による会社メンバー一覧・保留中招待一覧の表示、メンバーの会社からの解除
  - 会社ステータス（有効 / 一時停止 / 解約）の管理と、それに伴う会社ゲート機能の有効・無効化
  - 未所属および利用停止中の企業ユーザー向け専用ページ `/no-company`
  - 各サーバ境界での独立した認可（admin 操作・会社ゲート）
- **Out of scope**:
  - 解約後のデータ削除（消去）フロー（終端状態としての識別のみ確保し、実際の削除は別 spec）
  - 1 ユーザーが複数会社に所属するマルチテナント（1 ユーザー : 1 会社を維持）
  - 既存の候補者×募集向け `invitation` テーブル/フローの変更（企業ユーザー招待は別概念として分離）
  - 企業ユーザー自身による他ユーザーの招待（発行は admin のみ）
  - better-auth サインアップ時に会社を自動決定する仕組み（profile は従来どおり `company_id` NULL で作成）
- **Adjacent expectations**:
  - 招待メール送信は既存の magic-link メール基盤（`sendEmail` / Resend・Mailpit）を再利用する
  - better-auth サインアップフックは変更せず、`company_id` は招待受諾を通じてのみ設定される
  - business の会社ゲート（`requireCompanyUser()`）は、未所属だけでなく所属会社のステータスも判定対象に含める

## Requirements

### Requirement 1: 会社ユーザー招待の発行（admin）

**Objective:** 管理者として、会社にメールアドレスと役割を指定して企業ユーザーを招待したい。それにより、手動 DB 編集なしで企業ユーザーを会社に紐付けられるようにするため。

#### Acceptance Criteria

1. When 管理者が会社・宛先メールアドレス・役割を指定して招待を発行したとき、the 招待管理機能 shall 推測困難な一意トークンと有効期限を持つ招待レコードを保留中(pending)状態で作成する。
2. When 招待レコードが作成されたとき、the 招待管理機能 shall 受諾用リンクを含む招待メールを宛先メールアドレスへ送信する。
3. If 同一会社・同一メールアドレスに対して保留中(pending)の招待が既に存在する場合、then the 招待管理機能 shall 新規招待を重複作成せず、既存の保留中招待がある旨をエラーとして返す。
4. If 指定したメールアドレスのユーザーが既にいずれかの会社に所属している場合、then the 招待管理機能 shall 招待を発行せず、所属済みである旨をエラーとして返す。
5. While 対象会社のステータスが一時停止または解約の場合、the 招待管理機能 shall 招待の発行を拒否する。
6. The 招待管理機能 shall 招待発行操作の実行前に管理者認可（admin）を検証し、認可されない要求を拒否する。
7. The 招待管理機能 shall 役割(role_in_org)を事前に定義された固定の列挙値に限定し、列挙外の値を拒否する。

### Requirement 2: 招待の受諾と会社への紐付け（企業ユーザー）

**Objective:** 招待された企業ユーザーとして、招待リンクから受諾したい。それにより、自分のアカウントが会社に紐付き、会社ゲート付き機能を利用できるようにするため。

#### Acceptance Criteria

1. When 受諾者が有効な招待トークンのリンクを開き受諾を確定したとき、the 招待管理機能 shall 受諾者の `user_profile.company_id` を招待の会社に、`role_in_org` を招待時に指定された役割に設定する。
2. When 受諾が成立したとき、the 招待管理機能 shall 当該招待を受諾済み(accepted/consumed)状態に更新し、以後の再受諾を不可にする。
3. If 招待トークンが無効・有効期限切れ・取り消し済み・受諾済みのいずれかである場合、then the 招待管理機能 shall 受諾を拒否し、理由を受諾者に表示する。
4. If 受諾者が未サインインの場合、then the 招待管理機能 shall magic-link サインインへ誘導し、認証完了後に同一招待の受諾フローを継続できるようにする。
5. If 受諾者が既にいずれかの会社に所属している場合、then the 招待管理機能 shall 受諾を拒否し、1 ユーザー 1 会社の制約に反する旨を表示する。
6. While 招待の会社のステータスが一時停止または解約の場合、the 招待管理機能 shall 受諾を拒否する。
7. While 同一招待に対する受諾要求が並行して発生した場合、the 招待管理機能 shall 1 回のみ受諾を成立させ、二重の紐付けや二重消費を防ぐ。

### Requirement 3: 会社メンバーと招待の管理（admin）

**Objective:** 管理者として、会社の所属メンバーと保留中の招待を確認し、メンバーの解除や招待の取り消しを行いたい。それにより、会社の構成を正規の手段で維持・是正できるようにするため。

#### Acceptance Criteria

1. The 会社管理機能 shall 対象会社に所属する企業ユーザー（メンバー）一覧と、保留中(pending)の招待一覧を管理者に表示する。
2. When 管理者がメンバーを会社から解除したとき、the 会社管理機能 shall 当該ユーザーの `user_profile.company_id` を未設定(NULL)に戻す。
3. When 管理者が保留中の招待を取り消したとき、the 招待管理機能 shall 当該招待を取消済み(revoked)状態に更新し、以後の受諾を不可にする。
4. When メンバーが会社から解除されたとき、the 会社管理機能 shall 当該ユーザーが作成済みの既存データ（募集等）を削除せず会社に保持する。
5. The 会社管理機能 shall メンバー解除および招待取り消し操作の実行前に管理者認可（admin）を検証し、認可されない要求を拒否する。

### Requirement 4: 会社ステータスの管理

**Objective:** 管理者として、会社を「有効 / 一時停止 / 解約」のステータスで管理したい。それにより、利用停止の理由（一時的か恒久的か）を区別して扱い、解約後のデータ取り扱いの判断につなげられるようにするため。

#### Acceptance Criteria

1. The 会社管理機能 shall 各会社に「有効(active) / 一時停止(suspended) / 解約(terminated)」のいずれかのステータスを保持する。
2. When 管理者が会社を一時停止したとき、the 会社管理機能 shall ステータスを一時停止(suspended)に更新し、当該会社メンバーの会社ゲート付き機能へのアクセスを停止する。
3. When 管理者が会社を解約したとき、the 会社管理機能 shall ステータスを解約(terminated)に更新し、当該会社メンバーの会社ゲート付き機能へのアクセスを停止する。
4. When 管理者が一時停止中の会社を再有効化したとき、the 会社管理機能 shall ステータスを有効(active)に戻し、当該会社メンバーのアクセスを回復する。
5. While 会社のステータスが一時停止または解約の場合、the 招待管理機能 shall 当該会社に対する新規招待の発行および受諾を拒否する。
6. The 会社管理機能 shall 解約(terminated)を将来のデータ削除請求の対象として識別可能な終端状態として保持する（実際の削除処理は本機能のスコープ外）。
7. The 会社管理機能 shall 会社ステータス変更操作の実行前に管理者認可（admin）を検証し、認可されない要求を拒否する。

### Requirement 5: 未所属・利用停止中の企業ユーザー向け UX（business）

**Objective:** 会社に未所属、または所属会社が利用停止中の企業ユーザーとして、混乱するリダイレクトではなく状況の明確な説明を見たい。それにより、自分が何をすべきか（招待を待つ等）を理解できるようにするため。

#### Acceptance Criteria

1. When 会社に未所属(`company_id` 未設定)の企業ユーザーが会社ゲート付きページ（`/openings` 等）にアクセスしたとき、the business アプリ shall `/sign-in` や `/interviews` へ誘導せず、専用ページ `/no-company` で「会社未所属」の状況を明示する。
2. When 所属会社のステータスが一時停止または解約の企業ユーザーが会社ゲート付きページにアクセスしたとき、the business アプリ shall `/no-company` で利用停止中である状況を明示する。
3. The business アプリ shall `/no-company` ページを認証済み（`requireUser()` 成立）の企業ユーザーが閲覧できるようにする。
4. If 未認証ユーザーが `/no-company` にアクセスした場合、then the business アプリ shall `/sign-in` へ誘導する。
5. While 企業ユーザーが会社に所属しステータスが有効な場合、the business アプリ shall 会社ゲート付きページへのアクセスを従来どおり許可する。

### Requirement 6: 認可境界とトークン安全性（横断）

**Objective:** システムとして、招待・紐付け・ステータス変更の各操作を各サーバ境界で独立に認可し、トークンを安全に扱いたい。それにより、middleware バイパス等で認可を回避されないようにするため。

#### Acceptance Criteria

1. The システム shall 招待発行・招待取り消し・メンバー解除・会社ステータス変更の各 Server Action / Server Component で、それぞれ独立に管理者認可を検証する。
2. The システム shall 会社ゲートの認可を proxy/middleware ではなく Server Component / Server Action 側で成立させ、proxy/middleware を認可の唯一の根拠にしない。
3. The 招待管理機能 shall 招待トークンに対し、形式検証・有効期限・単回消費（受諾済み/取消済みは再利用不可）を適用する。
4. The システム shall 招待発行・受諾・メンバー管理・ステータス変更で受け取る全外部入力（メールアドレス・トークン・役割・会社識別子）を検証し、不正な入力を拒否する。
5. The システム shall 企業ユーザー招待を、候補者×募集向けの既存 `invitation` とは分離した専用のデータ構造で管理する。
