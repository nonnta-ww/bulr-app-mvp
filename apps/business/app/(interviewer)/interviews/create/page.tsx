/**
 * 新規面接セッション作成ページ（Server Component）
 *
 * Requirements: 3.1, 3.7
 *
 * 認証ガード: 親レイアウト `(interviewer)/layout.tsx` の `getCurrentUser()` チェックが
 * 1 段目（未認証なら /sign-in へ redirect）。本ページ内では `requireUser()` を呼んで
 * fail-secure 2 段目とする（CVE-2025-29927 教訓）。ただし catch + redirect を書くと
 * Next.js が「常に redirect する route」として静的最適化し、認証済み cookie でも
 * Vercel エッジで 307 をキャッシュ返却する症状が出るため、本ページでは catch を
 * 持たず requireUser() の throw をそのまま伝播させる（layout 段で redirect 済みのため
 * 実際には到達しないが、bypass 時は 500 を返して観測する）。
 */

import { connection } from 'next/server';

import { requireUser } from '@bulr/auth/server';
import { CandidateForm } from '@/app/(interviewer)/interviews/_components/candidate-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function NewInterviewPage() {
  await connection();
  await requireUser();

  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">新規面接セッション作成</h1>
        <CandidateForm />
      </div>
    </main>
  );
}
