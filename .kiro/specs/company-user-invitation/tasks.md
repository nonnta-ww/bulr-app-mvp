# Implementation Plan

> 依存方向 `apps → packages` を厳守。各 mutation は `adminAction`/`authedAction` 経由。認可は各サーバ境界で独立（proxy 非依存）。

## 1. Foundation: スキーマ・共有 enum・エラー基盤

- [x] 1.1 会社ユーザー招待テーブルを新設する
  - `company_user_invitation` を定義（id / company_id / email / role_in_org / token unique / status / invited_by_user_id / expires_at / accepted_at / accepted_by_user_id / created_at / updated_at）
  - `status` は pending / accepted / revoked、token は nanoid 既定値
  - `UNIQUE(company_id, email) WHERE status = 'pending'` の partial unique index を定義
  - スキーマバレルから型とテーブルを公開する
  - 完了状態: 新テーブル定義と `$inferSelect`/`$inferInsert` 型がエクスポートされ、既存 `invitation`（候補者×募集）とは独立して存在する
  - _Requirements: 1.1, 1.3, 2.1, 2.2, 3.3, 6.5_
  - _Boundary: company_user_invitation_

- [x] 1.2 会社にライフサイクルステータス列を追加する
  - `company.status`（active / suspended / terminated、NOT NULL default 'active'）を追加
  - `is_active` は後方互換シャドウとして残置（status 系アクションで同期維持する旨をコメント明記）
  - 完了状態: `company` に `status` 列が存在し、新規行は 'active' で作成される
  - _Requirements: 4.1, 4.6_
  - _Boundary: company.status_

- [x] 1.3 (P) 役割・ステータスの共有 enum を auth に追加する
  - `companyRoleSchema`（role_in_org 用 zod enum）と `companyStatusSchema` を定義
  - server エントリから両 enum と型を re-export する
  - 完了状態: admin / business / guards から同一 enum を import でき、列挙外の値が parse で拒否される
  - _Requirements: 1.7, 4.1_
  - _Boundary: packages/auth schemas_

- [x] 1.4 (P) 認可エラーコードに会社利用停止を追加する
  - `AuthErrorCode` に `COMPANY_INACTIVE` を追加する
  - 完了状態: `new AuthError('COMPANY_INACTIVE')` が型エラーなく生成でき、既存コードと判別可能
  - _Requirements: 5.2, 6.1_
  - _Boundary: packages/auth errors_

- [x] 1.5 マイグレーションを生成・適用する
  - 1.1 / 1.2 の変更から drizzle マイグレーションを生成（DIRECT_URL + DATABASE_URL を inline 指定）
  - 既存 `company` 行の status を backfill（is_active=true→active / false→suspended）
  - 完了状態: ローカル Postgres に適用され、`company_user_invitation` テーブルと `company.status` 列・partial unique index が実在する
  - _Requirements: 1.1, 4.1_
  - _Depends: 1.1, 1.2_
  - _Boundary: packages/db migrations_

## 2. Core: 認可ガード更新

- [x] 2.1 会社ゲートにステータス判定を追加する
  - `requireCompanyUser()` に company 参照を追加し、company_id 無は `COMPANY_NOT_ASSOCIATED`、status≠active は `COMPANY_INACTIVE` を throw
  - 返り値に会社ステータスを含める
  - 完了状態: 未所属・一時停止・解約・有効の各ケースで期待どおりのコード/正常返却に分岐する（単体テストで確認）
  - _Requirements: 4.2, 4.3, 5.2, 6.1, 6.2_
  - _Depends: 1.2, 1.4, 1.5_
  - _Boundary: packages/auth guards_

## 3. Core: admin 招待・メンバー・ステータス管理

- [x] 3.1 招待発行アクションとメールを実装する
  - 入力（company_id / email / role_in_org）を Zod 検証し adminAction でラップ
  - 会社が active であること、宛先メールのユーザーが未所属であること、pending 重複が無いこと（partial unique 違反の検知含む）を確認
  - token と有効期限（7日）を持つ招待を作成し、受諾リンク（BUSINESS_BASE_URL ベース）を含む招待メールを送信
  - 完了状態: active 会社への発行で pending 招待が1件作成されメールが送信され、重複/所属済み/非active は各エラーコードで拒否される
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 6.4_
  - _Depends: 1.1, 1.3, 1.5_
  - _Boundary: apps/admin company invitation actions_

