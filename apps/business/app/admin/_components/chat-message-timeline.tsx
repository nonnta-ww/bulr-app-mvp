/**
 * インタビューターン時系列表示コンポーネント
 *
 * Server Component。セッション詳細ページで interview_turn の時系列を
 * sequence_no を視覚マーカーとした縦型タイムラインで表示する。
 *
 * Requirements: 4.5, 4.6
 * Boundary: ChatMessageTimeline (this file only)
 */

import type { InterviewTurn } from '@bulr/db/schema/interview-turn';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  turns: InterviewTurn[];
  /** pattern_id → assessment_pattern.code のルックアップマップ */
  patternCodeByPatternId?: Map<string, string>;
};

// ---------------------------------------------------------------------------
// 定数マップ
// ---------------------------------------------------------------------------

const questionSourceLabel: Record<InterviewTurn['question_source'], string> = {
  llm_candidate_1: 'LLM 候補 1',
  llm_candidate_2: 'LLM 候補 2',
  llm_candidate_3: 'LLM 候補 3',
  manual: '手動',
};

const patternMatchConfidenceLabel: Record<
  InterviewTurn['pattern_match_confidence'],
  string
> = {
  exact: '完全一致',
  inferred_high: '推定（高）',
  inferred_low: '推定（低）',
  off_pattern: 'パターン外',
};

const patternMatchConfidenceBadgeClass: Record<
  InterviewTurn['pattern_match_confidence'],
  string
> = {
  exact: 'bg-green-100 text-green-800',
  inferred_high: 'bg-blue-100 text-blue-800',
  inferred_low: 'bg-yellow-100 text-yellow-800',
  off_pattern: 'bg-red-100 text-red-800',
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * ISO 8601 文字列または Date を「YYYY-MM-DD HH:mm:ss」形式に整形する。
 */
function formatTimestamp(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '-';

  const formatted = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(date);

  // ja-JP は「2024/01/15 09:30:00」形式を返すためスラッシュをハイフンに変換
  return formatted.replace(/\//g, '-');
}

/**
 * ミリ秒を「m:ss」または「s.S 秒」形式に整形する。
 */
function formatDuration(ms: number): string {
  if (ms < 0) return '-';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}分 ${seconds.toString().padStart(2, '0')}秒`;
  }
  return `${seconds}秒`;
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

/** 定義リスト行（ラベル + 値） */
function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="text-xs text-gray-900">{children}</dd>
    </div>
  );
}

/** パターンマッチ信頼度バッジ */
function ConfidenceBadge({
  confidence,
}: {
  confidence: InterviewTurn['pattern_match_confidence'];
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${patternMatchConfidenceBadgeClass[confidence]}`}
    >
      {patternMatchConfidenceLabel[confidence]}
    </span>
  );
}

/** 個別ターンカード */
function TurnCard({
  turn,
  patternCodeByPatternId,
}: {
  turn: InterviewTurn;
  patternCodeByPatternId?: Map<string, string>;
}) {
  const candidateTranscript = turn.transcript?.candidate ?? '';

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* 質問テキスト */}
      <p className="mb-3 text-sm font-semibold text-gray-900 leading-relaxed">
        {turn.question_text}
      </p>

      {/* 候補者の発言 */}
      {candidateTranscript && (
        <blockquote className="mb-3 border-l-4 border-blue-300 bg-blue-50 px-3 py-2 text-sm text-gray-800 italic leading-relaxed">
          {candidateTranscript}
        </blockquote>
      )}

      {/* off_pattern_summary（off_pattern の場合のみ表示） */}
      {turn.pattern_match_confidence === 'off_pattern' &&
        turn.off_pattern_summary && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="font-medium">パターン外サマリー：</span>
            {turn.off_pattern_summary}
          </div>
        )}

      {/* メタ情報 */}
      <dl className="divide-y divide-gray-100">
        <DetailRow label="質問ソース">
          {questionSourceLabel[turn.question_source]}
        </DetailRow>
        <DetailRow label="パターン適合">
          <ConfidenceBadge confidence={turn.pattern_match_confidence} />
        </DetailRow>
        {turn.pattern_id !== null && turn.pattern_id !== undefined && (
          <DetailRow label="パターン ID">
            {(() => {
              const code = patternCodeByPatternId?.get(turn.pattern_id);
              return code ? (
                <span>
                  <span className="font-medium text-gray-900">{code}</span>
                  {' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono text-gray-700">
                    {turn.pattern_id}
                  </code>
                </span>
              ) : (
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono text-gray-700">
                  {turn.pattern_id}
                </code>
              );
            })()}
          </DetailRow>
        )}
        <DetailRow label="所要時間">{formatDuration(turn.duration_ms)}</DetailRow>
        <DetailRow label="記録日時">{formatTimestamp(turn.created_at)}</DetailRow>
      </dl>
    </article>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

/**
 * interview_turn の時系列を縦型タイムラインで表示する Server Component。
 *
 * - sequence_no を視覚マーカーとして表示
 * - 各ターンで question_text / question_source / candidate transcript /
 *   pattern_match_confidence / off_pattern_summary / pattern_id /
 *   duration_ms / created_at を表示
 * - off_pattern_summary は pattern_match_confidence === 'off_pattern' の場合のみ表示
 */
export function ChatMessageTimeline({ turns, patternCodeByPatternId }: Props) {
  return (
    <section aria-labelledby="chat-message-timeline-heading">
      <h2
        id="chat-message-timeline-heading"
        className="mb-4 text-base font-semibold text-gray-900"
      >
        インタビュー時系列
      </h2>

      {turns.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          ターンがありません
        </p>
      ) : (
        <ol className="relative space-y-0">
          {turns.map((turn, index) => {
            const isLast = index === turns.length - 1;
            return (
              <li key={turn.id} className="flex gap-4">
                {/* タイムラインの縦線とサークルマーカー */}
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {turn.sequence_no}
                  </div>
                  {!isLast && (
                    <div className="mt-1 w-0.5 flex-1 bg-gray-200" />
                  )}
                </div>

                {/* ターン内容 */}
                <div className={`flex-1 pb-6 ${isLast ? 'pb-0' : ''}`}>
                  <TurnCard
                    turn={turn}
                    patternCodeByPatternId={patternCodeByPatternId}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
