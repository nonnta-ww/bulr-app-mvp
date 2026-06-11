'use client';

/**
 * 全文トランスクリプトタブ（話者ラベル付き時系列表示）
 *
 * - transcript_segment 由来のデータを時系列（started_at_ms 昇順、タイブレーク seq 昇順）で表示
 * - 話者ロールを日本語ラベルに変換: interviewer → 面接官 / candidate → 候補者 / unknown → 未確定
 * - セグメントが存在しない場合（旧方式セッション等）は空状態メッセージを表示
 * - speaker_label（参加者表示名）が存在する場合は併記
 *
 * Requirements: 5.4
 * Design: TranscriptView（report 配下タブ、transcript_segment 由来）
 *
 * アクセス制御注記:
 *   このコンポーネントは面接官レポートページ（/interviews/[sessionId]/report）に配置される。
 *   同ページの Server Component 層（page.tsx）で interviewer_id === user.id によるオーナーゲートが
 *   既に適用されているため、このコンポーネント自体は追加アクセス制御を持たない。
 *   管理者（admin）向けのアクセスは別アプリ（apps/admin）で提供される（本境界外）。
 */

/** transcript_segment テーブルから取得した 1 セグメントのシリアライズ可能な表現 */
export interface TranscriptSegmentData {
  seq: number;
  speakerRole: 'interviewer' | 'candidate' | 'unknown';
  speakerLabel: string | null;
  text: string;
  startedAtMs: number;
}

interface Props {
  segments: TranscriptSegmentData[];
}

/** 話者ロール → 表示ラベルの変換 */
const SPEAKER_ROLE_LABEL: Record<TranscriptSegmentData['speakerRole'], string> = {
  interviewer: '面接官',
  candidate: '候補者',
  unknown: '未確定',
};

/** started_at_ms 昇順、タイブレークは seq 昇順 */
function sortSegments(segments: TranscriptSegmentData[]): TranscriptSegmentData[] {
  return [...segments].sort((a, b) => {
    const byTime = a.startedAtMs - b.startedAtMs;
    return byTime !== 0 ? byTime : a.seq - b.seq;
  });
}

/** ミリ秒 → MM:SS 形式のタイムスタンプ（例: 02:34） */
function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0');
  const sec = (totalSec % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

export function TranscriptTab({ segments }: Props) {
  const sorted = sortSegments(segments);

  if (sorted.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        トランスクリプトがありません
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="全文トランスクリプト">
      {sorted.map((seg) => {
        const roleLabel = SPEAKER_ROLE_LABEL[seg.speakerRole];
        return (
          <li key={seg.seq} className="flex gap-3 text-sm">
            {/* タイムスタンプ */}
            <span className="shrink-0 w-12 pt-0.5 text-xs font-mono text-gray-400 select-none">
              {formatTimestamp(seg.startedAtMs)}
            </span>

            <div className="flex-1 min-w-0">
              {/* 話者ラベル行 */}
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold leading-tight ${
                    seg.speakerRole === 'interviewer'
                      ? 'bg-cyan-100 text-cyan-800'
                      : seg.speakerRole === 'candidate'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {roleLabel}
                </span>
                {seg.speakerLabel !== null && (
                  <span className="text-xs text-gray-400 truncate">
                    {seg.speakerLabel}
                  </span>
                )}
              </div>

              {/* 転写テキスト */}
              <p className="text-gray-800 leading-relaxed break-words">{seg.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
