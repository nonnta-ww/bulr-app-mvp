/**
 * 新規面接セッション作成ページ（Server Component）
 *
 * Requirements: 3.1, 3.7
 */

import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/guards';
import { CandidateForm } from '@/app/(interviewer)/interviews/_components/candidate-form';

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
