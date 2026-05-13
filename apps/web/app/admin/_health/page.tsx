/**
 * 本ページは authentication spec の smoke test 用に一時設置。
 * admin-review-panel spec で `/admin/sessions` を実装した時点で削除する。
 *
 * Requirements: 4.8, 10.1-10.8
 * Boundary: AdminHealthPage
 * Depends: 4.1 ✓ (requireAdmin, AuthError)
 */

import { redirect } from 'next/navigation';

import { AuthError, requireAdmin } from '@/lib/guards';

export default async function AdminHealthPage() {
  try {
    const user = await requireAdmin();
    return (
      <main>
        <h1>OK: admin authenticated</h1>
        <pre>{user.email}</pre>
      </main>
    );
  } catch (e) {
    if (e instanceof AuthError && e.code === 'UNAUTHORIZED') {
      redirect('/sign-in');
    }
    if (e instanceof AuthError && e.code === 'FORBIDDEN') {
      return (
        <main>
          <h1>FORBIDDEN</h1>
          <p>あなたのメールアドレスは管理者として登録されていません。</p>
        </main>
      );
    }
    throw e;
  }
}
