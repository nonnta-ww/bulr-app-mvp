'use server';

/**
 * setCompanyStatus — 会社ステータス遷移 Server Action
 *
 * 管理者が会社のステータスを遷移させる（一時停止 / 解約 / 再有効化）。
 * 許可遷移のみ実行し、不正遷移は INVALID_TRANSITION を返す。
 * is_active をステータスと常に同期して後方互換シャドウ列を一貫に保つ。
 *
 * 許可遷移:
 *   active → suspended
 *   active → terminated
 *   suspended → active
 *   suspended → terminated
 * 禁止: terminated からのいかなる遷移も不可（終端状態）、同一ステータスへの遷移も不可。
 *
 * Requirements: 4.2, 4.3, 4.4, 4.7, 6.1
 */

import { adminAction } from '@bulr/auth/server';
import { companyStatusSchema } from '@bulr/auth/server';
import type { CompanyStatus } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { company } from '@bulr/db/schema';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// 純粋な遷移判定は 'use server' 非依存モジュールに切り出している
// （本ファイルは 'use server' のため async 関数以外を export できない）。
import { isAllowedCompanyTransition } from './company-status-transitions';

// ---------------------------------------------------------------------------
// setCompanyStatus アクション
// ---------------------------------------------------------------------------

const setCompanyStatusSchema = z.object({
  companyId: z.string().min(1),
  status: companyStatusSchema,
});

export const setCompanyStatus = adminAction(
  setCompanyStatusSchema,
  async ({ companyId, status: targetStatus }) => {
    // -----------------------------------------------------------------------
    // 1. 現在のステータスを取得する
    // -----------------------------------------------------------------------
    const [current] = await db
      .select({ id: company.id, status: company.status })
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);

    if (!current) {
      return {
        ok: false as const,
        error: {
          code: 'NOT_FOUND',
          message: '会社が見つかりません',
        },
      };
    }

    // -----------------------------------------------------------------------
    // 2. 遷移可否チェック
    // -----------------------------------------------------------------------
    const currentStatus = current.status as CompanyStatus;

    if (!isAllowedCompanyTransition(currentStatus, targetStatus)) {
      return {
        ok: false as const,
        error: {
          code: 'INVALID_TRANSITION',
          message: '許可されていないステータス遷移です',
        },
      };
    }

    // -----------------------------------------------------------------------
    // 3. ステータスを更新する
    //    is_active は status==='active' のシャドウとして同期維持（Req 4.2, 4.3, 4.4 / design.md）
    // -----------------------------------------------------------------------
    await db
      .update(company)
      .set({
        status: targetStatus,
        isActive: targetStatus === 'active',
        updatedAt: sql`now()`,
      })
      .where(eq(company.id, companyId));

    // -----------------------------------------------------------------------
    // 4. キャッシュ無効化
    // -----------------------------------------------------------------------
    revalidatePath('/companies');
    revalidatePath(`/companies/${companyId}`);

    return { ok: true as const, data: { ok: true as const } };
  },
);
