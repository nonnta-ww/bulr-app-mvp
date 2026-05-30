/**
 * Better Auth クライアント設定
 *
 * このファイルは Client Component から import して使用する。
 * `'use client'` ディレクティブは各 Component 側で付与すること。
 *
 * Requirements: 1.2, 1.8, 3.6, 11.2, 11.7
 */

import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, useSession } = authClient;
