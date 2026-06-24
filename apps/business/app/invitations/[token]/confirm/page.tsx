/**
 * 会社招待受諾確認ページ（Server Component）
 *
 * /invitations/[token]/confirm にアクセスした認証済み企業ユーザーが
 * 招待内容を確認して受諾できる画面。
 *
 * - requireUser() でガード（requireCompanyUser ではない — 受諾前は未所属が正常）
 *   - UNAUTHORIZED / SESSION_EXPIRED → /sign-in?token=
 * - pending_invitation_token cookie と URL の token を照合
 * - company_user_invitation + company を JOIN で取得し、status / 期限 / 会社status を確認
 * - 状態に応じて理由メッセージ または ConfirmInvitationForm を表示
 *
 * Requirements: company-user-invitation 2.3, 2.6
 */

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';

import { requireUser, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { companyUserInvitation, company } from '@bulr/db/schema';

import { ConfirmInvitationForm } from './_components/confirm-invitation-form';

interface PageProps {
  params: Promise<{ token: string }>;
}

/** 役割コードを日本語ラベルに変換する */
function roleLabel(role: string): string {
  if (role === 'admin') return '管理者';
  if (role === 'member') return 'メンバー';
  return role;
}

export default async function ConfirmCompanyInvitationPage({ params }: PageProps) {
  const { token } = await params;

  // 認証ガード（Req 2.4）
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED' || err.code === 'SESSION_EXPIRED') {
        redirect(`/sign-in?token=${encodeURIComponent(token)}`);
      }
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

  // company_user_invitation + company を JOIN で取得（Req 2.3, 2.6）
  const rows = await db
    .select({
      invitationId: companyUserInvitation.id,
      email: companyUserInvitation.email,
      roleInOrg: companyUserInvitation.roleInOrg,
      status: companyUserInvitation.status,
      expiresAt: companyUserInvitation.expiresAt,
      companyId: companyUserInvitation.companyId,
      companyName: company.name,
      companyStatus: company.status,
    })
    .from(companyUserInvitation)
    .innerJoin(company, eq(company.id, companyUserInvitation.companyId))
    .where(eq(companyUserInvitation.token, token))
    .limit(1);

  const row = rows[0];

  // invitation が見つからない場合（Req 2.3）
  if (!row) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-xl border border-hairline bg-card px-8 py-10 shadow-sm">
          <p className="text-sm text-red-700">招待リンクが無効です。</p>
        </div>
      </main>
    );
  }

  // status チェック（Req 2.3）
  if (row.status === 'revoked') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-xl border border-hairline bg-card px-8 py-10 shadow-sm">
          <p className="text-sm text-yellow-800">この招待は取り消されています。</p>
        </div>
      </main>
    );
  }

  if (row.status === 'accepted') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-xl border border-hairline bg-card px-8 py-10 shadow-sm">
          <p className="text-sm text-yellow-800">この招待は既に使用されています。</p>
        </div>
      </main>
    );
  }

  // 期限チェック（Req 2.3）
  if (row.expiresAt <= new Date()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-xl border border-hairline bg-card px-8 py-10 shadow-sm">
          <p className="text-sm text-red-700">この招待リンクは有効期限が切れています。</p>
        </div>
      </main>
    );
  }

  // 会社ステータスチェック（Req 2.6）
  if (row.companyStatus !== 'active') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-xl border border-hairline bg-card px-8 py-10 shadow-sm">
          <p className="text-sm text-red-700">会社が利用停止中のため受諾できません。</p>
        </div>
      </main>
    );
  }

  // 有効な招待 — 受諾フォームを表示
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="text-[32px] font-bold tracking-tight text-ink">bulr</span>
        </div>

        <div className="rounded-xl border border-hairline bg-card px-8 py-10 shadow-sm">
          <h1 className="mb-6 text-xl font-semibold text-ink">会社への招待</h1>

          <section className="mb-8 space-y-3">
            <div className="flex items-start gap-4">
              <dt className="w-20 shrink-0 text-sm text-muted">会社名</dt>
              <dd className="text-sm font-medium text-ink">{row.companyName}</dd>
            </div>
            <div className="flex items-start gap-4">
              <dt className="w-20 shrink-0 text-sm text-muted">役割</dt>
              <dd className="text-sm font-medium text-ink">{roleLabel(row.roleInOrg)}</dd>
            </div>
          </section>

          <ConfirmInvitationForm token={token} />
        </div>
      </div>
    </main>
  );
}
