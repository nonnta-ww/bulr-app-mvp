/**
 * archetype-symbol.tsx — アーキタイプ別シンボル（自己完結インライン SVG エンブレム）。
 *
 * 12アーキタイプそれぞれに、共通の六角フレーム＋タイプ別グリフのエンブレムを描画する
 * （spec: diagnosis-archetypes, R6）。
 *
 *  - 外部ネットワーク（外部画像・外部参照）に一切依存しない自己完結 SVG（R6.3）。
 *  - `role="img"` ＋ `<title>`（アーキタイプ名）でアクセシブルに提供する（R6.4）。
 *  - サイズは props。recharts 非依存の純粋な表示要素のため 'use client' 不要（Server 互換）。
 *
 * 配色はネイビー×銅色で自己完結（テーマトークン非依存）。
 *
 * Boundary: ArchetypeSymbol
 * Requirements: 6.1, 6.2, 6.3, 6.4, 8.1, 8.2
 */

import type { ReactElement } from "react";

import { ARCHETYPES, type ArchetypeId } from "../_lib/archetype/definitions";

const FRAME_FILL = "#1c2740";
const FRAME_STROKE = "#c98a3d";
const GLYPH = "#db9a4a";

/** 六角フレーム（pointy-top, 中心 24,24）。 */
const HEX_POINTS = "24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5";

/** タイプ別グリフ（中心 24,24・半径 ±11 に収める）。 */
const GLYPHS: Record<ArchetypeId, ReactElement> = {
  builder: (
    <g fill={GLYPH}>
      <rect x="16" y="23" width="6" height="6" rx="1" />
      <rect x="26" y="23" width="6" height="6" rx="1" />
      <rect x="21" y="16" width="6" height="6" rx="1" />
    </g>
  ),
  architect: (
    <g fill="none" stroke={GLYPH} strokeWidth="1.6" strokeLinejoin="round">
      <polygon points="24,15 15,32 33,32" />
      <circle cx="24" cy="15" r="1.6" fill={GLYPH} stroke="none" />
    </g>
  ),
  guardian: (
    <path
      d="M24,14 L33,18 L33,26 Q33,33 24,36 Q15,33 15,26 L15,18 Z"
      fill="none"
      stroke={GLYPH}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  firefighter: (
    <path d="M24,13 C31,23 29,34 24,34 C19,34 17,24 24,13 Z" fill={GLYPH} />
  ),
  innovator: (
    <polygon
      points="24,12 27,21 36,24 27,27 24,36 21,27 12,24 21,21"
      fill={GLYPH}
    />
  ),
  optimizer: (
    <g fill="none" stroke={GLYPH} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16,26 24,19 32,26" />
      <polyline points="16,33 24,26 32,33" />
    </g>
  ),
  researcher: (
    <g fill="none" stroke={GLYPH} strokeWidth="1.8" strokeLinecap="round">
      <circle cx="21" cy="21" r="6.5" />
      <line x1="26" y1="26" x2="33" y2="33" />
    </g>
  ),
  mentor: (
    <g>
      <line x1="24" y1="35" x2="24" y2="23" stroke={GLYPH} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M24,26 Q15,24 17,15 Q26,17 24,26 Z" fill={GLYPH} />
      <path d="M24,26 Q33,24 31,15 Q22,17 24,26 Z" fill={GLYPH} />
    </g>
  ),
  commander: (
    <g fill="none" stroke={GLYPH} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16,17 24,22 32,17" />
      <polyline points="16,23 24,28 32,23" />
      <polyline points="16,29 24,34 32,29" />
    </g>
  ),
  strategist: (
    <g fill="none" stroke={GLYPH} strokeWidth="1.6" strokeLinejoin="round">
      <rect x="19" y="20" width="10" height="15" rx="1" />
      <rect x="18" y="15" width="4" height="6" />
      <rect x="26" y="15" width="4" height="6" />
    </g>
  ),
  integrator: (
    <g fill="none" stroke={GLYPH} strokeWidth="1.8">
      <circle cx="20" cy="24" r="6.5" />
      <circle cx="28" cy="24" r="6.5" />
    </g>
  ),
  craftsman: (
    <g fill="none" stroke={GLYPH} strokeWidth="1.6" strokeLinejoin="round">
      <polygon points="24,13 35,23 24,37 13,23" />
      <line x1="13" y1="23" x2="35" y2="23" />
      <line x1="19" y1="18" x2="29" y2="18" />
    </g>
  ),
};

export interface ArchetypeSymbolProps {
  id: ArchetypeId;
  /** 一辺のピクセルサイズ（既定 64）。 */
  size?: number;
  className?: string;
}

/**
 * アーキタイプのシンボルエンブレム。共通の六角フレーム＋タイプ別グリフ。
 * 自己完結 SVG（外部参照なし）・`role="img"`＋`<title>` でアクセシブル。
 */
export function ArchetypeSymbol({ id, size = 64, className }: ArchetypeSymbolProps) {
  const archetype = ARCHETYPES[id];
  return (
    <svg
      role="img"
      aria-label={`${archetype.name}のシンボル`}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      data-testid={`archetype-symbol-${id}`}
    >
      <title>{`${archetype.name}のシンボル`}</title>
      <polygon points={HEX_POINTS} fill={FRAME_FILL} stroke={FRAME_STROKE} strokeWidth="1.5" />
      {GLYPHS[id]}
    </svg>
  );
}
