/**
 * 設定ページ（プレースホルダー）
 *
 * 現時点では中身なし。将来の設定項目（プロファイル、通知等）の入れ物。
 */

import { redirect } from 'next/navigation';

import { requireUser } from '@bulr/auth/server';

export default async function SettingsPage() {
  try {
    await requireUser();
  } catch {
    redirect('/sign-in');
  }

  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="mt-6 text-gray-500">準備中です。</p>
      </div>
    </main>
  );
}
