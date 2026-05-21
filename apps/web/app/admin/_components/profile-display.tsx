/**
 * 候補者情報表示コンポーネント
 *
 * Server Component。セッション詳細ページで候補者の基本情報を表示する。
 * email が存在する場合のみ追加表示する。
 *
 * Requirements: 4.3, 11.5
 * Boundary: ProfileDisplay (this file only)
 */

import type { CandidateInfo } from '@bulr/types/profile';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  candidate: CandidateInfo;
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
 * 候補者情報を定義リスト形式で表示する Server Component。
 *
 * - name / applied_role / background_summary を常に表示
 * - email は値が存在する場合のみ表示
 */
export function ProfileDisplay({ candidate }: Props) {
  return (
    <section aria-labelledby="profile-display-heading">
      <h2
        id="profile-display-heading"
        className="mb-3 text-base font-semibold text-gray-900"
      >
        候補者情報
      </h2>
      <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-4">
        <Term label="氏名">{candidate.name}</Term>
        <Term label="応募ポジション">{candidate.appliedRole}</Term>
        <Term label="バックグラウンド">
          <span className="whitespace-pre-wrap">{candidate.backgroundSummary}</span>
        </Term>
        {candidate.email !== undefined && (
          <Term label="メールアドレス">
            <a
              href={`mailto:${candidate.email}`}
              className="text-blue-600 hover:underline"
            >
              {candidate.email}
            </a>
          </Term>
        )}
      </dl>
    </section>
  );
}
