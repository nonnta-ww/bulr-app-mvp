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

import { Icon } from '@/components/ui/icon';

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
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'コピーしました' : 'URLをコピー'}
      aria-label={copied ? 'コピーしました' : 'URLをコピー'}
      className={
        'inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ' +
        (copied
          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
          : 'border-hairline text-muted hover:border-hairline-strong hover:bg-canvas hover:text-ink')
      }
    >
      <Icon name={copied ? 'check' : 'content_copy'} size={16} />
    </button>
  );
}
