/**
 * 募集新規作成ページ（Server Component）
 *
 * Requirements: company-and-opening 5.x, 7.4, 8.4
 */

import Link from 'next/link';

import { Icon } from '@/components/ui/icon';
import { CreateOpeningForm } from '../_components/create-opening-form';

export default function NewOpeningPage() {
  return (
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-3xl">
        {/* パンくずナビ */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted">
          <Link href="/openings" className="hover:text-ink">
            募集
          </Link>
          <Icon name="chevron_right" size={16} className="text-hairline-strong" />
          <span className="text-ink">新規作成</span>
        </nav>

        <div className="overflow-hidden rounded-2xl border border-hairline bg-card">
          <div className="p-8 md:p-10">
            <h1 className="mb-8 text-2xl font-semibold tracking-tight text-ink">新規募集を作成</h1>
            <CreateOpeningForm />
          </div>
        </div>
      </div>
    </main>
  );
}
