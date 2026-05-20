'use client';

/**
 * パターン詳細ドリルダウンパネル（右からスライドイン）
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §7
 */

import { useEffect, useRef } from 'react';
import type { HeatmapData } from '@bulr/types/evaluation';
import type { InterviewTurn } from '@bulr/db/schema';
import { DIMENSION_LABEL, DIMENSION_ORDER } from '@/lib/heatmap-benchmarks';
import { STUCK_TYPE_LABEL } from '@/lib/stuck-type-label';

type Pattern = HeatmapData['patterns'][number];

interface Props {
  pattern: Pattern | null;
  relatedTurns: InterviewTurn[];
  onClose: () => void;
}

export function PatternDetailPanel({ pattern, relatedTurns, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc で閉じる & パネルが開いたら閉じるボタンにフォーカス
  useEffect(() => {
    if (!pattern) return;
    // Move focus to close button when panel opens
    closeRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pattern, onClose]);

  if (!pattern) return null;

  const stuckType = pattern.stuck_type;

  return (
    <>
      {/* 背景クリックで閉じる */}
      <div
        data-report-detail-backdrop
        className="fixed inset-0 z-40 bg-black/10"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        data-report-detail-panel
        role="dialog"
        aria-modal="false"
        aria-label={`${pattern.pattern_code} ${pattern.pattern_title}`}
        className="fixed right-0 top-0 z-50 flex h-full w-80 max-w-[90vw] flex-col overflow-y-auto border-l border-gray-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="font-mono text-xs font-bold text-cyan-700">{pattern.pattern_code}</p>
            <h3 className="text-lg font-semibold text-gray-900">{pattern.pattern_title}</h3>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 p-4 text-sm leading-relaxed">
          {/* スコア */}
          <section className="mb-4 rounded bg-sky-50 p-3 text-sky-900">
            <div className="mb-1 flex justify-between">
              <span>到達段階</span>
              <span className="font-bold">L{pattern.level_reached}</span>
            </div>
            {stuckType && (
              <div className="mb-2 rounded bg-white px-2 py-1 text-center text-xs font-semibold text-gray-700">
                詰まり: {STUCK_TYPE_LABEL[stuckType]}
              </div>
            )}
            {DIMENSION_ORDER.map((dim) => (
              <div key={dim} className="my-0.5 flex justify-between">
                <span>{DIMENSION_LABEL[dim]}</span>
                <span className="font-bold tabular-nums">{pattern.scores[dim]}</span>
              </div>
            ))}
          </section>

          {/* 関連ターン */}
          <section className="mb-4">
            <h4 className="mb-2 text-xs uppercase tracking-wide text-gray-500">
              関連ターン ({relatedTurns.length}件)
            </h4>
            {relatedTurns.length === 0 ? (
              <p className="italic text-gray-400">関連ターンなし</p>
            ) : (
              <div className="space-y-1">
                {relatedTurns.map((t) => (
                  <div key={t.id} className="rounded bg-gray-50 px-2 py-1">
                    <p className="text-xs text-gray-500">Q{t.sequence_no}</p>
                    <p className="text-gray-700">{t.question_text}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* notes */}
          <section>
            <h4 className="mb-2 text-xs uppercase tracking-wide text-gray-500">
              評価メモ
            </h4>
            <div className="rounded bg-gray-50 p-2 text-gray-700 whitespace-pre-wrap">
              {pattern.notes || '（メモなし）'}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
