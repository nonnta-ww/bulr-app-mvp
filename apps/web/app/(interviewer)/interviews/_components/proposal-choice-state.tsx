'use client';

/**
 * ProposalChoiceState Client Component
 *
 * 次の質問候補を3件表示し、面接官が選択できる画面。
 * proposal が null の場合（Prepare-2 失敗）は再試行 UI を表示する。
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Intent = 'deep_dive' | 'meta_cognition' | 'next_pattern';

interface Proposal {
  candidate_1_text: string;
  candidate_1_intent: Intent;
  candidate_2_text: string;
  candidate_2_intent: Intent;
  candidate_3_text: string;
  candidate_3_intent: Intent;
}

export interface ProposalChoiceStateProps {
  lastTurnTranscript: { candidate: string };
  lastTurnAnalysisNotes: string;
  proposal: Proposal | null;
  onChoice: (selectedIndex: 1 | 2 | 3 | null, questionText: string) => Promise<void>;
  onFinalize: () => Promise<void>;
  onRegenerate: () => Promise<void>;
  regenerating: boolean;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const INTENT_LABELS: Record<Intent, string> = {
  deep_dive: '① 深掘りを続ける',
  meta_cognition: '② メタ認知や別視点',
  next_pattern: '③ 次のパターンに進む',
};

// ---------------------------------------------------------------------------
// ProposalChoiceState Component
// ---------------------------------------------------------------------------

export function ProposalChoiceState({
  lastTurnTranscript,
  lastTurnAnalysisNotes,
  proposal,
  onChoice,
  onFinalize,
  onRegenerate,
  regenerating,
}: ProposalChoiceStateProps) {
  // 面接終了の確認ダイアログ付きハンドラ
  async function handleFinalize() {
    if (window.confirm('面接を終了しますか？')) {
      await onFinalize();
    }
  }

  return (
    <div className="space-y-6">
      {/* 候補者の回答（折りたたみ） */}
      <details className="rounded-lg border border-gray-200 bg-gray-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
          候補者の回答
        </summary>
        <div className="px-4 pb-4 pt-2">
          <p className="whitespace-pre-wrap text-sm text-gray-800">{lastTurnTranscript.candidate}</p>
        </div>
      </details>

      {/* 評価サマリー */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600">評価メモ</p>
        <p className="whitespace-pre-wrap text-sm text-gray-800">{lastTurnAnalysisNotes}</p>
      </div>

      {/* proposal あり：3候補カードと選択ボタン */}
      {proposal !== null ? (
        <div className="space-y-4">
          {/* 候補カード */}
          <div className="space-y-3">
            {/* カード 1 */}
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <span className="mb-1 inline-block rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {INTENT_LABELS[proposal.candidate_1_intent]}
              </span>
              <p className="text-sm text-gray-800">{proposal.candidate_1_text}</p>
            </div>

            {/* カード 2 */}
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <span className="mb-1 inline-block rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {INTENT_LABELS[proposal.candidate_2_intent]}
              </span>
              <p className="text-sm text-gray-800">{proposal.candidate_2_text}</p>
            </div>

            {/* カード 3 */}
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <span className="mb-1 inline-block rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {INTENT_LABELS[proposal.candidate_3_intent]}
              </span>
              <p className="text-sm text-gray-800">{proposal.candidate_3_text}</p>
            </div>
          </div>

          {/* アクションボタン群 */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChoice(1, proposal.candidate_1_text)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              ①
            </button>
            <button
              type="button"
              onClick={() => onChoice(2, proposal.candidate_2_text)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              ②
            </button>
            <button
              type="button"
              onClick={() => onChoice(3, proposal.candidate_3_text)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              ③
            </button>
            <button
              type="button"
              onClick={() => onChoice(null, '')}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              自分で次を聞く
            </button>
            <button
              type="button"
              onClick={handleFinalize}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              面接終了
            </button>
          </div>
        </div>
      ) : (
        /* proposal が null：Prepare-2 失敗時の UI */
        <div className="space-y-4">
          <p className="text-sm text-gray-600">提案生成中... 再試行してください</p>

          <div className="flex flex-wrap gap-2">
            {/* 再試行ボタン */}
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {regenerating && (
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
              再試行
            </button>

            <button
              type="button"
              onClick={() => onChoice(null, '')}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              自分で次を聞く
            </button>

            <button
              type="button"
              onClick={handleFinalize}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              面接終了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
