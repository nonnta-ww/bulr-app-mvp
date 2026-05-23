/**
 * 面接官向けレポートへのリンク Server Component
 *
 * Requirements: 4.8
 * Boundary: ReportLink
 */

type Props = {
  sessionId: string;
};

export function ReportLink({ sessionId }: Props) {
  return (
    <a
      href={`/interviews/${sessionId}/report`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      面接官向けレポートを別タブで開く
      <span aria-hidden="true">↗</span>
    </a>
  );
}
