/**
 * 面接官情報表示コンポーネント
 *
 * Server Component。セッション詳細ページで面接官の基本情報を表示する。
 * roleInOrg が存在する場合のみ追加表示する。
 *
 * Requirements: 4.4, 11.5
 * Boundary: InterviewerDisplay (this file only)
 */

import type { SessionDetailInterviewer } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  interviewer: SessionDetailInterviewer;
};

// ---------------------------------------------------------------------------
// ヘルパーコンポーネント
// ---------------------------------------------------------------------------

/** 定義リスト行（ラベル + 値） */
function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1.5">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

/**
 * 面接官情報を定義リスト形式で表示する Server Component。
 *
 * - displayName / email を常に表示
 * - roleInOrg は値が存在する場合のみ表示
 */
export function InterviewerDisplay({ interviewer }: Props) {
  return (
    <section aria-labelledby="interviewer-display-heading">
      <h2
        id="interviewer-display-heading"
        className="mb-3 text-base font-semibold text-gray-900"
      >
        面接官情報
      </h2>
      <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-4">
        <Term label="氏名">{interviewer.displayName}</Term>
        {interviewer.roleInOrg !== null && interviewer.roleInOrg !== undefined && (
          <Term label="役職">{interviewer.roleInOrg}</Term>
        )}
        <Term label="メールアドレス">
          <a
            href={`mailto:${interviewer.email}`}
            className="text-blue-600 hover:underline"
          >
            {interviewer.email}
          </a>
        </Term>
      </dl>
    </section>
  );
}
