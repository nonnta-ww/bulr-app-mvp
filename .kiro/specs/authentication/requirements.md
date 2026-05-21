# Requirements Document

## Introduction

bulr Stage 1 MVP プロトタイプ（AI 面接アシスタント型）における **2 種類の認証境界** を確立するスペック。`monorepo-foundation` で構築された apps/web スケルトンと、`multi-env-infrastructure` で整備された環境変数規約（`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `RESEND_API_KEY` / `ADMIN_ALLOWED_EMAILS`）の上に、Better Auth 1.6.x + Magic Link で **面接官（interviewer = user）** 認証を実装し、`ADMIN_ALLOWED_EMAILS` 許可メール検査で **創業者（admin）** 認証を実装する。

v2 移行に伴い、v1 仕様で「受験者（candidate）」が認証主体だった構造から、**面接官が認証主体に変わる**。候補者は bulr に直接ログインしない（候補者情報は面接官が新規セッション作成時に入力する、`assessment-engine` spec の責務）。本スペックの `user_profile` テーブルは v1 では受験者プロファイルだったが、v2 では **面接官プロファイル**（display_name / role_in_org / years_of_experience? 等）を保持する意味に変更されている。

本スペックは多層防御（CVE-2025-29927 教訓）に基づき、`proxy.ts`（Next.js 16 で middleware.ts から rename）は **UX リダイレクトのみ** の責務とし、セキュリティ判定は Server Component / Server Action / API Route の各レイヤーで独立にチェックする。Magic Link のレート制限は DB ベースの共通 `rate_limit` テーブルを使用し、`assessment-engine` spec も再利用する想定（key prefix で `email:` / `ip:` / `session:` / `chat:` を区別）。Better Auth 管理テーブル（`user` / `session` / `account` / `verification`）には独自カラムを追加せず、bulr 固有の面接官データは `user_profile` テーブルで `user_id` FK 1:1 参照し、Better Auth の `databaseHooks.user.create.after` で自動作成する。

## Boundary Context

- **In scope**:
  - Better Auth 1.6.x サーバー設定（`apps/web/lib/auth/server.ts`）+ クライアント設定（`apps/web/lib/auth/client.ts`）
  - Magic Link プラグイン設定（有効期限 15 分、使い切り、HttpOnly + Secure + SameSite=Lax cookies）
  - Resend 統合（`apps/web/lib/email/resend.ts`）と Magic Link メールテンプレート（日本語 + 英語並記、面接官向け、Stage 1 は Resend テストドメイン `onboarding@resend.dev` を `from` に使用）
  - Better Auth API ルート（`apps/web/app/api/auth/[...all]/route.ts`）
  - 面接官サインイン UI（`apps/web/app/(interviewer)/sign-in/page.tsx`、メール入力フォーム + 送信完了表示）
  - 管理画面ログイン UI（`apps/web/app/admin/login/page.tsx`、Magic Link サインイン案内）
  - `proxy.ts`（旧 middleware.ts、`apps/web/proxy.ts`）: 面接官 UX リダイレクト（`/interviews/*` 未認証時に `/sign-in` へ）。`/admin/*` は対象外とし、認可は Server Component の `requireAdmin()` が独立に行う。JSDoc に CVE-2025-29927 の教訓と「セキュリティ責任は持たない」旨を明記
  - 認証ヘルパー（`apps/web/lib/guards.ts`）: `requireUser()` / `getCurrentUser()` / `requireAdmin()` / `requireSessionOwnership(session, userId)` / `AuthError` クラス
  - Server Action ラッパー（`apps/web/lib/safe-action.ts`）: `authedAction(schema, handler)` / `adminAction(schema, handler)`、サードパーティライブラリ（next-safe-action 等）は導入せず自前で軽量実装
  - DB スキーマ:
    - Better Auth 管理テーブル（`user` / `session` / `account` / `verification`）を `packages/db/src/schema/auth.ts` に定義（独自カラム追加なし）
    - `user_profile` テーブル（`packages/db/src/schema/user-profile.ts`）: `user_id` FK 1:1、`display_name` / `role_in_org` / `years_of_experience?` / `created_at` / `updated_at`
    - `rate_limit` テーブル（`packages/db/src/schema/rate-limit.ts`）: 共通テーブル、`key text PK`、`count int`、`window_start timestamp`、key prefix で `email:` / `ip:` / `session:` / `chat:` を区別
  - Drizzle migration ファイル生成（dev branch には push、production には generate + migrate、ファイル名は `packages/db/drizzle/*_authentication.sql` の glob で参照、番号はハードコードしない）
  - Better Auth `databaseHooks.user.create.after` で `user_profile` レコードを自動作成（display_name は user.email のローカル部、後続で編集可能）
  - Magic Link レート制限: メールあたり 3 回/5 分、IP ベース 20 回/時、`rate_limit` テーブルに `INSERT ... ON CONFLICT DO UPDATE` で記録（Vercel Functions のメモリ非共有のため in-memory 不可）
  - Zod 入力検証: メール形式（Magic Link 送信時）、面接官プロファイル入力（display_name、role_in_org? 等）
  - 面接官プロファイル編集 UI 雛形: 専用設定ページは Stage 2、Stage 1 は `/interviews/new` ページ内で初回のみ display_name 入力 → user_profile に保存する形（本スペックでは「初回入力 UI を `/interviews/new` に予約」とのみ宣言、`/interviews/new` 自体の構築は `assessment-engine` spec）
  - smoke test ページ `apps/web/app/admin/_health/page.tsx` を一時設置（`requireAdmin()` で認証、admin-review-panel spec が `/admin/sessions` を実装した時点で削除予定）

- **Out of scope**:
  - 面接セッション作成・進行・完了処理 → `assessment-engine` spec
  - 候補者情報入力 UI（`/interviews/new` の本体実装）→ `assessment-engine` spec（本スペックは display_name 初回入力の枠のみ予約）
  - 管理画面の機能 UI（`/admin/sessions`、セッション詳細、CSV/JSON エクスポート等）→ `admin-review-panel` spec
  - LLM 関数・Whisper 統合 → `assessment-engine` spec
  - チャット API / 面接ターン処理 API のレート制限ロジック → `assessment-engine` spec が `rate_limit` テーブルを再利用（key prefix `chat:userId`）
  - Google OAuth、SSO、Apple Sign-in → Stage 2
  - パスワード認証 → Stage 1 では使わない
  - 候補者向け認証 → 候補者は bulr にログインしない、Stage 3 で候補者直接対話型と同時に追加検討
  - データエクスポート、アカウント削除フロー → Stage 3（企業側機能として実装）
  - 監査ログ → Stage 2
  - `packages/auth` パッケージ切り出し → Stage 2 で apps/admin 分離時にリファクタ
  - Resend のカスタムドメイン認証・本番送信ドメイン整備 → Stage 2（Stage 1 は `onboarding@resend.dev` を使用）
  - i18n ライブラリ（next-intl 等）の導入 → Stage 2、本スペックではメール本文に日本語と英語を並記する単一テンプレートで対応

- **Adjacent expectations**:
  - 本スペックは `monorepo-foundation` で作成済みの `apps/web/lib/`（ガード / Server Action ラッパー配置）と `packages/db/src/schema/`（Better Auth テーブル / `user_profile` / `rate_limit` 配置）を利用する
  - `multi-env-infrastructure` で `.env.example` および Vercel に登録された `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `RESEND_API_KEY` / `ADMIN_ALLOWED_EMAILS` を本スペックが参照する。新規環境変数は追加しない
  - 本スペックの `user_profile` テーブルは後続 `assessment-engine` spec で読み取り対象（面接官コンテキストとして利用）
  - 本スペックの `rate_limit` テーブルは後続 `assessment-engine` spec で再利用（key prefix `chat:` / `session:`）。本スペックではテーブル定義のみで、Magic Link 用途以外の利用は想定しない
  - 本スペックの `requireUser()` / `requireAdmin()` / `requireSessionOwnership()` / `authedAction()` / `adminAction()` / `AuthError` は後続 `assessment-engine` spec / `admin-review-panel` spec から呼び出される共通契約
  - 後続 `admin-review-panel` spec の `/admin/sessions/*` ページは、本スペックで提供する `requireAdmin()` / `adminAction()` のみで保護する（proxy.ts は `/admin/*` に対して何も行わない）。本スペックでは `/admin/_health/` smoke test ページで動作確認

## Requirements

### Requirement 1: Better Auth サーバー / クライアント設定 と Magic Link 配信

**Objective:** As a 面接官（interviewer = user）, I want メールアドレスを入力するだけで Magic Link が届き、リンククリックで bulr にサインインできること, so that パスワードを覚える必要なく、自分が担当する面接セッションにアクセスできる。

#### Acceptance Criteria

1. The apps/web shall `apps/web/lib/auth/server.ts` に Better Auth 1.6.x のサーバー設定を持つ。
2. The apps/web shall `apps/web/lib/auth/client.ts` に Better Auth クライアント設定を持ち、サインイン UI から `signIn.magicLink({ email })` を呼び出せる。
3. The Better Auth サーバー設定 shall Magic Link プラグインを有効化し、有効期限を 15 分、使い切り（1 度クリックで invalidate）に設定する。
4. The Better Auth サーバー設定 shall Cookie 属性を `HttpOnly: true`、`Secure: true`（本番環境）、`SameSite: 'Lax'` に設定する。
5. The Better Auth サーバー設定 shall `BETTER_AUTH_SECRET` を環境変数から読み取り、未設定時には起動時に明示的にエラーを発生させる。
6. The Better Auth サーバー設定 shall `BETTER_AUTH_URL` を環境変数から読み取り、Magic Link の callback URL として使用する。
7. The Better Auth API shall `apps/web/app/api/auth/[...all]/route.ts` で GET / POST ハンドラを公開し、Magic Link の送信・コールバック・サインアウトをサポートする。
8. When 面接官が `/sign-in` でメールアドレスを送信したとき、the apps/web shall Better Auth の Magic Link 送信フローを起動し、Resend 経由でメールを配信する。
9. When 面接官が Magic Link をクリックしたとき、the apps/web shall リンクの有効性を検証し、有効ならば Better Auth セッションを開始して `/interviews` にリダイレクトする。
10. If Magic Link が有効期限切れ（15 分超過）または使用済みの場合、then the apps/web shall ユーザーにエラーを表示し、再送信を促す。

### Requirement 2: Resend 統合と Magic Link メールテンプレート

**Objective:** As a 面接官, I want 受信した Magic Link メールが日本語と英語の両方で簡潔に書かれていて、サインインリンクが明示されていること, so that 言語の壁なくスムーズにサインインでき、不審メールと誤認しない。

#### Acceptance Criteria

1. The apps/web shall `apps/web/lib/email/resend.ts` に Resend クライアント初期化を持ち、`RESEND_API_KEY` を環境変数から読み取る。
2. If `RESEND_API_KEY` が未設定の場合、then the Resend クライアント shall 初期化時に明示的にエラーを発生させる。
3. The Magic Link メールテンプレート shall 日本語と英語を並記する単一テンプレート（HTML + プレーンテキストの両形式）として `apps/web/lib/email/templates/magic-link.ts`（または同等）に定義される。
4. The メールテンプレート shall 件名・本文ともに「面接官向け」のメッセージを含み、bulr が AI 面接アシスタントである旨と Magic Link が 15 分で失効する旨を明示する。
5. The メールテンプレート shall サインインリンク URL を本文中に明示し、HTML 版ではボタン要素、プレーンテキスト版では平文 URL として表示する。
6. The メール送信 shall 送信元（`from`）を Stage 1 では Resend のテストドメイン（例: `bulr <onboarding@resend.dev>`）に設定し、カスタムドメイン認証は Stage 2 で対応する旨をコード内コメントで明示する。
7. When Better Auth が Magic Link を送信したとき、the Resend クライアント shall 該当メールアドレス宛にテンプレート適用済みメールを配信する。
8. The メール本文 shall 受信者の個人情報（face image / phone 等）を一切含まず、サインインリンクと「自分でリクエストしていない場合は無視してください」の注意書きのみを含む。

### Requirement 3: 面接官セッション管理（HttpOnly Cookie / 有効期限）

**Objective:** As a 面接官, I want サインイン後のセッションが安全に管理され、適切な期間継続すること, so that 面接の途中でサインアウトされず、かつ盗難リスクが最小化される。

#### Acceptance Criteria

1. The Better Auth セッション shall HttpOnly Cookie として保存され、JavaScript からアクセス不可になる。
2. The Better Auth セッション shall `Secure: true` 属性を持ち、本番環境では HTTPS 経由でのみ送信される。
3. The Better Auth セッション shall `SameSite: 'Lax'` 属性を持ち、CSRF 攻撃のベースライン防御を提供する。
4. The Better Auth セッション shall デフォルトの有効期限を 7 日間とし、`expiresIn` パラメータで Better Auth に明示する。
5. The Better Auth セッション shall アクセスごとに自動的に有効期限を延長する（sliding expiration）か、明示的に `updateAge` パラメータでリフレッシュ間隔を制御する（Better Auth のデフォルト挙動に従う）。
6. When 面接官が明示的にサインアウトしたとき、the apps/web shall Better Auth の sign-out エンドポイントを呼び出し、セッション Cookie を即時無効化する。
7. When セッション有効期限が切れた状態で `/interviews/*` にアクセスした場合、the proxy.ts shall ユーザーを `/sign-in` にリダイレクトする（UX として）。
8. The Server Component / Server Action / API Route shall セッション有効期限切れの場合に独立して `requireUser()` で `AuthError('UNAUTHORIZED')` を発生させ、proxy.ts のリダイレクトに依存しない。

### Requirement 4: 管理者認証（ADMIN_ALLOWED_EMAILS 許可メール検査）

**Objective:** As a 創業者（admin）, I want `/admin/*` 配下が Magic Link サインイン済み + ADMIN_ALLOWED_EMAILS 許可メールに含まれる場合のみアクセス可能であること, so that 管理画面が許可メール検査によって創業者本人のみに制限される。

#### Acceptance Criteria

1. The apps/web shall `apps/web/lib/guards.ts` に `requireAdmin()` 関数を持ち、Better Auth セッションを取得 → セッション未存在なら `AuthError('UNAUTHORIZED')` → セッションのユーザーメールが `ADMIN_ALLOWED_EMAILS`（CSV、`process.env.ADMIN_ALLOWED_EMAILS?.split(',').map(s => s.trim()) ?? []`）に含まれなければ `AuthError('FORBIDDEN')` を発生させる。
2. The Server Component / API Route shall `/admin/*` 配下のすべてのページとエンドポイントで `requireAdmin()` を独立に呼び出す（proxy.ts は `/admin/*` を保護しない）。
3. The apps/web shall `apps/web/app/admin/login/page.tsx` を持ち、管理者メールアドレスで Magic Link サインインする必要がある旨をユーザーに案内する。
4. When `ADMIN_ALLOWED_EMAILS` が未設定または空文字の場合、then the requireAdmin() shall 全ユーザーを拒否（fail secure）し、`AuthError('FORBIDDEN')` を発生させる。
5. The apps/web shall `apps/web/app/admin/_health/page.tsx` を一時設置し、`requireAdmin()` を呼び出す Server Component として、Magic Link サインイン + 許可メール検査の 2 つすべてを通過した場合のみ「OK」と表示する（admin-review-panel spec で `/admin/sessions` を実装した時点で削除予定）。

### Requirement 5: 認証ヘルパー（guards.ts）と Server Action ラッパー（safe-action.ts）

**Objective:** As a 後続 spec の実装者（assessment-engine / admin-review-panel）, I want `requireUser()` / `requireAdmin()` / `requireSessionOwnership()` / `authedAction()` / `adminAction()` の共通契約が揃っていて、新しい Server Component / Server Action / API Route で同じパターンを再利用できること, so that 多層認証を毎回書き直す必要がなく、認証ロジックの実装抜けを防げる。

#### Acceptance Criteria

1. The apps/web shall `apps/web/lib/guards.ts` に `AuthError` クラス（`code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND'` を持つ）をエクスポートする。
2. The apps/web shall `apps/web/lib/guards.ts` に `getCurrentUser()` 関数をエクスポートし、Better Auth セッションを取得して `{ id, email } | null` を返す（throw しない、null を返す）。
3. The apps/web shall `apps/web/lib/guards.ts` に `requireUser()` 関数をエクスポートし、Better Auth セッションが無い場合に `AuthError('UNAUTHORIZED')` を throw、ある場合は `{ id, email }` を返す。
4. The apps/web shall `apps/web/lib/guards.ts` に `requireAdmin()` 関数をエクスポートし、`requireUser()` を呼んだ後にユーザーのメールが `ADMIN_ALLOWED_EMAILS` に含まれるかを検証、含まれなければ `AuthError('FORBIDDEN')` を throw する。
5. The apps/web shall `apps/web/lib/guards.ts` に `requireSessionOwnership(session, userId)` 関数をエクスポートし、`session.interviewerId !== userId` の場合に `AuthError('FORBIDDEN')` を throw する（`session` は `interview_session` レコード相当の `{ interviewerId: string } | null | undefined` 型を受け付け、`null/undefined` の場合は `AuthError('NOT_FOUND')` を throw）。
6. The apps/web shall `apps/web/lib/safe-action.ts` に `authedAction(schema: ZodSchema, handler: (input, ctx: { userId: string }) => Promise<R>): (formData: FormData | input) => Promise<R>` 形式の Server Action ラッパーをエクスポートする。
7. The `authedAction` shall 内部で `requireUser()` を呼び、入力を `schema.parse()` で検証してから `handler` を呼ぶ。`AuthError` または `ZodError` を捕捉し、Server Action の戻り値として `{ ok: false, error: { code, message } }` 形式で返す。
8. The apps/web shall `apps/web/lib/safe-action.ts` に `adminAction(schema, handler)` 形式の Server Action ラッパーをエクスポートし、内部で `requireAdmin()` を呼び出してから入力検証 + handler 呼び出しを行う。
9. The 認証ヘルパー shall サードパーティライブラリ（next-safe-action 等）を使わず、自前で軽量実装される（依存追加なし）。
10. When 後続 spec の実装者が新しい Server Action を追加するとき、the safe-action.ts shall `authedAction(schema, handler)` または `adminAction(schema, handler)` でラップすることが標準パターンとなり、素の `async function` で書かない方針を `apps/web/lib/safe-action.ts` のファイルヘッダコメントに明示する。

### Requirement 6: proxy.ts による UX リダイレクトと CVE-2025-29927 教訓の明記

**Objective:** As a 面接官および創業者, I want 未認証で `/interviews/*` にアクセスしたら自動的に `/sign-in` にリダイレクトされること, so that 適切な認証フローに自然に誘導される。同時に、proxy.ts の脆弱性（CVE-2025-29927 のような bypass 攻撃）があっても、各レイヤーの独立チェックで防御が破られない構造であること。

#### Acceptance Criteria

1. The apps/web shall `apps/web/proxy.ts`（Next.js 16 で middleware.ts から rename）を持つ。
2. The proxy.ts shall ファイル冒頭の JSDoc に「このファイルは UX リダイレクトのみを担当する。CVE-2025-29927 の教訓により、認可は各 Server Component / Server Action / API Route の `requireUser()` / `requireAdmin()` で独立して行うこと」を明記する。
3. The proxy.ts shall リクエストパスが `/interviews/*`（`(interviewer)` ルートグループ配下を含む）で始まり、かつ Better Auth セッション Cookie が存在しない場合、`/sign-in` にリダイレクトする。
4. The proxy.ts shall `config.matcher` で `/interviews/:path*` のみを対象とし、`/admin/*`、`/api/auth/*`、`/_next/*`、静的ファイル等は対象外とする。
5. When 攻撃者が proxy.ts の bypass を試みた場合（例: 特定ヘッダーで matcher を回避する CVE-2025-29927 類似攻撃）、then the Server Component / Server Action / API Route shall `requireUser()` / `requireAdmin()` で独立に認可を判定し、データを露出しない。
6. The proxy.ts shall Better Auth のセッション検証ロジック自体は実行せず、Cookie の存在のみを確認する（実 session validation は Server Component で `requireUser()` が行う、UX 責務のみ）。

### Requirement 7: DB スキーマ（Better Auth テーブル / user_profile / rate_limit）と databaseHooks による user_profile 自動作成

**Objective:** As a 後続 spec の実装者, I want Better Auth 管理テーブル（user / session / account / verification）が標準スキーマで定義され、bulr 固有の面接官データが `user_profile` テーブルで 1:1 参照される構造、および Magic Link / API レート制限に共通の `rate_limit` テーブルが利用可能であること、加えて新規ユーザー作成時に `user_profile` レコードが自動作成されること, so that Better Auth のメジャーアップデートで管理テーブルにカラム追加されてもマージ衝突せず、bulr 固有データの追加・変更が独立に進められ、新規面接官のオンボーディング時に手動の profile 作成処理を書く必要がない。

#### Acceptance Criteria

1. The packages/db shall `packages/db/src/schema/auth.ts` に Better Auth 管理テーブル（`user` / `session` / `account` / `verification`）を Drizzle スキーマで定義し、Better Auth の標準スキーマに従う（独自カラムは追加しない）。
2. The packages/db shall `packages/db/src/schema/user-profile.ts` に `user_profile` テーブルを定義し、以下のカラムを含む: `user_id text PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE`、`display_name text NOT NULL`、`role_in_org text`（NULL 可）、`years_of_experience int`（NULL 可、Stage 2 拡張で利用）、`created_at timestamp NOT NULL DEFAULT now()`、`updated_at timestamp NOT NULL DEFAULT now()`。
3. The packages/db shall `packages/db/src/schema/rate-limit.ts` に `rate_limit` テーブルを定義し、以下のカラムを含む: `key text PRIMARY KEY`（key prefix で `email:` / `ip:` / `session:` / `chat:` を区別）、`count int NOT NULL DEFAULT 0`、`window_start timestamp NOT NULL DEFAULT now()`。
4. The packages/db shall `packages/db/src/schema/index.ts` のバレルエクスポートに `auth.ts`、`user-profile.ts`、`rate-limit.ts` のエクスポートを追加する。
5. The Better Auth サーバー設定 shall `databaseHooks.user.create.after` フックを定義し、新規 user レコード作成直後に `user_profile` レコードを `INSERT` で自動作成する（`user_id` = 新 user の id、`display_name` = `user.email` のローカル部「@」前を slug 化したものをデフォルト）。
6. The Better Auth サーバー設定 shall `databaseHooks.user.create.after` フック内で `user_profile` 作成が失敗した場合、Better Auth の user 作成自体もロールバックされるか、明示的なエラーログが出る形（Better Auth 1.6.x のフック仕様に従う）にする。
7. The drizzle-kit migration shall `pnpm --filter @bulr/db generate` で `packages/db/drizzle/*_authentication.sql`（drizzle-kit が決定する番号付きファイル名、例: `0001_<suffix>.sql`）を生成し、本スペックでファイル名をハードコードしない。
8. When 開発者が `pnpm --filter @bulr/db push` を実行したとき、the Neon dev branch shall `user` / `session` / `account` / `verification` / `user_profile` / `rate_limit` の 6 テーブルがすべて作成された状態になる。
9. When 面接官が初めて Magic Link サインインに成功し、Better Auth が新規 user レコードを作成したとき、the user_profile テーブル shall 該当 user_id のレコードが自動作成され、display_name にデフォルト値（メールローカル部）が入った状態になる。

### Requirement 8: Magic Link レート制限（DB ベース、共通 rate_limit テーブル）

**Objective:** As a 創業者（インフラ運用責任者）, I want Magic Link 送信が 1 メールあたり 5 分間に 3 回、1 IP あたり 1 時間に 20 回までに制限されること, so that ブルートフォース攻撃や Resend Free プラン枠（100 通/日）の枯渇を防ぎ、悪意あるユーザーの送信濫用を抑制できる。

#### Acceptance Criteria

1. The Magic Link 送信フロー shall Better Auth の `sendMagicLink` ハンドラ内（または送信前のラッパー関数内）で `rate_limit` テーブルにアクセスし、`email:<email>` キーで 5 分間の送信回数を確認する。
2. If `email:<email>` キーの送信回数が直近 5 分間で 3 回以上の場合、then the Magic Link 送信 shall 拒否され、ユーザーには「短時間に複数回のリクエストがあったため、しばらく待ってから再試行してください」と表示される。
3. The Magic Link 送信フロー shall リクエスト送信元 IP（`x-forwarded-for` ヘッダー先頭または `request.ip`）を取得し、`ip:<ip>` キーで 1 時間の送信回数を確認する。
4. If `ip:<ip>` キーの送信回数が直近 1 時間で 20 回以上の場合、then the Magic Link 送信 shall 拒否され、ユーザーには汎用エラーメッセージ（「現在ご利用が混み合っています」等、IP 情報を露出しない）が表示される。
5. The レート制限実装 shall Drizzle の `INSERT ... ON CONFLICT (key) DO UPDATE SET count = ..., window_start = ...` 構文を使い、ウィンドウが切れたら count をリセットする。
6. The レート制限実装 shall Vercel Functions のメモリ非共有性を考慮し、in-memory（プロセス内変数 / Map / LRU キャッシュ）でカウンタを保持しない（DB ベース必須）。
7. The レート制限カウンタ shall 一定時間経過後（例: window_start から 24 時間）に古いレコードをクリーンアップする方針を持つが、Stage 1 では明示的なクリーンアップ Cron は実装しない（DB レコード数増加は許容、Stage 2 で Cron 追加検討）。
8. When 攻撃者が同じメールに対して 5 分以内に 4 回目の送信を試みた場合、then the apps/web shall 4 回目の送信を拒否し、Resend API への呼び出しを行わない。

### Requirement 9: Zod 入力検証（メール形式 / 面接官プロファイル入力）

**Objective:** As a セキュリティ責任者, I want すべての外部入力（Magic Link 送信時のメール、面接官プロファイル入力）が Zod スキーマで検証されること, so that 不正なフォーマットの入力でアプリケーションが落ちたり、SQL インジェクションや XSS 攻撃の足がかりにされたりしない。

#### Acceptance Criteria

1. The Magic Link 送信フロー shall 入力メールアドレスを Zod の `z.string().email().trim().max(254)` で検証し、検証失敗時には Server Action の戻り値として `{ ok: false, error: { code: 'INVALID_INPUT', message: ... } }` を返す（throw しない、UX を損なわない）。
2. The 面接官プロファイル入力 shall `display_name` を Zod の `z.string().trim().min(1).max(100)` で検証する。
3. The 面接官プロファイル入力 shall `role_in_org` を Zod の `z.string().trim().max(100).optional()` で検証する。
4. The 面接官プロファイル入力 shall `years_of_experience` を Zod の `z.number().int().min(0).max(60).optional()` で検証する。
5. The Server Action ラッパー（`authedAction` / `adminAction`）shall すべての入力を Zod schema で `parse()` してから handler を呼び、`ZodError` を捕捉して Server Action の戻り値として `{ ok: false, error: { code: 'INVALID_INPUT', message } }` を返す。
6. The Zod schema 定義 shall `apps/web/lib/auth/schemas.ts`（または同等）に集約され、複数箇所から再利用可能な形でエクスポートされる。

### Requirement 10: smoke test ページ（一時設置、admin-review-panel で削除）

**Objective:** As a 創業者（本スペック完了確認担当）, I want `/admin/_health/` ページにアクセスして、Magic Link サインイン + 許可メール検査の 2 つすべてが正しく動作することを目視確認できること, so that 本スペック完了時点で実認証パスが通ることを検証でき、後続 `admin-review-panel` spec の `/admin/sessions` 実装に進める。

#### Acceptance Criteria

1. The apps/web shall `apps/web/app/admin/_health/page.tsx` を一時設置し、Server Component として `requireAdmin()` を呼び出す。
2. The /admin/\_health/ ページ shall `requireAdmin()` が成功した場合、画面に「OK: admin authenticated」とユーザーのメールアドレスを表示する。
3. The /admin/\_health/ ページ shall `requireAdmin()` が `AuthError('UNAUTHORIZED')` を throw した場合、Next.js の error boundary または `redirect('/sign-in')` で `/sign-in` に誘導する。
4. The /admin/\_health/ ページ shall `requireAdmin()` が `AuthError('FORBIDDEN')` を throw した場合、HTTP 403 相当の表示（「FORBIDDEN: あなたのメールアドレスは管理者として登録されていません」）を行う。
5. The /admin/\_health/ ページ shall `apps/web/app/admin/_health/page.tsx` ファイル冒頭のコメントに「本ページは authentication spec の smoke test 用に一時設置。admin-review-panel spec で `/admin/sessions` を実装した時点で削除する」を明記する。
6. When 創業者が Magic Link サインイン済み + メールが ADMIN_ALLOWED_EMAILS に含まれる状態で `/admin/_health/` にアクセスしたとき、the apps/web shall 「OK: admin authenticated」と該当メールを表示する。
7. When Magic Link サインインしていない状態で `/admin/_health/` にアクセスしたとき、the apps/web shall `/sign-in` にリダイレクトする。
8. When Magic Link サインイン済みだがメールが ADMIN_ALLOWED_EMAILS に含まれない状態で `/admin/_health/` にアクセスしたとき、the apps/web shall HTTP 403 相当の FORBIDDEN 表示を行う。

### Requirement 11: 面接官サインイン UI（/sign-in）と管理画面ログイン UI（/admin/login）

**Objective:** As a 面接官および創業者, I want メール入力フォームから Magic Link を送信できる UI と、管理画面ログインの案内 UI が用意されていること, so that ブラウザ操作で迷いなくサインインフローを完了できる。

#### Acceptance Criteria

1. The apps/web shall `apps/web/app/(interviewer)/sign-in/page.tsx` を持ち、メールアドレス入力欄と「Magic Link を送信」ボタンを表示する。
2. The /sign-in ページ shall フォーム送信時に Better Auth クライアントの `signIn.magicLink({ email })` を呼び出し、成功時には「メールを送信しました」と表示、失敗時にはエラーメッセージを表示する。
3. The /sign-in ページ shall 入力メールアドレスを Zod スキーマでクライアント側でも検証し、不正形式の場合に「正しいメールアドレスを入力してください」を表示する（サーバー側の Zod 検証と二重防御）。
4. The /sign-in ページ shall レート制限超過時のエラー（Requirement 8）を識別できるエラーメッセージ（「短時間に複数回のリクエストがあったため、しばらく待ってから再試行してください」）を表示する。
5. The apps/web shall `apps/web/app/admin/login/page.tsx` を持ち、管理者メールアドレスで Magic Link サインインする必要がある旨をユーザーに案内する。
6. The /admin/login ページ shall 「管理者メールアドレスで Magic Link サインインしてください」のメッセージとサインインリンク（`/sign-in?redirect=/admin/_health`）を表示する。
7. The /sign-in および /admin/login ページ shall サインイン済みユーザーが訪問した場合、`/interviews`（または管理者なら `/admin/_health`）に自動リダイレクトする（UX 最適化）。
