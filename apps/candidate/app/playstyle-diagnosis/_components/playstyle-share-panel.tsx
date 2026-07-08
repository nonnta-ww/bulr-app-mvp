'use client';

/**
 * playstyle-share-panel.tsx — プレイスタイル診断の共有パネル（task 4.3 / R4.1/4.2/4.3）
 *
 * 気質アーキタイプ（Archetype）から、アーキタイプ名（＋任意で shortLabel）のみで
 * 構成した共有テキストを生成し、プレビューとコピー/共有ボタンを表示する。
 *
 * - toPlaystyleShareText は純関数。archetype.name（と任意で shortLabel）・固定ブラーブ／
 *   ハッシュタグのみで構成する（R4.1）。description・nextStep・極コード・回答生データ・
 *   スコア等の PII や数値は一切含めない（R4.2）。固定ブラーブ／ハッシュタグにも数字を含めない。
 * - ボタン押下で navigator.clipboard.writeText（存在時のみ）へ共有テキストをコピーし、
 *   Web Share API が使えれば併用する。いずれも存在しない環境でもクラッシュしない。
 * - このコンポーネントは親（4.2）が full 完全性のときのみマウントする。ここでは有効な
 *   archetype を受け取ることのみを前提とする。
 *
 * Zenith デザイントークン（rounded-card / border-hairline / bg-card / text-muted）を用い、
 * テーマトークン非依存の配色は明示 Tailwind クラスで指定する（candidate の運用方針）。
 *
 * Boundary: PlaystyleSharePanel, toPlaystyleShareText
 * Requirements: 4.1, 4.2, 4.3
 */

import { useCallback, useState } from 'react';

import type { Archetype } from '../../_lib/temperament/archetypes';

/** 共有テキストに付ける固定ブラーブ／ハッシュタグ（PII・数字なし）。 */
const SHARE_HASHTAG = '#プレイスタイル診断';
const SHARE_BLURB = 'あなたの開発プレイスタイルは？';

/** name（＋任意で shortLabel）だけを読む最小の入力型。 */
type ShareArchetype = Pick<Archetype, 'name'> & Partial<Pick<Archetype, 'shortLabel'>>;

/**
 * 共有テキストを組成する純関数（R4.1/4.2）。
 * アーキタイプ名（と任意で shortLabel）・固定ブラーブ／ハッシュタグのみで構成する。
 * description・nextStep・極コード・回答生データ・スコア等の PII や数値は含めない。
 */
export function toPlaystyleShareText(archetype: ShareArchetype): string {
  const lines = [`私のプレイスタイルは「${archetype.name}」でした。`, SHARE_BLURB, SHARE_HASHTAG];
  return lines.join('\n');
}

interface PlaystyleSharePanelProps {
  archetype: Archetype;
}

/**
 * 共有パネル。共有テキストのプレビューとコピー/共有ボタンを表示する。
 * クリップボード／Web Share API が使えない環境でもクラッシュしない。
 */
export function PlaystyleSharePanel({ archetype }: PlaystyleSharePanelProps) {
  const [copied, setCopied] = useState(false);
  const shareText = toPlaystyleShareText(archetype);

  const handleShare = useCallback(async () => {
    let didShare = false;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        didShare = true;
      }
    } catch {
      // クリップボード不可（権限拒否等）でもクラッシュさせない。
    }

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ text: shareText });
        didShare = true;
      }
    } catch {
      // 共有キャンセル／未対応でもクラッシュさせない。
    }

    if (didShare) {
      setCopied(true);
    }
  }, [shareText]);

  return (
    <section
      className="rounded-card border border-hairline bg-card p-6"
      aria-label="診断結果の共有"
      data-testid="playstyle-share-panel"
    >
      <h3 className="text-lg font-semibold text-gray-900">結果をシェア</h3>
      <p className="mt-1 text-sm text-muted">
        アーキタイプ名だけを共有します（回答内容は含まれません）。
      </p>

      <pre
        className="mt-4 whitespace-pre-wrap rounded-card bg-orange-50 p-3 text-sm text-gray-800"
        data-testid="playstyle-share-preview"
      >
        {shareText}
      </pre>

      <button
        type="button"
        onClick={handleShare}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        data-testid="playstyle-share-button"
      >
        <span aria-hidden="true">🔗</span>
        共有テキストをコピー
      </button>

      {copied ? (
        <p
          className="mt-2 text-sm font-medium text-green-700"
          role="status"
          data-testid="playstyle-share-copied"
        >
          コピーしました
        </p>
      ) : null}
    </section>
  );
}
