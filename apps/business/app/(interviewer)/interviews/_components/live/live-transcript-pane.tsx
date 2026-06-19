'use client';

/**
 * LiveTranscriptPane — 話者ラベル付きライブトランスクリプト表示ペイン
 *
 * 責務:
 *  - 話者ロール（面接官/候補者/未確定）ラベルと転写テキストの逐次表示（Req 2.1, 2.2, 2.3）
 *  - セグメント追加時の自動スクロール（Req 2.1）
 *  - 文字起こし遅延インジケータ（staleTranscript=true 時）（Req 2.5）
 *
 * # 自動スクロール方式
 *
 * - 内部の `bottomRef`（`<div>` アンカー要素）に `scrollIntoView` を呼ぶ。
 * - `useEffect` の依存配列を `[segments.length]` にすることで、セグメント数が変化した
 *   ときのみ実行する（テキスト内容変化・stale 変化では実行しない）。
 * - `bottomRef.current?.scrollIntoView` の存在チェックを行ってから呼ぶ。
 *   jsdom は scrollIntoView を実装しないが、テストでは `Element.prototype.scrollIntoView`
 *   を `vi.fn()` に差し替えることでスパイ可能。本番（ブラウザ）では常に存在する。
 *
 * # Props 設計（props-driven / propsドリブン）
 *
 * - 状態はすべて親（LiveCaptureRunner / use-live-state）から渡す。
 *   このコンポーネントはポーリングや内部タイマーを持たない。
 *   → Req 8.2 の「DB 真実源 / クライアントに進行状態を持たない」方針を構造で保証。
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5
 * Design: LiveCaptureRunner / … LiveTranscriptPane / … (Components and Interfaces)
 *         / Requirements Traceability 行 2.1, 2.2, 2.3, 2.5
 */

import { useEffect, useRef } from 'react';
import type { LiveSegment } from '../../../../../lib/capture/live-state';

// ---------------------------------------------------------------------------
// ロケール定数（アプリ別文面 — 設計方針: コピーは app 側に持つ）
// ---------------------------------------------------------------------------

/** 話者ロール → 表示ラベル（Req 2.2, 2.3） */
const SPEAKER_ROLE_LABELS: Record<LiveSegment['speakerRole'], string> = {
  interviewer: '面接官',
  candidate: '候補者',
  unknown: '未確定',
} as const;

/** staleTranscript 時の遅延通知文言（Req 2.5） */
const STALE_TRANSCRIPT_MESSAGE = '転写が遅延しています';

/** 話者ロール → スピーカーチップの Tailwind カラークラス（Req 2.2, 2.3） */
const SPEAKER_ROLE_CHIP_CLASSES: Record<LiveSegment['speakerRole'], string> = {
  interviewer: 'bg-nav-active text-nav-active-ink',
  candidate: 'bg-emerald-50 text-emerald-700',
  unknown: 'bg-gray-100 text-gray-500',
} as const;

/** 話者ロール → 吹き出しの配置・配色（Req 2.2, 2.3） */
const SPEAKER_ROLE_BUBBLE_CLASSES: Record<LiveSegment['speakerRole'], string> = {
  interviewer: 'items-end',
  candidate: 'items-start',
  unknown: 'items-start',
} as const;

const SPEAKER_ROLE_BUBBLE_BODY: Record<LiveSegment['speakerRole'], string> = {
  interviewer: 'bg-navy text-white',
  candidate: 'border border-hairline bg-canvas text-ink',
  unknown: 'border border-dashed border-hairline-strong bg-canvas text-body',
} as const;

// ---------------------------------------------------------------------------
// Props 型
// ---------------------------------------------------------------------------

export interface LiveTranscriptPaneProps {
  /**
   * 表示するトランスクリプトセグメントの配列。
   * seq 昇順（到着順）で格納されることを前提とする。
   * 親（LiveCaptureRunner / use-live-state）がポーリングで更新し、
   * 新セグメントが末尾に追加されることで逐次表示が実現する（Req 2.1）。
   */
  segments: LiveSegment[];

