/**
 * 管理画面 候補者詳細ページ（apps/admin: /candidates/[id]）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * getCandidateProfileDetail でデータを取得し、基本情報・履歴書・アンケート・
 * 模擬面接履歴を表示する。[クォータリセット] / [無効化] は CandidateActionButtons に委譲。
 *
 * Requirements: 1.3, 6.1
 * Boundary: CandidateDetailPage (this file only)
 * Depends: 2.2 ✓ (getCandidateProfileDetail), 7.1 ✓ (disableCandidate), 7.2 ✓ (resetQuota)
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getCandidateProfileDetail } from '@bulr/db/queries/admin';

import { CandidateActionButtons } from '../_components/candidate-action-buttons';

// ---------------------------------------------------------------------------
// ページ Props（Next.js 16: params は Promise）
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ id: string }>;
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** Date を「YYYY-MM-DD HH:mm:ss」形式（JST）に整形する。null の場合は「—」を返す。 */
function formatTimestamp(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  })
    .format(date)
    .replace(/\//g, '-');
}

/** 定義リスト行（ラベル + 値） */
function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-2 py-1.5">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function CandidateDetailPage({ params }: PageProps) {
  // Layer 2 多層防御: 未認証・非管理者は弾く
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') {
        redirect('/sign-in');
      }
      if (err.code === 'FORBIDDEN') {
        notFound();
      }
    }
    throw err;
  }

  // params のアンラップ（Next.js 16: async）
  const { id } = await params;

  if (!id || typeof id !== 'string') {
    notFound();
  }

  // DBクエリ
  const detail = await getCandidateProfileDetail(id);
  if (!detail) {
    notFound();
  }

  const { profile, resumeDocuments, surveyResponses, mockInterviews } = detail;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* ページタイトル + 戻るリンク */}
      <div className="flex items-center gap-4">
        <Link
          href="/candidates"
          className="text-sm text-blue-600 hover:underline"
        >
          ← 候補者一覧へ
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">候補者詳細</h1>
      </div>

      {/* 基本情報 */}
      <section aria-labelledby="basic-info-heading">
        <h2
          id="basic-info-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          基本情報
        </h2>
        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-4">
          <Term label="ID">{profile.id}</Term>
          <Term label="表示名">{profile.displayName}</Term>
          <Term label="メールアドレス">{profile.email}</Term>
          <Term label="見出し">{profile.headline ?? '—'}</Term>
          <Term label="ステータス">
            {profile.isActive ? (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                有効
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                無効
              </span>
            )}
          </Term>
          <Term label="クォータリセット日時">{formatTimestamp(profile.quotaResetAt)}</Term>
          <Term label="登録日時">{formatTimestamp(profile.createdAt)}</Term>
          <Term label="更新日時">{formatTimestamp(profile.updatedAt)}</Term>
        </dl>
      </section>

      {/* アクションボタン */}
      <section aria-labelledby="actions-heading">
        <h2
          id="actions-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          管理操作
        </h2>
        <CandidateActionButtons
          candidateProfileId={profile.id}
          isActive={profile.isActive}
        />
      </section>

      {/* 履歴書ドキュメント一覧 */}
      <section aria-labelledby="resume-heading">
        <h2
          id="resume-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          履歴書ドキュメント（{resumeDocuments.length} 件）
        </h2>
        {resumeDocuments.length === 0 ? (
          <p className="text-sm text-gray-500">履歴書がありません</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">種別</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">URL</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">アップロード日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {resumeDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{doc.fileType}</td>
                    <td className="px-4 py-3">
                      <a
                        href={doc.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        ダウンロード
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatTimestamp(doc.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* アンケート回答サマリー */}
      <section aria-labelledby="survey-heading">
        <h2
          id="survey-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          スキルアンケート回答サマリー（{surveyResponses.length} 件）
        </h2>
        {surveyResponses.length === 0 ? (
          <p className="text-sm text-gray-500">アンケート回答がありません</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">サーベイ ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">職種</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">回答日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {surveyResponses.map((resp) => (
                  <tr key={resp.surveyId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{resp.surveyId}</td>
                    <td className="px-4 py-3 text-gray-700">{resp.jobType}</td>
                    <td className="px-4 py-3 text-gray-700">{formatTimestamp(resp.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 模擬面接履歴 */}
      <section aria-labelledby="mock-interview-heading">
        <h2
          id="mock-interview-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          模擬面接履歴（{mockInterviews.length} 件）
        </h2>
        {mockInterviews.length === 0 ? (
          <p className="text-sm text-gray-500">模擬面接履歴がありません</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">パターンコード</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">開始日時</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">終了日時</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ターン数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {mockInterviews.map((mi) => (
                  <tr key={mi.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{mi.patternCode}</td>
                    <td className="px-4 py-3 text-gray-700">{formatTimestamp(mi.startedAt)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatTimestamp(mi.endedAt)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{mi.turnCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