- [x] 3.2 (P) 招待取消アクションを実装する
  - adminAction でラップし、対象招待を pending→revoked に条件付き更新（pending 以外は拒否）
  - 完了状態: 保留中招待が revoked になり以後受諾不可、pending 以外の取消は拒否される
  - _Requirements: 3.3, 3.5, 6.1_
  - _Depends: 1.1_
  - _Boundary: apps/admin company invitation actions_

- [x] 3.3 (P) メンバー解除アクションを実装する
  - adminAction でラップし、対象ユーザーの company_id と role_in_org を NULL に戻す（所属不一致は拒否）
  - 完了状態: 解除後ユーザーは未所属になり、当該ユーザーが作成した既存データ（募集等）は削除されず残る
  - _Requirements: 3.2, 3.4, 3.5, 6.1_
  - _Depends: 1.5_
  - _Boundary: apps/admin company member actions_

- [x] 3.4 (P) 会社ステータス遷移アクションを実装する
  - adminAction でラップし、許可遷移（active→suspended/terminated、suspended→active/terminated、terminated は終端）のみ受け付け、is_active を同期
  - 既存の会社無効化アクションを本アクションへ統合（呼び出し側を差し替え）
  - 完了状態: 一時停止/解約/再有効化が反映され is_active と整合、terminated からの再有効化と不正遷移は拒否される
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7_
  - _Depends: 1.2, 1.3, 1.5_
  - _Boundary: apps/admin company status actions_

- [x] 3.5 (P) 会社メンバー・保留招待の読み取りクエリを追加する
  - 会社の保留中招待一覧と会社ステータスを取得するクエリを追加（メンバー一覧は既存を利用/補強）
  - 完了状態: 会社 ID に対し所属メンバーと pending 招待一覧が取得できる
  - _Requirements: 3.1_
  - _Depends: 1.1, 1.5_
  - _Boundary: packages/db companies-query_

## 4. Core: business 受諾フロー・未所属ページ

- [x] 4.1 (P) 招待受諾の入口ルートを実装する
  - token 形式検証（不正は 404）、受諾トークン cookie を設定（__Secure- 両対応）
  - 未認証はサインインへ、認証済は確認ページへ誘導
  - 完了状態: 招待リンクを開くと token が cookie 化され、認証状態に応じてサインイン/確認ページへ遷移する
  - _Requirements: 2.4, 6.3_
  - _Depends: 1.1_
  - _Boundary: apps/business invitation route_

- [ ] 4.2 受諾確認ページを実装する
  - requireUser でアクセス制御（未所属が正常）、cookie と URL token 一致を検証
  - 招待・会社を取得し、状態（有効/期限/会社ステータス）に応じて受諾可否と理由を表示
  - 完了状態: 有効な招待では会社名・役割と受諾ボタンが表示され、無効/期限切れ/取消済み/非active 会社では理由が表示される
  - _Requirements: 2.3, 2.6_
  - _Depends: 1.1, 1.5_
  - _Boundary: apps/business invitation confirm page_

- [ ] 4.3 受諾アクションで会社紐付けを行う
  - authedAction でラップし、token から招待を取得して status=pending・未期限・会社 active・招待先メールと受諾者メール一致・受諾者未所属を検証
  - transaction 内で招待を pending→accepted に条件付き更新（recheck で競合検知）し、user_profile に company_id と role_in_org を設定
  - 成功時に cookie をクリアし募集一覧へ遷移
  - 完了状態: 受諾で company_id と role_in_org が設定され招待が accepted になり、並行受諾は1回のみ成立、各異常系は対応コードで拒否される
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 6.4_
  - _Depends: 1.1, 1.3_
  - _Boundary: apps/business accept invitation action_

- [ ] 4.4 (P) 未所属・利用停止の専用ページを実装する
  - requireUser でアクセス制御（未認証はサインインへ）
  - user_profile と company から状態を導出し、未所属/一時停止/解約で文言を出し分け、次アクションを提示
  - 完了状態: `/no-company` が認証済みで開け、3状態それぞれに対応する説明が表示される
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - _Depends: 1.5_
  - _Boundary: apps/business no-company page_

## 5. Integration: admin 管理 UI 配線

- [ ] 5.1 会社詳細ページに招待・メンバー・ステータス操作を統合する
  - 招待発行フォーム、保留中招待一覧と取消、メンバー一覧と解除、会社ステータス操作（停止/解約/再有効化）を会社詳細ページへ配線
  - 各操作を 3.1〜3.5 のアクション/クエリに接続し、操作後に再検証（revalidate）
  - 完了状態: admin が会社詳細から招待発行・取消・メンバー解除・ステータス変更を一通り実行でき、結果が一覧に反映される
  - _Requirements: 1.1, 3.1, 3.2, 3.3, 4.2, 4.3, 4.4_
  - _Depends: 3.1, 3.2, 3.3, 3.4, 3.5_
  - _Boundary: apps/admin company detail page_

