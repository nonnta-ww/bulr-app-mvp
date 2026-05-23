/**
 * apps/candidate トップページ（サインイン済みプレースホルダ）
 *
 * Task 5.2 でサインイン後のランディング先として拡張。
 * - 未サインインなら `/sign-in` にリダイレクト
 * - サインイン済みならプレースホルダ画面を表示（Wave 2〜4 で本格的に書き換え予定）
 *
 * Wave 1 時点では候補者ロール判定（candidate_profile 必須化）を行わず、
 * Better Auth でサインイン済みのユーザを誰でも受け入れる。ロール判定は
 * Wave 2 の `candidate-auth-onboarding` で導入予定。
 *
 * 候補者向け業務機能（履歴書登録・スキルアンケート・自己診断・模擬面接・
 * エントリー）は本 spec で実装せず、後続 Wave で拡張する。
 *
 * Requirements: 4.2, 4.4, 4.5, 4.7
 */

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@bulr/auth/server';

export default async function Page() {
  const user = await getCurrentUser();
  if (user === null) {
    redirect('/sign-in');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">bulr 候補者ポータル</h1>
      <p className="text-sm text-gray-600">
        サインインしました。Wave 2 以降で履歴書登録・自己診断・模擬面接などの機能を順次追加予定です。
      </p>
    </main>
  );
}
