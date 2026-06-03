'use client';

/**
 * 汎用テキスト検索フィルタ Client Component
 *
 * テキスト入力を受け取り、500ms デバウンス後に URL の searchParams（paramKey）を更新する。
 * router.push でページ遷移を発生させ、Server Component が新しい検索条件でデータを再取得できる。
 *
 * Requirements: 1.2, 2.2, 6.6
 * Boundary: SearchFilter (this file only)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  placeholder: string;
  paramKey?: string;
};

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function SearchFilter({ placeholder, paramKey = 'search' }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialValue = searchParams.get(paramKey) ?? '';
  const [value, setValue] = useState(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 現在の URL の全 searchParams をベースに指定キーのみ更新して push する
  const pushSearch = useCallback(
    (searchValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchValue.trim() === '') {
        params.delete(paramKey);
      } else {
        params.set(paramKey, searchValue.trim());
      }
      // 検索条件が変わったらページを 1 に戻す
      params.delete('page');
      router.push('?' + params.toString());
    },
    [router, searchParams, paramKey],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      pushSearch(newValue);
    }, 500);
  };

  // アンマウント時にタイマーをクリア
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <input
      type="search"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className="w-64 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}
