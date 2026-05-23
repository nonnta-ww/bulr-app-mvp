import 'server-only';
export const runtime = 'nodejs';

/**
 * GET /sessions/[id]/export?format=csv|json
 *
 * apps/admin の Route Handler。monorepo-app-split Task 4.3 で apps/business から flat URL に移設。
 * 旧パス: apps/business/app/admin/sessions/[id]/export/route.ts（旧 URL: /admin/sessions/[id]/export）。
 *
 * Requirements: 8.1-8.16, 10.3, 13.5
 * _Boundary: ExportRoute_
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sessionDetailQuery } from '@bulr/db/queries/admin';
import { AuthError, requireAdmin } from '@bulr/auth/server';
import { buildCsvFromCoverages } from '@/app/_lib/csv-export';
import { buildJsonFromSession } from '@/app/_lib/json-export';

// ---------------------------------------------------------------------------
// バリデーションスキーマ
// ---------------------------------------------------------------------------

const ID_SCHEMA = z.string().min(1);
const FORMAT_SCHEMA = z.enum(['csv', 'json']);

// ---------------------------------------------------------------------------
// GET /sessions/[id]/export?format=csv|json
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // 1) Auth — requireAdmin() は Layer 2 セキュリティチェック（fail secure）
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === 'UNAUTHORIZED') {
        return new NextResponse('Unauthorized', { status: 401 });
      }
      if (e.code === 'FORBIDDEN') {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }
    throw e;
  }

  // 2) パスパラメーター id のバリデーション
  const { id: rawId } = await params;
  const idParse = ID_SCHEMA.safeParse(rawId);
  if (!idParse.success) {
    return new NextResponse('Bad Request', { status: 400 });
  }
  const id = idParse.data;

  // 3) クエリパラメーター ?format のバリデーション
  const format = request.nextUrl.searchParams.get('format');
  const formatParse = FORMAT_SCHEMA.safeParse(format);
  if (!formatParse.success) {
    return new NextResponse('Bad Request: invalid format', { status: 400 });
  }

  // 4) セッション詳細取得
  const detail = await sessionDetailQuery(id);
  if (!detail) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // 5) フォーマット別レスポンス生成
  if (formatParse.data === 'csv') {
    const body = buildCsvFromCoverages(detail);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bulr-session-${id}.csv"`,
      },
    });
  }

  // json
  const body = JSON.stringify(buildJsonFromSession(detail), null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="bulr-session-${id}.json"`,
    },
  });
}
