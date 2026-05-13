/**
 * 管理画面ログイン案内ページ（/admin/login）
 *
 * Server Component。Basic 認証ダイアログはブラウザと proxy.ts が担当する。
 * このページは Basic 認証通過後に表示され、管理者メールアドレスで
 * Magic Link サインインを案内する。
 *
 * Requirements: 4.5, 11.5, 11.6, 11.7
 * Boundary: AdminLoginPage
 * Depends: 4.1 ✓ (getCurrentUser)
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/guards';

export default async function AdminLoginPage() {
  const user = await getCurrentUser();

  // 既にサインイン済みかつ ADMIN_ALLOWED_EMAILS に含まれる場合は /admin/_health へリダイレクト
  // （UX 最適化。セキュリティ判定は /admin/_health 側の requireAdmin() が行う）
  if (user !== null) {
    const allowed =
      process.env.ADMIN_ALLOWED_EMAILS?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    if (allowed.length > 0 && allowed.includes(user.email)) {
      redirect('/admin/_health');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">bulr 管理者サインイン</h1>
        <p className="mb-6 text-sm text-gray-500">Admin Sign-in</p>

        <div className="mb-6 rounded-md border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-medium text-green-800">
            ✓ Basic 認証通過 OK
          </p>
        </div>

        <p className="mb-4 text-gray-700">
          次に、管理者メールアドレスで Magic Link サインインしてください。
        </p>
        <p className="mb-6 text-sm text-gray-500">
          Please sign in with your admin email address via Magic Link.
        </p>

        <Link
          href="/sign-in?redirect=/admin/_health"
          className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Magic Link でサインイン / Sign in with Magic Link
        </Link>
      </div>
    </main>
  );
}
