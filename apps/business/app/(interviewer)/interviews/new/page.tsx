/**
 * 新規面接セッション作成ページ（Server Component）
 *
 * Requirements: 3.1, 3.7
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { requireUser } from '@bulr/auth/server';
import { Icon } from '@/components/ui/icon';
import { CandidateForm } from '@/app/(interviewer)/interviews/_components/candidate-form';

export default async function NewInterviewPage() {
  try {
    await requireUser();
  } catch {
    redirect('/sign-in');
  }

  return (
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-3xl">
        {/* パンくず */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted">
          <Link href="/interviews" className="hover:text-ink">
            面接セッション
          </Link>
          <Icon name="chevron_right" size={16} className="text-hairline-strong" />
          <span className="text-ink">新規作成</span>
        </nav>

        {/* インフォバナー */}
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-copper/30 bg-copper-soft/50 px-4 py-3 text-sm text-body">
          <Icon name="info" size={20} className="shrink-0 text-copper" />
          <p>
            通常はエントリーからセッションを作成します。この画面は招待動線を使わないイレギュラーな面接向けです。
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-hairline bg-card">
          <div className="p-8 md:p-10">
            <h1 className="mb-8 text-2xl font-semibold tracking-tight text-ink">
              新規面接セッション作成
            </h1>
            <CandidateForm />
          </div>
        </div>
      </div>
    </main>
  );
}
