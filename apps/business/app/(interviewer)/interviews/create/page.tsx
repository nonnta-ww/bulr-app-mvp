/**
 * 新規面接セッション作成ページ（Server Component）
 *
 * Requirements: 3.1, 3.7
 */

import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { requireUser } from '@bulr/auth/server';
import { CandidateForm } from '@/app/(interviewer)/interviews/_components/candidate-form';

// requireUser() 内の headers() 呼び出しだけでは Next.js / Vercel エッジが本ページを
// 「静的に redirect する route」として最適化してしまい、認証済み cookie があっても
// `serverless-middleware` レイヤーで 307 を返してサーバレス関数まで到達しない症状が出る。
//
// 二段構えで opt-out する:
//   1. `dynamic = 'force-dynamic'` で route-level の動的化を宣言
//   2. ハンドラ先頭で `await connection()` を呼び、リクエスト毎の dynamic 評価を強制
//
// `connection()` は Next.js 15 の API で、呼び出されるとそのリクエストは確実に動的扱いになる。
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function NewInterviewPage() {
  await connection();

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
