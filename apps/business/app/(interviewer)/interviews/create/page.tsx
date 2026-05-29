/**
 * 新規面接セッション作成ページ（Server Component）
 *
 * Requirements: 3.1, 3.7
 *
 * 認証ガード:
 *   - 1 段目: 親レイアウト `(interviewer)/layout.tsx` の `getCurrentUser()`
 *   - 2 段目: createSession Server Action 内の `authedAction()`
 *
 * 本ページでは `requireUser()` を呼ばない。
 * Next.js / Vercel が「常に redirect する route」として静的最適化してしまい、
 * `serverless-middleware` レイヤーで `cache-control: public` の 307 をキャッシュ返却し、
 * 認証済み cookie でも form に到達できない症状が出るのを回避するため。
 */

import { connection } from 'next/server';

import { CandidateForm } from '@/app/(interviewer)/interviews/_components/candidate-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function NewInterviewPage() {
  await connection();

  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">新規面接セッション作成</h1>
        <CandidateForm />
      </div>
    </main>
  );
}
