/**
 * class-card.tsx — RPG クラス診断のクラスカード（Presentational, task 8.2 / R4.1/4.3/4.4/7.3）
 *
 * 確定診断（ClassResult）とフレーバー文（ClassFlavor | null）を受け取り、
 * クラス名・職掌・称号・気質・フレーバーを1枚のカードに表示する。
 *
 * - flavor が非null なら LLM 生成の tagline/description/nextStepHint を表示（R4.1）。
 * - flavor が null（LLM 失敗）なら、ラベル（className/職掌/称号/気質）から決定論的に
 *   組成したテンプレート文言でフォールバックし、カードは常に完全描画する（R7.3）。
 * - nextStepHint は「あと少しで別クラスに変化しうる」隣接クラスの成長ヒント（R4.3）。
 * - temperament=null（partial 診断, R8.2）は「気質未診断」ヒントを添える。
 * - 数値スコア・偏差値・順位・他者比較は一切表示しない（R4.4）。confidence=low は
 *   数値を伴わない注意書き（参考値）のみ。
 *
 * Zenith デザイントークン（rounded-card / border-hairline / bg-card / text-muted）を用い、
 * テーマトークン非依存の配色は明示 Tailwind クラスで指定する（candidate の運用方針）。
 *
 * recharts 非依存の純粋な表示コンポーネントのため 'use client' は不要（Server 互換）。
 *
 * Boundary: ClassCard
 * Requirements: 4.1, 4.3, 4.4, 7.3
 */

import type { ClassResult, ClassFlavor } from '@bulr/types';

import {
  VOCATION_LABELS,
  TITLE_LABELS,
  TEMPERAMENT_LABELS,
} from '../_lib/definitions';

interface ClassCardProps {
  result: ClassResult;
  flavor: ClassFlavor | null;
}

/**
 * flavor=null 時のテンプレートフォールバック（R7.3）。
 * ラベルのみから決定論的にフレーバー相当の3文（tagline/description/nextStepHint）を組成する。
 * 数値は一切含めない（R4.4）。
 */
function buildTemplateFlavor(result: ClassResult): ClassFlavor {
  const vocationLabel = VOCATION_LABELS[result.primaryVocation];
  const titleLabel = TITLE_LABELS[result.title];
  const temperamentLabel = result.temperament
    ? TEMPERAMENT_LABELS[result.temperament]
    : null;

  const subLabels = result.subVocations.map((v) => VOCATION_LABELS[v]);
  const subPhrase = subLabels.length > 0 ? `${subLabels.join('・')}の素養も併せ持つ` : '';

  const tagline = temperamentLabel
    ? `${temperamentLabel}な${vocationLabel}`
    : `${vocationLabel}`;

  const description = temperamentLabel
    ? `あなたは「${vocationLabel}」を主軸に、${temperamentLabel}のスタイルで力を発揮するタイプです。${subPhrase ? `${subPhrase}バランスが特徴です。` : ''}`
    : `あなたは「${vocationLabel}」を主軸に力を発揮するタイプです。${subPhrase ? `${subPhrase}バランスが特徴です。` : ''}`;

  const nextStepHint = subLabels.length > 0
    ? `${subLabels[0]}の領域をさらに深めると、隣接するクラスへ広がる余地があります。`
    : `${vocationLabel}以外の領域にも回答を広げると、隣接するクラスへ広がる余地があります。`;

  return { tagline, description, nextStepHint };
}

/**
 * クラスカード。flavor の有無に関わらず常に完全描画する（R7.3）。
 */
export function ClassCard({ result, flavor }: ClassCardProps) {
  const effectiveFlavor = flavor ?? buildTemplateFlavor(result);

  const primaryLabel = VOCATION_LABELS[result.primaryVocation];
  const titleLabel = TITLE_LABELS[result.title];
  const temperamentLabel = result.temperament
    ? TEMPERAMENT_LABELS[result.temperament]
    : null;
  const subLabels = result.subVocations.map((v) => VOCATION_LABELS[v]);

  return (
    <section
      className="rounded-card border border-hairline bg-card p-6"
      aria-label="クラス診断カード"
      data-testid="class-card"
    >
      {/* クラス名（最も目立たせる） */}
      <h2 className="text-2xl font-bold text-gray-900">{result.className}</h2>

      {/* 職掌・称号・気質のバッジ列 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-800"
          data-testid="class-card-vocation"
        >
          <span aria-hidden="true">⚔️</span>
          {primaryLabel}
        </span>
        <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
          {titleLabel}
        </span>
        {temperamentLabel ? (
          <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
            {temperamentLabel}
          </span>
        ) : (
          <span
            className="inline-flex items-center rounded-full border border-dashed border-hairline px-3 py-1 text-sm text-muted"
            data-testid="class-card-temperament-missing"
          >
            気質未診断
          </span>
        )}
      </div>

      {/* 副職掌（あれば） */}
      {subLabels.length > 0 ? (
        <p className="mt-2 text-sm text-muted" data-testid="class-card-sub-vocations">
          副職掌: {subLabels.join('・')}
        </p>
      ) : null}

      {/* フレーバー */}
      <p
        className="mt-4 text-base font-semibold text-gray-800"
        data-testid="class-card-tagline"
      >
        {effectiveFlavor.tagline}
      </p>
      <p
        className="mt-2 text-sm leading-relaxed text-gray-700"
        data-testid="class-card-description"
      >
        {effectiveFlavor.description}
      </p>

      {/* 隣接クラスの成長ヒント（R4.3） */}
      <div
        className="mt-4 rounded-card bg-orange-50 p-3"
        data-testid="class-card-next-step"
      >
        <p className="text-xs font-medium text-orange-700">次の一歩</p>
        <p className="mt-1 text-sm text-gray-700">{effectiveFlavor.nextStepHint}</p>
      </div>

      {/* 低信頼の注意書き（数値なし, R4.4） */}
      {result.confidence === 'low' ? (
        <p className="mt-3 text-xs text-muted" data-testid="class-card-low-confidence">
          回答が少ないため参考値です。回答を増やすと精度が高まります。
        </p>
      ) : null}
    </section>
  );
}
