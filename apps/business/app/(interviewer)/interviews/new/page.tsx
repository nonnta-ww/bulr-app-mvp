/**
 * 新規面接セッション作成ページ（Server Component）
 *
 * Requirements: 3.1, 3.7
 */

import { redirect } from 'next/navigation';

import { requireUser } from '@bulr/auth/server';
import { CandidateForm } from '@/app/(interviewer)/interviews/_components/candidate-form';

// requireUser() の headers() 呼び出しだけでは Next.js が静的プリレンダー判定を回避できない
// ことがあり、ビルド時の「未認証 → redirect(/sign-in)」結果がエッジでキャッシュされて
// 認証済みユーザーにも 307 を返してしまう症状が出る。force-dynamic で明示的に opt-out。
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function NewInterviewPage() {
  try {
    await requireUser();
  } catch {
    redirect('/sign-in');
  }

  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">新規面接セッション作成</h1>
        <CandidateForm />
      </div>
    </main>
  );
}
