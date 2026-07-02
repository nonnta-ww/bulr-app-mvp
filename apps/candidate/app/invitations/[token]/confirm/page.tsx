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
      <NoticeScreen tone="error" title="招待リンクが無効です">
        招待リンクが無効か、既に使用されています。
      </NoticeScreen>
    );
  }

  // invitation が既に使用済みの場合
  if (row.consumedAt !== null) {
    return (
      <NoticeScreen tone="warn" title="この招待リンクは使用済みです">
        この招待リンクは既に使用されています。
      </NoticeScreen>
    );
  }

  // この募集に既にエントリー済みかを確認（UNIQUE(candidate_profile_id, opening_id)）
  // 済みの場合はフォームを出さず、最初の表示でその旨を案内する
  const existingEntries = await getEntriesByCandidateProfileId(candidateProfileId);
  const alreadyEntered = existingEntries.some((e) => e.entry.openingId === row.openingId);
  if (alreadyEntered) {
    return (
      <NoticeScreen tone="warn" title="すでにエントリー済みです">
        このポジションにはすでにエントリーが完了しています。マイページから詳細をご確認ください。
        <div className="mt-4">
          <Link
            href="/entries"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:opacity-90"
          >
            エントリー状況を見る
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>
      </NoticeScreen>
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
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-12 md:py-16">
        {/* 見出し */}
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-ink">エントリーの確認</h1>
          <p className="mt-2 text-base text-body">以下の内容でエントリーを確定します。</p>
        </header>

        {/* 履歴書未登録の警告（エントリー不可） */}
        {!hasResume && (
          <div className="mb-6 flex items-start gap-3 rounded-card border border-[#f5c6c2] bg-[#ffdad6] px-4 py-3">
            <span className="material-symbols-outlined text-[20px] text-[#93000a]" aria-hidden="true">
              warning
            </span>
            <div className="text-sm">
              <p className="font-bold text-[#93000a]">履歴書の登録が必要です</p>
              <p className="mt-1 text-[#7a0008]">
                履歴書を登録してからエントリーしてください。{' '}
                <Link href="/resume/upload" className="font-medium underline">
                  履歴書をアップロードする
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* 募集情報カード */}
        <section className="rounded-card border border-hairline bg-card p-6 shadow-ambient">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-slate">
              <span className="material-symbols-outlined" aria-hidden="true">
                business
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate">{row.companyName}</p>
              <p className="truncate text-lg font-bold text-ink">{row.openingTitle}</p>
            </div>
          </div>
        </section>

        {/* 提出準備状況 */}
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-ink">提出準備状況</h2>
          <div className="overflow-hidden rounded-card border border-hairline bg-card shadow-ambient">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="flex items-center gap-2 text-sm text-body">
                <span className="material-symbols-outlined text-slate" aria-hidden="true">
                  description
                </span>
                履歴書
              </span>
              {hasResume ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    check_circle
                  </span>
                  準備完了
                </span>
              ) : (
                <span className="rounded-full bg-[#ffdad6] px-2.5 py-0.5 text-xs font-medium text-[#93000a]">
                  未登録
                </span>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-hairline px-5 py-4">
              <span className="flex items-center gap-2 text-sm text-body">
                <span className="material-symbols-outlined text-slate" aria-hidden="true">
                  assessment
                </span>
                スキルアンケート
              </span>
              {hasSurveyResponse ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    check_circle
                  </span>
                  回答済み
                </span>
              ) : (
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
                  任意
                </span>
              )}
            </div>
          </div>
        </section>

        {/* エントリー確定 / キャンセル（履歴書登録済みの場合のみ確定可能） */}
        <div className="mt-10">
          {hasResume ? (
            <ConfirmEntryForm token={token} />
          ) : (
            <p className="text-center text-sm text-muted">
              履歴書を登録した後、このページを再度開いてエントリーしてください。
            </p>
          )}
        </div>
      </main>

      <ConfirmFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 補助: 通知スクリーン（無効/使用済み/エントリー済み）
// ---------------------------------------------------------------------------

function NoticeScreen({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'warn';
  title: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'error'
      ? 'border-[#f5c6c2] bg-[#ffdad6] text-[#93000a]'
      : 'border-primary/30 bg-primary/10 text-ink';
  return (
    <main className="mx-auto flex min-h-screen max-w-[600px] flex-col items-center justify-center px-4 py-12">
      <div className={`w-full rounded-card border px-6 py-5 ${toneClass}`}>
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
            {tone === 'error' ? 'error' : 'warning'}
          </span>
          <div className="text-sm">
            <p className="font-bold">{title}</p>
            <div className="mt-1">{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 補助: フッター
// ---------------------------------------------------------------------------

function ConfirmFooter() {
  return (
    <footer className="border-t border-hairline px-6 py-6">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 text-xs text-muted md:flex-row md:justify-between">
        <span className="text-base font-bold text-primary">bulr</span>
        <span>© 2026 bulr. All rights reserved.</span>
      </div>
    </footer>
  );
}
