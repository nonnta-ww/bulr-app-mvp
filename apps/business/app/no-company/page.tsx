/**
 * 未所属・利用停止中の企業ユーザー向けページ（Server Component）
 *
 * 会社に未所属、または所属会社が一時停止・解約中の企業ユーザーに
 * 状況を明示する専用ページ。
 *
 * company-user-invitation Requirements: 5.1, 5.2, 5.3, 5.4
 *
 * ゲートロジック:
 * - 未認証 → /sign-in へリダイレクト (Req 5.4)
 * - 認証済みで状態を導出し文言を出し分け (Req 5.1, 5.2)
 * - 所属会社がアクティブな場合は /openings へリダイレクト (Req 5.5)
 */

import { redirect } from 'next/navigation';

import { requireUser } from '@bulr/auth/server';
import { AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { company, userProfile } from '@bulr/db/schema';
import { eq } from 'drizzle-orm';

import type { CompanyStatus } from '@bulr/db/schema';
import { deriveNoCompanyState } from './no-company-state';
import type { NoCompanyState } from './no-company-state';

// re-export で page.test.ts から import できるようにする
export { deriveNoCompanyState } from './no-company-state';
export type { NoCompanyState } from './no-company-state';

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default async function NoCompanyPage() {
  // 認証ガード: 未認証は /sign-in へリダイレクト (Req 5.3, 5.4)
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch (err) {
    if (err instanceof AuthError) {
      // UNAUTHORIZED / SESSION_EXPIRED → サインインへ
      redirect('/sign-in');
    }
    throw err;
  }

  // user_profile を取得して companyId を確認する
  const [profile] = await db
    .select({ companyId: userProfile.companyId })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);

  // company のステータスを取得する（companyId がある場合のみ）
  let rawCompanyStatus: CompanyStatus | null = null;
  if (profile?.companyId) {
    const [companyRow] = await db
      .select({ status: company.status })
      .from(company)
      .where(eq(company.id, profile.companyId))
      .limit(1);
    rawCompanyStatus = (companyRow?.status ?? null) as CompanyStatus | null;
  }

  const state = deriveNoCompanyState({
    companyId: profile?.companyId ?? null,
    companyStatus: rawCompanyStatus,
  });

  // 会社がアクティブな場合は /openings へ誘導する (Req 5.5)
  if (state === 'active') {
    redirect('/openings');
  }

  // 状態に応じたコンテンツを定義する
  const content = getContent(state);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="text-[32px] font-bold tracking-tight text-ink">bulr</span>
        </div>
        <div className="rounded-xl border border-hairline bg-card p-8 shadow-sm">
          <div className="mb-4 text-center">
            <span className="text-4xl" role="img" aria-label={content.iconLabel}>
              {content.icon}
            </span>
          </div>
          <h1 className="mb-3 text-center text-xl font-semibold text-ink">{content.title}</h1>
          <p className="text-center text-sm leading-relaxed text-muted">{content.description}</p>
          {content.action && (
            <div className="mt-6 text-center">
              <a
                href={content.action.href}
                className="text-sm font-medium text-ink underline underline-offset-4 hover:opacity-70"
              >
                {content.action.label}
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// コンテンツ定義（状態別）
// ---------------------------------------------------------------------------

interface PageContent {
  icon: string;
  iconLabel: string;
  title: string;
  description: string;
  action?: { href: string; label: string };
}

function getContent(state: Exclude<NoCompanyState, 'active'>): PageContent {
  switch (state) {
    case 'unassociated':
      return {
        icon: '📭',
        iconLabel: '未所属',
        title: 'アカウントが会社に紐付いていません',
        description:
          '現在、あなたのアカウントはいずれの会社にも所属していません。' +
          '管理者から招待リンクが届いたら、リンクから受諾することで会社に参加できます。' +
          '招待が届いていない場合は、管理者にお問い合わせください。',
        action: { href: '/interviews', label: '面接一覧を見る' },
      };
    case 'suspended':
      return {
        icon: '⏸️',
        iconLabel: '一時停止',
        title: '所属会社が一時停止中です',
        description:
          '現在、所属会社のアカウントは一時停止されています。' +
          '一時停止中は会社の機能を利用できません。' +
          '詳細については管理者にお問い合わせください。',
      };
    case 'terminated':
      return {
        icon: '🔒',
        iconLabel: '解約済み',
        title: '所属会社の契約が終了しました',
        description:
          '所属会社の契約が終了しているため、会社の機能を利用できません。' +
          '詳細については管理者にお問い合わせください。',
      };
  }
}