  /**
   * トランスクリプトが停滞しているかどうか（Req 2.5）。
   * live-state の staleTranscript を直接渡す。
   * true の場合に「転写が遅延しています」通知を表示する。
   */
  staleTranscript: boolean;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * LiveTranscriptPane
 *
 * 話者ロール別ラベルとテキストを逐次表示するプレゼンテーションコンポーネント。
 * 'use client' だがクライアント進行状態は一切持たない（8.2 の方針継承）。
 */
export function LiveTranscriptPane({
  segments,
  staleTranscript,
}: LiveTranscriptPaneProps) {
  // -------------------------------------------------------------------------
  // 自動スクロール（Req 2.1）
  //
  // segments.length が変化したときのみ実行する。
  // bottomRef の scrollIntoView の存在を確認してから呼ぶことで jsdom に耐性を持たせる。
  // テストでは Element.prototype.scrollIntoView を vi.fn() に差し替えてスパイする。
  // -------------------------------------------------------------------------
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current?.scrollIntoView) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    // 新着セグメント到着時のみ自動スクロールするため segments.length を依存にする。
  }, [segments.length]);

  // -------------------------------------------------------------------------
  // レンダリング
  // -------------------------------------------------------------------------

  return (
    <section
      className="live-transcript-pane flex h-full flex-col gap-3 overflow-y-auto rounded-xl border border-hairline bg-card p-5"
      aria-label="ライブトランスクリプト"
    >
      {/* ── 転写遅延インジケータ（Req 2.5） ──────────────────────────────── */}
      {staleTranscript && (
        <div
          role="status"
          className="live-transcript-pane__stale-notice flex items-center gap-1.5 self-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            warning
          </span>
          {STALE_TRANSCRIPT_MESSAGE}
        </div>
      )}

      {/* ── トランスクリプトセグメントリスト（Req 2.1, 2.2, 2.3） ────────── */}
      <ol
        className="live-transcript-pane__segments flex flex-col gap-4"
        aria-label="トランスクリプト"
      >
        {segments.map((segment) => (
          <li
            key={segment.seq}
            className={`live-transcript-pane__segment live-transcript-pane__segment--${segment.speakerRole} flex flex-col gap-1.5 ${SPEAKER_ROLE_BUBBLE_CLASSES[segment.speakerRole]}`}
            data-seq={segment.seq}
            data-speaker-role={segment.speakerRole}
          >
            {/*
             * 話者ロールラベル（主要シグナル）。Req 2.2: interviewer/candidate を分離し
             * 面接官/候補者とラベル付け。Req 2.3: unknown は「未確定」と表示。
             */}
            <span className="flex items-center gap-2">
              <span
                className={`live-transcript-pane__speaker-role-label inline-block rounded px-2 py-0.5 text-xs font-medium ${SPEAKER_ROLE_CHIP_CLASSES[segment.speakerRole]}`}
                aria-label="話者"
              >
                {SPEAKER_ROLE_LABELS[segment.speakerRole]}
              </span>
              {/*
               * 参加者名（生値）。存在する場合のみ表示。
               * ロールラベルが主要シグナルで、こちらは補足情報（design.md 2.3）。
               */}
              {segment.speakerLabel !== null && (
                <span
                  className="live-transcript-pane__speaker-name-label text-xs text-muted"
                  aria-label="参加者名"
                >
                  {segment.speakerLabel}
                </span>
              )}
            </span>

            {/* 転写テキスト */}
            <span
              className={`live-transcript-pane__segment-text max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${SPEAKER_ROLE_BUBBLE_BODY[segment.speakerRole]}`}
            >
              {segment.text}
            </span>
          </li>
        ))}
      </ol>

      {/* ── 自動スクロールアンカー（最新セグメントへのスクロール先） ─────── */}
      <div
        ref={bottomRef}
        className="live-transcript-pane__bottom-anchor"
        aria-hidden="true"
      />
    </section>
  );
}
