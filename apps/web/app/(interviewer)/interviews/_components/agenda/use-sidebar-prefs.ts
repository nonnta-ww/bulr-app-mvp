'use client';

import { useCallback, useEffect, useState } from 'react';

const WIDTH_KEY = 'bulr.sidebar.width';
const COLLAPSED_KEY = 'bulr.sidebar.collapsed';
const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 160;
const MAX_WIDTH = 400;

export function useSidebarPrefs() {
  const [width, setWidthState] = useState<number>(DEFAULT_WIDTH);
  const [collapsed, setCollapsedState] = useState<boolean>(false);

  // mount 時に localStorage から復元（SSR では何もしない）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window.localStorage.getItem(WIDTH_KEY);
    const c = window.localStorage.getItem(COLLAPSED_KEY);
    if (w !== null) {
      const parsed = Number.parseInt(w, 10);
      if (Number.isFinite(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
        setWidthState(parsed);
      }
    }
    if (c === '1') setCollapsedState(true);
  }, []);

  const setWidth = useCallback((w: number) => {
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
    setWidthState(clamped);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WIDTH_KEY, String(clamped));
    }
  }, []);

  const setCollapsed = useCallback((c: boolean) => {
    setCollapsedState(c);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COLLAPSED_KEY, c ? '1' : '0');
    }
  }, []);

  return { width, collapsed, setWidth, setCollapsed, MIN_WIDTH, MAX_WIDTH };
}
