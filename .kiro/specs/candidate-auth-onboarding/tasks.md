# 実装計画 — candidate-auth-onboarding

## タスク一覧

- [x] 1. packages/auth factory 化の基盤実装
- [x] 1.1 createAuth factory 関数の実装
  - `packages/auth/src/server.ts` に `export function createAuth(config: CreateAuthConfig): ReturnType<typeof betterAuth>` を実装する
  - `CreateAuthConfig` 型を `{ sendMagicLink: SendMagicLinkFn; overrides?: Partial<BetterAuthOptions> }` として定義する
  - デフォルト設定（session.expiresIn: 7日、cookieOptions: HttpOnly/Secure/SameSite=Lax、drizzleAdapter）を factory 内部で適用し、`overrides` でマージできるようにする
  - `BETTER_AUTH_SECRET` または `DATABASE_URL` が未設定の場合は即時 throw する
  - `pnpm --filter @bulr/auth typecheck` が通ること
  - _Requirements: 1.1, 1.2, 1.4_
  - _Boundary: CreateAuthFactory_

- [x] 1.2 requireCandidate ガードの実装
  - `packages/auth/src/guards.ts` に `export async function requireCandidate()` を追加する
  - 内部で `requireUser()` を呼び出し（UNAUTHORIZED は委譲）、`candidate_profile` を `userId` でクエリする
  - `candidate_profile` が存在しない場合は `AuthError('CANDIDATE_PROFILE_MISSING')` を throw する
  - `packages/db/src/schema/candidate-profile.ts` を import すること（この時点ではスキーマが未作成のため、タスク 3.1 完了後に typecheck を通す）
  - `packages/auth/src/server-entry.ts` から `requireCandidate` を re-export する
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - _Boundary: RequireCandidate, AuthServerEntry_
  - _Depends: 3.1_

- [x] 2. アプリ別 Magic Link テンプレートの分離と factory 適用
- [x] 2.1 (P) apps/business の factory 移行
  - `apps/business/lib/magic-link-template.ts` を新設し、既存の `packages/auth/src/email/templates/magic-link.ts` の企業向け内容を移設する
  - `apps/business/lib/auth.ts` を更新して `createAuth({ sendMagicLink: businessSendMagicLink })` を呼び出す形に変更する（`businessSendMagicLink` は `magic-link-template.ts` を利用する）
  - `pnpm --filter @bulr/business typecheck` が通ること
  - _Requirements: 1.6, 2.2, 8.2_
  - _Boundary: BusinessMagicLinkTemplate_
  - _Depends: 1.1_

- [x] 2.2 (P) apps/admin の factory 移行
  - `apps/admin/lib/magic-link-template.ts` を新設し、運営向け文面の Magic Link テンプレートを作成する
  - `apps/admin/lib/auth.ts` を更新して `createAuth({ sendMagicLink: adminSendMagicLink })` を呼び出す形に変更する
  - `pnpm --filter @bulr/admin typecheck` が通ること
  - _Requirements: 1.6, 2.3, 8.2_
  - _Boundary: AdminMagicLinkTemplate_
  - _Depends: 1.1_

- [x] 2.3 shared template の削除と turbo.json 更新
  - `packages/auth/src/email/templates/magic-link.ts`（旧 shared template）を削除する
  - `turbo.json` の `build.env` に `NEXT_PUBLIC_APP_URL`（候補者アプリ用）および `BETTER_AUTH_URL`（候補者アプリ用）を追加する（既に列挙済みの場合はスキップ）
  - `pnpm build` が全 workspace で成功すること
  - _Requirements: 2.4, 2.5, 8.1_
  - _Boundary: TurboConfig_
  - _Depends: 2.1, 2.2_

- [x] 3. candidate_profile スキーマと migration
- [x] 3.1 candidate_profile テーブルスキーマの定義
  - `packages/db/src/schema/candidate-profile.ts` を新設し、`candidateProfile` テーブルを Drizzle スキーマで定義する
  - カラム: `id`（text primaryKey、nanoid）、`userId`（text notNull unique、FK → `user.id`）、`displayName`（text notNull）、`headline`（text nullable）、`createdAt`（timestamp defaultNow）、`updatedAt`（timestamp defaultNow）
  - `packages/db/src/schema/index.ts` のバレルエクスポートに `candidate-profile.ts` を追加する
  - `pnpm --filter @bulr/db typecheck` が通ること
  - _Requirements: 3.1, 3.2, 3.4, 3.5_
  - _Boundary: CandidateProfileSchema_

- [x] 3.2 Drizzle migration の生成と適用
  - `pnpm drizzle-kit generate` を実行して `candidate_profile` テーブルの migration ファイルを生成する
  - `pnpm drizzle-kit push`（開発 DB）または `pnpm drizzle-kit migrate`（本番 DB）を実行して migration を適用する
  - `packages/db/drizzle/` に migration SQL ファイルが生成され、`candidate_profile` テーブルが DB に存在すること
  - _Requirements: 3.3_
  - _Boundary: CandidateProfileSchema_
  - _Depends: 3.1_

- [x] 4. apps/candidate の auth 設定と Magic Link テンプレート
- [x] 4.1 候補者向け Magic Link テンプレートの作成
  - `apps/candidate/lib/magic-link-template.ts` を新設し、候補者向け文言のメールテンプレート（HTML + テキスト + 件名）を実装する
  - 文言例: 「bulr へようこそ」「採用プロセスにご参加いただきありがとうございます」など候補者に適したコピー（日本語）
  - テンプレート関数は `renderCandidateMagicLinkEmail({ url }: { url: string }): { html: string; text: string; subject: string }` として export する
  - _Requirements: 2.1, 2.4_
  - _Boundary: CandidateMagicLinkTemplate_