## 6. Integration: business 会社ゲート配線

- [ ] 6.1 会社ゲート共通ヘルパーを実装する
  - requireCompanyUser を呼び、UNAUTHORIZED/SESSION_EXPIRED→サインイン、COMPANY_NOT_ASSOCIATED/COMPANY_INACTIVE→/no-company にマップするヘルパーを作成
  - 完了状態: ヘルパー呼び出しで company_id が返るか、コードに応じた適切なリダイレクトが行われる
  - _Requirements: 5.1, 5.2, 6.2_
  - _Depends: 2.1_
  - _Boundary: apps/business company-gate helper_

- [ ] 6.2 会社ゲート付きページの分岐を共通ヘルパーへ置換する
  - 募集一覧・募集詳細・エントリー一覧・エントリー詳細・候補者招待ページの catch を requireCompanyGate に置換
  - 完了状態: 未所属/停止ユーザーは `/no-company` に遷移し、`/openings → /sign-in → /interviews` の二段リダイレクトが起きない
  - _Requirements: 5.1, 5.5_
  - _Depends: 6.1, 4.4_
  - _Boundary: apps/business gated pages_

- [ ] 6.3 (P) 未所属ページの UX リダイレクトを proxy に追加する
  - proxy matcher に `/no-company` を追加（Cookie 無→サインイン）、`/invitations/*` は matcher に含めない
  - 完了状態: 未認証で `/no-company` を開くとサインインへ、招待リンクは route handler 側で処理される
  - _Requirements: 5.3, 5.4_
  - _Depends: 4.4_
  - _Boundary: apps/business proxy_

## 7. Validation: テスト

- [ ] 7.1 (P) 認可・enum・遷移の単体テストを追加する
  - 共有 enum の列挙値検証、requireCompanyUser の4分岐、ステータス許可遷移表、requireCompanyGate のコード→リダイレクト対応を検証
  - 完了状態: 各単体テストが green
  - _Requirements: 4.2, 4.3, 4.4, 5.2, 6.1, 6.2_
  - _Depends: 2.1, 3.4, 6.1_
  - _Boundary: unit tests_

- [ ] 7.2 招待発行・受諾・管理の統合テストを追加する
  - 発行（正常/重複/所属済み/非active）、受諾（正常/期限切れ/取消済み/消費済み/メール不一致/非active/並行1回成立）、解除（company_id NULL 化・既存データ残存）、ステータス（停止でメンバー遮断/再有効化で回復/解約後再有効化不可）を検証
  - 完了状態: 各統合テストが green で、受諾後に company_id と role_in_org が永続化される
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 3.2, 3.3, 3.4, 4.2, 4.4, 4.5, 6.4_
  - _Depends: 3.1, 3.2, 3.3, 3.4, 4.3_
  - _Boundary: integration tests_

- [ ] 7.3 主要フローの E2E テストを追加する
  - 未所属ユーザーで募集一覧→/no-company、招待リンク→（サインイン）→確認→受諾→募集一覧到達、一時停止会社メンバー→/no-company を検証
  - 完了状態: 3つの critical path が E2E で green
  - _Requirements: 2.1, 5.1, 5.2_
  - _Depends: 5.1, 6.2_
  - _Boundary: e2e tests_

## Implementation Notes

- 環境: ワークツリーで作業する場合、Node は `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`（既定 node は v15 で pnpm 不可）、git は `/opt/homebrew/bin/git`（`/usr/bin/git` は Xcode シム壊れ）、`.env.local` はメインリポジトリからコピー、`pnpm install` 必須。
- 1.3: `@bulr/auth` にはテストランナーが無かったため vitest インフラ（vitest.config.ts + package.json test script + devDep）を追加した。
- 1.5: `packages/db/src/schema/` に co-located した `*.integration.test.ts` を drizzle-kit がスキーマとして誤読するため、`drizzle.config.ts` の schema glob を `./src/schema/!(*.test|*.integration.test).ts` に変更。drizzle-kit 系は `DIRECT_URL` と `DATABASE_URL` を両方 inline でローカル URL に上書きして実行（env 解決ハマり回避）。DML backfill は generate 対象外なので migration SQL に手動追記。
