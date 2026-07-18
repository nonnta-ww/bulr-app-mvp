'use client';

/**
 * teamwork-style-share-panel.tsx — チームワーク・スタイル診断の共有パネル（task 5.4 / R7.1-R7.4）
 *
 * アーキタイプ（Archetype）から、正式名（name）とキャッチ（catch）のみで構成した共有テキストを
 * 生成し、プレビューとコピー/共有ボタンを表示する。
 *
 * - toTeamworkStyleShareText は純関数。name / catch・固定ブラーブ／ハッシュタグのみで構成する（R7.1）。
 *   description・nextStep・軸コード・回答生データ・スコア等の PII や数値は一切含めない（R7.2）。
 * - ボタン押下で navigator.clipboard.writeText（存在時のみ）へコピーし、Web Share API が使えれば併用。
 *   いずれも存在しない環境でもクラッシュしない（R7.3）。
 * - 共有はテキストのみ。画像生成・画像共有は提供しない（R7.4）。
 *
 * Boundary: teamwork-style-share-panel
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { useCallback, useState } from 'react';

import type { Archetype } from '../../_lib/teamwork-style/archetypes';

/** 共有テキストに付ける固定ブラーブ／ハッシュタグ（PII・数字なし）。 */
const SHARE_HASHTAG = '#チームワークスタイル診断';
const SHARE_BLURB = 'あなたのチームワーク・スタイルは？';

/** name / catch だけを読む最小の入力型。 */
type ShareArchetype = Pick<Archetype, 'name' | 'catch'>;

/**
 * 共有テキストを組成する純関数（R7.1/7.2）。
 * 正式名とキャッチ・固定ブラーブ／ハッシュタグのみで構成する。
 * description・nextStep・軸コード・回答生データ・スコア等の PII や数値は含めない。
 */
export function toTeamworkStyleShareText(archetype: ShareArchetype): string {
  const lines = [
    `私のチームワーク・スタイルは「${archetype.name}（${archetype.catch}）」でした。`,
    SHARE_BLURB,
    SHARE_HASHTAG,
  ];
  return lines.join('\n');
}

interface TeamworkStyleSharePanelProps {
  archetype: Archetype;
}

/**
 * 共有パネル。共有テキストのプレビューとコピー/共有ボタンを表示する。
 * クリップボード／Web Share API が使えない環境でもクラッシュしない。
 */
export function TeamworkStyleSharePanel({
  archetype,
}: TeamworkStyleSharePanelProps) {
  const [copied, setCopied] = useState(false);
  const shareText = toTeamworkStyleShareText(archetype);

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
      data-testid="teamwork-style-share-panel"
    >
      <h3 className="text-lg font-semibold text-gray-900">結果をシェア</h3>
      <p className="mt-1 text-sm text-muted">
        タイプ名だけを共有します（回答内容は含まれません）。
      </p>

      <pre
        className="mt-4 whitespace-pre-wrap rounded-card bg-orange-50 p-3 text-sm text-gray-800"
        data-testid="teamwork-style-share-preview"
      >
        {shareText}
      </pre>

      <button
        type="button"
        onClick={handleShare}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        data-testid="teamwork-style-share-button"
      >
        <span aria-hidden="true">🔗</span>
        共有テキストをコピー
      </button>

      {copied ? (
        <p
          className="mt-2 text-sm font-medium text-green-700"
          role="status"
          data-testid="teamwork-style-share-copied"
        >
          コピーしました
        </p>
      ) : null}
    </section>
  );
}
