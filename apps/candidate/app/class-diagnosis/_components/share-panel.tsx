'use client';

/**
 * share-panel.tsx — RPG クラス診断の共有パネル（task 8.3 / R5.1/5.2）
 *
 * 確定診断（ClassResult）から、クラス名と称号ラベルのみで構成した共有テキストを生成し、
 * プレビューとコピー/共有ボタンを表示する。
 *
 * - toShareText は純関数。className と TITLE_LABELS[title]、主職掌ラベル、固定ブラーブ／
 *   ハッシュタグのみで構成する（R5.1）。候補者識別子・回答ラベル・vocationVector 数値・
 *   confidence 等の PII や数値は一切含めない（R5.2）。
 * - ボタン押下で navigator.clipboard.writeText（存在時のみ）へ共有テキストをコピーし、
 *   Web Share API が使えれば併用する。いずれも存在しない環境でもクラッシュしない。
 *
 * Zenith デザイントークン（rounded-card / border-hairline / bg-card / text-muted）を用い、
 * テーマトークン非依存の配色は明示 Tailwind クラスで指定する（candidate の運用方針）。
 *
 * Boundary: SharePanel, toShareText
 * Requirements: 5.1, 5.2
 */

import { useCallback, useState } from 'react';

import type { ClassResult } from '@bulr/types';

import { TITLE_LABELS } from '../_lib/definitions';
import { ARCHETYPES } from '../_lib/archetype/definitions';
import { resolveArchetype } from '../_lib/archetype/resolve';

/** 共有テキストに付ける固定ブラーブ（PII・数値なし）。 */
const SHARE_HASHTAG = '#Webエンジニアクラス診断';
const SHARE_BLURB = 'あなたのWebエンジニアとしてのクラスは？';

/**
 * 共有テキストを組成する純関数（R5.1/5.2）。
 * クラス名・称号ラベル・主職掌ラベル・固定ブラーブ／ハッシュタグのみで構成する。
 * 候補者識別子・回答内容・vocationVector 数値・confidence 等の PII や数値は含めない。
 */
export function toShareText(result: ClassResult): string {
  const titleLabel = TITLE_LABELS[result.title];
  // 主役アーキタイプを既存フィールドから導出（spec: diagnosis-archetypes, R7）。
  const archetype = ARCHETYPES[resolveArchetype(result)];

  return [
    `私のタイプは「${archetype.name}」！`,
    `（${result.className} / 称号: ${titleLabel}）`,
    SHARE_BLURB,
    SHARE_HASHTAG,
  ].join('\n');
}

interface SharePanelProps {
  result: ClassResult;
}

/**
 * 共有パネル。共有テキストのプレビューとコピー/共有ボタンを表示する。
 * クリップボード／Web Share API が使えない環境でもクラッシュしない。
 */
export function SharePanel({ result }: SharePanelProps) {
  const [copied, setCopied] = useState(false);
  const shareText = toShareText(result);

  const handleShare = useCallback(async () => {
    let didCopy = false;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        didCopy = true;
      }
    } catch {
      // クリップボード不可（権限拒否等）でもクラッシュさせない。
    }

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ text: shareText });
        didCopy = true;
      }
    } catch {
      // 共有キャンセル／未対応でもクラッシュさせない。
    }

    if (didCopy) {
      setCopied(true);
    }
  }, [shareText]);

  return (
    <section
      className="rounded-card border border-hairline bg-card p-6"
      aria-label="診断結果の共有"
      data-testid="share-panel"
    >
      <h3 className="text-lg font-semibold text-gray-900">結果をシェア</h3>
      <p className="mt-1 text-sm text-muted">
        クラス名と称号だけを共有します（回答内容は含まれません）。
      </p>

      <pre
        className="mt-4 whitespace-pre-wrap rounded-card bg-orange-50 p-3 text-sm text-gray-800"
        data-testid="share-panel-preview"
      >
        {shareText}
      </pre>

      <button
        type="button"
        onClick={handleShare}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        data-testid="share-panel-button"
      >
        <span aria-hidden="true">🔗</span>
        共有テキストをコピー
      </button>

      {copied ? (
        <p
          className="mt-2 text-sm font-medium text-green-700"
          role="status"
          data-testid="share-panel-copied"
        >
          コピーしました
        </p>
      ) : null}
    </section>
  );
}
