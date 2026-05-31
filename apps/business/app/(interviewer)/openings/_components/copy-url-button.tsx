'use client';

/**
 * CopyUrlButton — URL コピーボタン（Client Component）
 *
 * クリックすると url をクリップボードにコピーし、
 * 2 秒間「コピーしました ✓」を表示する。
 *
 * Requirements: company-and-opening 8.4
 */

import { useState } from 'react';
import { Button } from '@bulr/ui';

interface CopyUrlButtonProps {
  url: string;
}

export function CopyUrlButton({ url }: CopyUrlButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードへのアクセスが拒否された場合は何もしない
    }
  }

  return (
    <Button
      type="button"
      onClick={handleCopy}
      variant={copied ? 'default' : 'outline'}
      className={copied ? 'bg-green-600 text-white hover:bg-green-700' : undefined}
    >
      {copied ? 'コピーしました ✓' : 'URLをコピー'}
    </Button>
  );
}
