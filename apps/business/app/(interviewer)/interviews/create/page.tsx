/**
 * DIAGNOSTIC VERSION: 一時的に CandidateForm を取り除いて Vercel エッジの
 * static redirect 化が CC import 起因か検証する。検証後は元に戻す。
 */

import { connection } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function NewInterviewPage() {
  await connection();

  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">DIAGNOSTIC: no CandidateForm</h1>
        <p className="text-gray-700">If you can see this, the static-redirect issue is caused by the CandidateForm Client Component import.</p>
      </div>
    </main>
  );
}
