/**
 * 募集新規作成ページ（Server Component）
 *
 * Requirements: company-and-opening 5.x, 7.4, 8.4
 */

import Link from 'next/link';
import { CreateOpeningForm } from '../_components/create-opening-form';

export default function NewOpeningPage() {
  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* パンくずナビ */}
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/openings" className="hover:text-gray-700 hover:underline">
            募集一覧
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">新規募集を作成</span>
        </nav>

        <div className="rounded-xl bg-white p-8 shadow-sm">
          <h1 className="mb-6 text-2xl font-bold text-gray-900">新規募集を作成</h1>
          <CreateOpeningForm />
        </div>
      </div>
    </main>
  );
}
