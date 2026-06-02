/**
 * QuotaStatus — 模擬面接の月次利用枠残数表示コンポーネント
 *
 * Server Component（presentational）。
 * - remaining > 0: 「今月の残り回数: X 回」を通常スタイルで表示
 * - remaining === 0: 「今月の上限に達しました」を警告スタイル（赤系）で表示
 *
 * Requirements: 要件1
 */

interface Props {
  remaining: number;
}

export function QuotaStatus({ remaining }: Props) {
  if (remaining === 0) {
    return (
      <p
        role="alert"
        className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
      >
        今月の上限に達しました
      </p>
    );
  }

  return (
    <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
      今月の残り回数: {remaining} 回
    </p>
  );
}
