/**
 * 面接官向けレポートへのリンク Server Component
 *
 * Wave 1 monorepo-app-split 以降、面接後レポートは apps/business 側にのみ存在する。
 * admin (`:3022`) から相対 path で書くと自分自身に飛んでしまうため、
 * cross-app URL を環境変数 `BUSINESS_BASE_URL` から prepend する。
 *
 * - ローカル dev: `BUSINESS_BASE_URL=http://localhost:3021`
 * - 本番 (Vercel): admin プロジェクトの環境変数で `https://bz.bulr.net` 等を設定
 * - 未設定時は相対 path にフォールバック（同一ドメイン構成でも動くように）
 *
 * Requirements: 4.8
 * Boundary: ReportLink
 */

type Props = {
  sessionId: string;
};

export function ReportLink({ sessionId }: Props) {
  const base = process.env.BUSINESS_BASE_URL ?? '';
  const href = `${base}/interviews/${sessionId}/report`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      面接官向けレポートを別タブで開く
      <span aria-hidden="true">↗</span>
    </a>
  );
}
