'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgendaPatternRow } from './agenda-pattern-row';
import { useSidebarPrefs } from './use-sidebar-prefs';
import type { AgendaItem } from './types';

export interface SessionAgendaSidebarProps {
  agenda: AgendaItem[];
  taskStatuses: Record<string, { status: 'streaming' | 'completed' | 'errored'; step: string }>;
  patternsDone: number;
  patternsTotal: number;
  onItemClick: (item: AgendaItem) => void;
  onAnalysisClick: (turnId: string) => void;
  onItemRetry?: (turnId: string) => void;
}

export function SessionAgendaSidebar({
  agenda,
  taskStatuses,
  patternsDone,
  patternsTotal,
  onItemClick,
  onAnalysisClick,
  onItemRetry,
}: SessionAgendaSidebarProps) {
  const { width, collapsed, setWidth, setCollapsed, MIN_WIDTH, MAX_WIDTH } = useSidebarPrefs();
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
    },
    [width],
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      setWidth(startWidthRef.current + delta);
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, setWidth]);

  const grouped = useMemo(() => {
    // patternId ごとに 1 グループにまとめる（agenda 内の出現順を保持）
    const map = new Map<string | null, { patternTitle: string; items: AgendaItem[] }>();
    for (const item of agenda) {
      const key = item.patternId;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(key, { patternTitle: item.patternTitle, items: [item] });
      }
    }
    return Array.from(map.entries()).map(([patternId, val]) => ({
      patternId,
      patternTitle: val.patternTitle,
      items: val.items,
    }));
  }, [agenda]);

  if (collapsed) {
    return (
      <aside className="flex w-9 shrink-0 flex-col items-center gap-2 border-r border-gray-200 bg-white py-2">
        <button
          type="button"
          aria-label="サイドバーを開く"
          onClick={() => setCollapsed(false)}
          className="text-base text-gray-500"
        >
          ⇥
        </button>
        <div
          className="mt-2 text-[8px] text-gray-400"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          進捗 {patternsDone}/{patternsTotal}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-gray-200 bg-white"
      style={{ width: `${width}px` }}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-xs text-gray-500">
        <span>📋 質問一覧</span>
        <div className="flex items-center gap-2">
          <span>
            {patternsDone}/{patternsTotal}
          </span>
          <button
            type="button"
            aria-label="サイドバーを閉じる"
            onClick={() => setCollapsed(true)}
            className="text-gray-400 hover:text-gray-700"
          >
            ⇤
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {grouped.map((g, i) => (
          <AgendaPatternRow
            key={g.patternId ?? `manual-${i}`}
            patternTitle={g.patternTitle}
            items={g.items}
            taskStatuses={taskStatuses}
            onItemClick={onItemClick}
            onItemAnalysisClick={onAnalysisClick}
            onItemRetry={onItemRetry}
          />
        ))}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onMouseDown={onMouseDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setWidth(width - 8);
          if (e.key === 'ArrowRight') setWidth(width + 8);
        }}
        className="absolute top-0 right-0 h-full w-1 cursor-ew-resize bg-transparent hover:bg-gray-300"
      />
    </aside>
  );
}
