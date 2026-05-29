/**
 * Interviewer ルートグループのレイアウト
 *
 * - getCurrentUser で未ログインなら /sign-in へリダイレクト
 * - cookie から sidebar-collapsed を読み、AppShell に渡す
 * - 各ページの requireUser() 呼び出しは多層 fail-secure のため維持
 *
 * `dynamic = 'force-dynamic'` を layout に置く理由:
 * 下位 page が Client Component を含む場合、Next.js は layout の `redirect()` を
 * 「常に redirect する route」として Vercel-level static redirect rule に変換してしまい、
 * 認証済み cookie でも `serverless-middleware` レイヤーで 307 をキャッシュ返却して
 * 関数まで到達しない症状が出る（観測: `content-type: text/plain`、`x-powered-by` 欠落、
 * `x-vercel-cache` 欠落）。Page 側に force-dynamic を置くだけでは override できないので
 * layout に置いて (interviewer) 配下すべてを動的化する。
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell/app-shell';
import { getCurrentUser } from '@bulr/auth/server';

export const dynamic = 'force-dynamic';

export default async function InterviewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  const cookieStore = await cookies();
  const collapsed = cookieStore.get('sidebar-collapsed')?.value === '1';
  return (
    <AppShell email={user.email} initialCollapsed={collapsed}>
      {children}
    </AppShell>
  );
}
