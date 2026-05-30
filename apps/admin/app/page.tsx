/**
 * apps/admin トップページ
 *
 * monorepo-app-split Task 4.3: /sessions（既存検証パネル）へリダイレクトする。
 * Layer 2 多層防御（requireAdmin）はリダイレクト先の /sessions が行うため、
 * 本ページ自体は誰でも到達可能（未認証の場合も /sessions → /sign-in に流れる）。
 *
 * Requirements: 3.4, 3.7, 3.12
 */

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/sessions');
}
