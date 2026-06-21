/**
 * 募集編集ページ（Server Component）
 *
 * 認証 + 企業所属確認を行い、id AND companyId で opening を取得する。
 * 他社・存在しない opening は notFound()。現在値を OpeningForm に渡す。
 *
 * Design: docs/superpowers/specs/2026-06-21-opening-edit-design.md
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';

import { requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { opening } from '@bulr/db/schema';

import { Icon } from '@/components/ui/icon';
import { OpeningForm } from '../../_components/opening-form';

interface PageProps {
  params: Promise<{ openingId: string }>;
}

export default async function EditOpeningPage({ params }: PageProps) {
  const { openingId } = await params;

  let companyId: string;
  try {
    const result = await requireCompanyUser();
    companyId = result.companyId;
  } catch (e) {
    if (e instanceof AuthError) {
      redirect('/sign-in');
    }
    redirect('/sign-in');
  }

  const [ownedOpening] = await db
    .select()
    .from(opening)
    .where(and(eq(opening.id, openingId), eq(opening.companyId, companyId)))
    .limit(1);

  if (!ownedOpening) notFound();

  return (
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-3xl">
        {/* パンくずナビ */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted">
          <Link href="/openings" className="hover:text-ink">
            募集
          </Link>
          <Icon name="chevron_right" size={16} className="text-hairline-strong" />
          <Link href={`/openings/${openingId}`} className="max-w-[16rem] truncate hover:text-ink">
            {ownedOpening.title}
          </Link>
          <Icon name="chevron_right" size={16} className="text-hairline-strong" />
          <span className="text-ink">編集</span>
        </nav>

        <div className="overflow-hidden rounded-2xl border border-hairline bg-card">
          <div className="p-8 md:p-10">
            <h1 className="mb-8 text-2xl font-semibold tracking-tight text-ink">募集を編集</h1>
            <OpeningForm
              mode="edit"
              openingId={openingId}
              defaultValues={{
                title: ownedOpening.title,
                description: ownedOpening.description ?? '',
                status: ownedOpening.status,
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