- [x] 4.2 apps/candidate の auth インスタンス設定
  - `apps/candidate/lib/auth.ts` を更新して `createAuth({ sendMagicLink: candidateSendMagicLink })` を呼び出す形に変更する
  - `candidateSendMagicLink` は `renderCandidateMagicLinkEmail` を利用し、Resend でメールを送信する
  - `apps/candidate/lib/auth.ts` から `auth`（サーバー用）と `authClient`（クライアント用）を export する
  - `apps/candidate/app/api/auth/[...all]/route.ts` が新しい `auth` インスタンスを使用することを確認する
  - `pnpm --filter @bulr/candidate typecheck` が通ること
  - _Requirements: 1.5, 2.1, 4.1_
  - _Boundary: CandidateMagicLinkTemplate_
  - _Depends: 1.1, 4.1_

- [x] 5. 候補者サインインページの候補者向け文言更新
- [x] 5.1 sign-in ページの UI・文言更新
  - `apps/candidate/app/sign-in/page.tsx` の UI 文言を候補者向けに更新する（「bulr に参加する」「メールアドレスを入力してください」等、日本語）
  - フォーム送信後のサクセスメッセージも候補者向けに更新する
  - レート制限超過時のエラーメッセージを日本語で表示する
  - 既存の Better Auth クライアント（`authClient.signIn.magicLink`）を使用することを確認する
  - `pnpm --filter @bulr/candidate typecheck` が通ること
  - _Requirements: 4.1, 4.5, 4.6_
  - _Boundary: CandidateSignInPage_
  - _Depends: 4.2_

- [x] 6. 候補者オンボーディング動線の実装
- [x] 6.1 onboarding ページと candidate_profile 作成 Server Action の実装
  - `apps/candidate/app/onboarding/page.tsx` を新設する（Server Component。`requireUser` でセッションを確認する）
  - `apps/candidate/app/onboarding/_actions/create-profile.ts` を新設し、`authedAction` でラップした `createCandidateProfile` Server Action を実装する
  - Zod スキーマで `displayName`（必須、1〜100文字）を検証し、バリデーションエラー時はエラーメッセージを返す
  - 作成成功後は `redirect('/')` を実行する
  - `nanoid()` で `candidate_profile.id` を生成して INSERT する
  - `pnpm --filter @bulr/candidate typecheck` が通ること
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - _Boundary: OnboardingPage, CreateProfileAction_
  - _Depends: 3.1, 1.2_

- [x] 6.2 proxy.ts の onboarding リダイレクトルール追加
  - `apps/candidate/proxy.ts` の matcher に `/onboarding` を追加する
  - 未認証ユーザーが `/onboarding` にアクセスした場合、`/sign-in` にリダイレクトするロジックを実装する
  - `__Secure-better-auth.session_token` と `better-auth.session_token` の両方の cookie 名に対応する
  - `pnpm --filter @bulr/candidate typecheck` が通ること
  - _Requirements: 4.3, 4.4, 5.1, 5.4, 2.5_
  - _Boundary: CandidateProxy_
  - _Depends: 4.2_

- [x] 7. 招待トークン受け取りページの実装
- [x] 7.1 invitations/[token] ページの実装
  - `apps/candidate/app/invitations/[token]/page.tsx` を新設する（Server Component）
  - 未認証の場合: `redirect('/sign-in?token=' + params.token)` を実行する
  - 認証済みの場合: `Set-Cookie` で `pending_invitation_token={token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600` を設定する
  - cookie 設定後、`candidate_profile` の有無に応じて `/onboarding` か `/` にリダイレクトする
  - params.token はフォーマット（英数字・ハイフン・アンダースコア、最大 256 文字）を Zod で検証し、不正な場合は `notFound()` を返す
  - `pnpm --filter @bulr/candidate typecheck` が通ること
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - _Boundary: InvitationTokenPage_
  - _Depends: 3.1, 1.2_

- [x] 7.2 proxy.ts の invitations リダイレクトルール追加
  - `apps/candidate/proxy.ts` の matcher に `/invitations/:path*` を追加する
  - 未認証ユーザーが `/invitations/{token}` にアクセスした場合、`/sign-in?token={token}` にリダイレクトするロジックを実装する
  - token パラメータを query string に正しく引き継ぐこと
  - _Requirements: 6.1, 2.5_
  - _Boundary: CandidateProxy_
  - _Depends: 7.1_

- [x] 8. 統合検証とビルド確認
- [x] 8.1 全 workspace のビルド・タイプチェック確認
  - `pnpm build` が apps/candidate、apps/business、apps/admin、packages/auth、packages/db を含む全 workspace で成功すること
  - `pnpm typecheck` が全 workspace で成功すること
  - `pnpm lint` が全 workspace でエラーなく通ること
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - _Depends: 2.3, 5.1, 6.2, 7.2_

- [x] 8.2 手動 smoke test による動線確認
  - apps/business のサインイン → セッション一覧 → 面接中 UI が factory 移行後も回帰なく動作すること
  - apps/admin のサインイン → セッション一覧が動作すること
  - apps/candidate の候補者サインイン（候補者向け文面のメールが届く）→ 初回は `/onboarding` にリダイレクト → `display_name` 入力で `candidate_profile` 作成 → `/` に到達することを確認する
  - 未認証状態で `/invitations/test-token-123` にアクセスすると `/sign-in?token=test-token-123` にリダイレクトされること
  - _Requirements: 1.6, 2.1, 2.2, 4.2, 4.3, 4.4, 5.2, 6.1, 6.2, 8.2_
  - _Depends: 8.1_
