/**
 * 新規面接セッション作成ページ（Server Component）
 *
 * Requirements: 3.1, 3.7
 *
 * 元は /interviews/new (→ /interviews/create) だったが、Vercel が `/interviews/*`
 * tree 全体に対して platform-level static redirect を出してしまい、認証済み cookie
 * でも 307 → /sign-in が返る症状が出たため、top-level (/settings と同階層) に移動。
 * 親 layout (interviewer)/layout.tsx の `redirect('/sign-in')` は `/settings` でも
 * 同じく走るが正常動作するため、tree 構造起因と判断（[sessionId] dynamic segment
 * との同居が原因の可能性）。
 */

import { redirect } from 'next/navigation';

import { requireUser } from '@bulr/auth/server';
import { CandidateForm } from '@/app/(interviewer)/interviews/_components/candidate-form';

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
