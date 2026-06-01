/**
 * エントリー確認画面（Server Component）
 *
 * /invitations/[token]/confirm にアクセスした認証済み候補者が
 * エントリー内容を確認して確定できる画面。
 *
 * - requireCandidate() でガード
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 * - pending_invitation_token cookie と URL の token を照合
 * - invitation (consumed_at IS NULL) + opening + company を取得して表示
 * - 履歴書・スキルアンケートの登録状況を表示
 * - ConfirmEntryForm（Client Component）で createEntry を呼び出す
 *
 * Requirements: entry-flow 4.1, 4.2, 4.3, 4.4
 */

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { invitation, opening, company, skillSurvey } from '@bulr/db/schema';
import {
  getPrimaryResumeDocument,
  getLatestResponseByCandidateProfileId,
  getEntriesByCandidateProfileId,
} from '@bulr/db';

import { ConfirmEntryForm } from './_components/confirm-entry-form';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ConfirmEntryPage({ params }: PageProps) {
  const { token } = await params;

  // 認証ガード
  let candidateProfileId: string;
  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') redirect(`/sign-in?token=${encodeURIComponent(token)}`);
      if (err.code === 'CANDIDATE_PROFILE_MISSING') redirect('/onboarding');
    }
    throw err;
  }

  // pending_invitation_token cookie の取得（__Secure- プレフィックス両名フォールバック）
  const cookieStore = await cookies();
  const tokenCookie =
    cookieStore.get('__Secure-pending_invitation_token') ??
    cookieStore.get('pending_invitation_token');

  // cookie と URL の token 不一致チェック
  if (!tokenCookie || tokenCookie.value !== token) {
    notFound();
  }

  // invitation + opening + company を JOIN で取得
  const rows = await db
    .select({
      invitationId: invitation.id,
      consumedAt: invitation.consumedAt,
      openingId: opening.id,
      openingTitle: opening.title,
      companyId: company.id,
      companyName: company.name,
    })
    .from(invitation)
    .innerJoin(opening, eq(invitation.openingId, opening.id))
    .innerJoin(company, eq(opening.companyId, company.id))
    .where(eq(invitation.token, token))
    .limit(1);

  const row = rows[0];

  // invitation が見つからない場合
  if (!row) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-5">
          <p className="text-sm text-red-700">招待リンクが無効か既に使用されています。</p>
        </div>
      </main>
    );
  }

  // invitation が既に使用済みの場合
  if (row.consumedAt !== null) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-6 py-5">
          <p className="text-sm text-yellow-800">この招待リンクは既に使用されています。</p>
        </div>
      </main>
    );
  }

  // この募集に既にエントリー済みかを確認（UNIQUE(candidate_profile_id, opening_id)）
  // 済みの場合はフォームを出さず、最初の表示でその旨を案内する
  const existingEntries = await getEntriesByCandidateProfileId(candidateProfileId);
  const alreadyEntered = existingEntries.some((e) => e.entry.openingId === row.openingId);
  if (alreadyEntered) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-6 py-5">
          <p className="mb-3 text-sm text-yellow-800">この募集には既にエントリー済みです。</p>
          <Link href="/entries" className="text-sm text-blue-600 underline hover:text-blue-800">
            エントリー一覧を見る
          </Link>
        </div>
      </main>
    );
  }

  // 履歴書（primary）の有無を取得
  const primaryResume = await getPrimaryResumeDocument(candidateProfileId, '履歴書');

  // スキルアンケート回答の有無を取得（backend アクティブ survey）
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(and(eq(skillSurvey.jobType, 'backend'), eq(skillSurvey.isActive, true)))
    .limit(1);

  const skillSurveyResponse = survey
    ? await getLatestResponseByCandidateProfileId(candidateProfileId, survey.id)
    : null;

  const hasResume = primaryResume !== null;
  const hasSurveyResponse = skillSurveyResponse !== null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">エントリー確認</h1>

      {/* 募集情報 */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white px-6 py-5 shadow-sm">
        <h2 className="mb-4 text-lg font-medium text-gray-800">募集情報</h2>
        <dl className="space-y-2">
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-sm text-gray-500">企業名</dt>
            <dd className="text-sm text-gray-900">{row.companyName}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-sm text-gray-500">募集名</dt>
            <dd className="text-sm text-gray-900">{row.openingTitle}</dd>
          </div>
        </dl>
      </section>

      {/* 候補者の登録状況 */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white px-6 py-5 shadow-sm">
        <h2 className="mb-4 text-lg font-medium text-gray-800">登録状況</h2>
        <ul className="space-y-3">
          <li className="flex items-center justify-between">
            <span className="text-sm text-gray-700">履歴書</span>
            {hasResume ? (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                登録済み
              </span>
            ) : (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                未登録
              </span>
            )}
          </li>
          <li className="flex items-center justify-between">
            <span className="text-sm text-gray-700">スキルアンケート</span>
            {hasSurveyResponse ? (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                回答済み
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                未回答
              </span>
            )}
          </li>
        </ul>
      </section>

      {/* 履歴書未登録の警告 */}
      {!hasResume && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">
            履歴書を登録してからエントリーしてください。{' '}
            <Link href="/resume/upload" className="underline hover:text-red-900">
              履歴書をアップロードする
            </Link>
          </p>
        </div>
      )}

      {/* スキルアンケート未回答の案内（任意） */}
      {!hasSurveyResponse && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-700">
            スキルアンケートに回答することをお勧めします。{' '}
            <Link href="/skill-survey" className="underline hover:text-blue-900">
              スキルアンケートに回答する
            </Link>
          </p>
        </div>
      )}

      {/* エントリー確定フォーム（履歴書登録済みの場合のみ表示） */}
      {hasResume ? (
        <ConfirmEntryForm token={token} />
      ) : (
        <p className="text-sm text-gray-500">履歴書を登録した後、このページを再度開いてエントリーしてください。</p>
      )}
    </main>
  );
}
