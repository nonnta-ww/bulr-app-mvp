/**
 * Interviewer ルートグループのレイアウト
 *
 * - getCurrentUser で未ログインなら /sign-in へリダイレクト
 * - cookie から sidebar-collapsed を読み、AppShell に渡す
 * - 各ページの requireUser() 呼び出しは多層 fail-secure のため維持
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell/app-shell';
import { getCurrentUser } from '@bulr/auth';

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
