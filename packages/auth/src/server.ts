/**
 * Better Auth サーバー設定
 *
 * `import 'server-only'` により Client バンドルへの誤った巻き込みを防ぐ。
 * Client Component から本ファイル経由で auth を参照しようとした場合、
 * Next.js のビルドが明示的なエラーで失敗する。
 *
 * Requirements: 1.1, 1.3-1.10, 2.7, 3.1-3.5, 7.5, 7.6, 7.9, 8.1, 8.3, 8.8
 * candidate-auth-onboarding Requirements: 1.1, 1.2, 1.4
 */

import 'server-only';

import { db } from '@bulr/db';
import { account, session, user, verification } from '@bulr/db/schema';
import { userProfile } from '@bulr/db/schema';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { checkAndIncrement } from '@bulr/lib';
import { sendEmail } from './email/resend';
import { renderMagicLinkEmail } from './email/templates/magic-link';

// ---------------------------------------------------------------------------
// createAuth factory
// ---------------------------------------------------------------------------

/**
 * `sendMagicLink` コールバックの型。
 * 呼び出し元アプリがメール送信実装を注入するための型。
 * レート制限は factory 内部で処理するため、アプリ側には { email, url } のみを渡す。
 *
 * candidate-auth-onboarding Requirements: 1.1
 */
export type SendMagicLinkFn = (
  params: { email: string; url: string },
) => Promise<void>;

/**
 * `createAuth` factory に渡す設定オブジェクトの型。
 *
 * - `sendMagicLink`: Magic Link メール送信の実装を呼び出し元アプリが注入する
 * - `overrides`: Better Auth のオプションを部分的に上書きしたい場合に指定する（省略可）
 *
 * candidate-auth-onboarding Requirements: 1.1, 1.2
 */
export interface CreateAuthConfig {
  sendMagicLink: SendMagicLinkFn;
  overrides?: Partial<BetterAuthOptions>;
}

/**
 * Better Auth の baseURL を解決する。
 *
 * 優先順位:
 *   1. `BETTER_AUTH_URL`（ローカル `.env.local`、Vercel Production の明示設定）
 *   2. `https://${VERCEL_URL}`（Vercel Preview デプロイで env 未設定時のフォールバック）
 *   3. throw（両方未定義は構成エラー）
 *
 * `VERCEL_URL` は protocol を持たない（例: `bulr-candidate-abc123.vercel.app`）ため、
 * 必ず `https://` を付加する。
 *
 * Requirements (multi-app-deployment): 8.1, 8.2, 8.3, 8.4
 */
function resolveBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  throw new Error(
    '[auth] BETTER_AUTH_URL も VERCEL_URL も設定されていません。環境変数を確認してください。',
  );
}

// Better Auth core テーブルのみを含む authSchema
const authSchema = { user, session, account, verification };

/**
 * Better Auth インスタンスを生成する factory 関数。
 *
 * デフォルト設定（session.expiresIn: 7日、cookieOptions: HttpOnly/Secure/SameSite=Lax、
 * drizzleAdapter）を内部で適用し、`config.overrides` でマージできる。
 * `config.sendMagicLink` は magicLink plugin に注入される。
 *
 * - `BETTER_AUTH_SECRET` が未設定の場合は即時 throw
 * - `DATABASE_URL` が未設定の場合は即時 throw
 *
 * candidate-auth-onboarding Requirements: 1.1, 1.2, 1.4
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAuth(config: CreateAuthConfig) {
  // 必須環境変数チェック（Fail Secure）
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error(
      '[auth] BETTER_AUTH_SECRET が設定されていません。環境変数を確認してください。',
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      '[auth] DATABASE_URL が設定されていません。環境変数を確認してください。',
    );
  }

  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: resolveBaseUrl(),

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: authSchema,
    }),

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7日
      updateAge: 60 * 60 * 24, // sliding 1日
      cookieCache: {
        enabled: true,
      },
    },

    advanced: {
      cookies: {
        session_token: {
          attributes: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
          },
        },
      },
    },

    plugins: [
      magicLink({
        expiresIn: 60 * 15, // 15分
        sendMagicLink: async ({ email, url }, ctx) => {
          // IP アドレス取得（GenericEndpointContext の getHeader を使用）
          const ip =
            ctx?.getHeader('x-forwarded-for')?.split(',')[0]?.trim() ??
            'unknown';

          // メールアドレスベースのレート制限: 3回/5分
          await checkAndIncrement('email:' + email, {
            limit: 3,
            windowMs: 5 * 60 * 1000,
          });

          // IP ベースのレート制限: 20回/時
          await checkAndIncrement('ip:' + ip, {
            limit: 20,
            windowMs: 60 * 60 * 1000,
          });

          // 呼び出し元アプリが注入した sendMagicLink を使用
          // レート制限は factory 内部で処理済みのため、{ email, url } のみ渡す
          await config.sendMagicLink({ email, url });
        },
      }),
    ],

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const displayName = user.email.split('@')[0] ?? user.email;
            await db
              .insert(userProfile)
              .values({
                userId: user.id,
                displayName,
              })
              .onConflictDoNothing();
          },
        },
      },
    },

    // overrides を最後にマージする（デフォルト設定を部分的に上書き可能）
    ...config.overrides,
  });
}

// ---------------------------------------------------------------------------
// 既存 singleton（Phase A: factory と共存。Phase C で削除予定）
// ---------------------------------------------------------------------------

// 起動時の必須環境変数チェック（singleton 用）
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    '[auth] BETTER_AUTH_SECRET が設定されていません。環境変数を確認してください。',
  );
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: resolveBaseUrl(),

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7日
    updateAge: 60 * 60 * 24, // sliding 1日
    cookieCache: {
      enabled: true,
    },
  },

  advanced: {
    cookies: {
      session_token: {
        attributes: {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax' as const,
        },
      },
    },
  },

  plugins: [
    magicLink({
      expiresIn: 60 * 15, // 15分
      sendMagicLink: async ({ email, url }, request) => {
        // IP アドレス取得
        const ip =
          request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          'unknown';

        // メールアドレスベースのレート制限: 3回/5分
        await checkAndIncrement('email:' + email, {
          limit: 3,
          windowMs: 5 * 60 * 1000,
        });

        // IP ベースのレート制限: 20回/時
        await checkAndIncrement('ip:' + ip, {
          limit: 20,
          windowMs: 60 * 60 * 1000,
        });

        // メール本文生成
        const { subject, html, text } = renderMagicLinkEmail({ url });

        // メール送信（dev: Mailpit SMTP / prod: Resend API）
        await sendEmail({ to: email, subject, html, text });
      },
    }),
  ],

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const displayName = user.email.split('@')[0] ?? user.email;
          await db
            .insert(userProfile)
            .values({
              userId: user.id,
              displayName,
            })
            .onConflictDoNothing();
        },
      },
    },
  },
});
