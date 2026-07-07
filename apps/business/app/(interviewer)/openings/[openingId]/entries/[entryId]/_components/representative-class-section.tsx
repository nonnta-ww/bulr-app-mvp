/**
 * RepresentativeClassSection — 代表クラス read-only 表示（Server Component / presentational）
 *
 * 候補者の最新確定診断から算出された「代表クラス名」を、面接官向けエントリー詳細で
 * 読み取り専用に表示する。className は候補者アプリ側でラベル合成済みの文字列で、
 * business 側はそれをそのまま表示するだけ（クロスアプリのラベル依存を持たない）。
 *
 * - props: { representativeClass: RepresentativeClass | null }
 * - representativeClass が null（未診断）の場合は何も描画しない（セクション非表示）
 * - 根拠回答は一切表示しない。再生成・パーティ/編成などの機能は持たない（read-only）
 *
 * Requirements: 10.1, 10.2, 10.3, 11.3
 */

import type { RepresentativeClass } from '@bulr/types';

import { Icon } from '@/components/ui/icon';

interface Props {
  representativeClass: RepresentativeClass | null;
}

export function RepresentativeClassSection({ representativeClass }: Props) {
  // 未診断（最新確定診断なし）の場合は何も表示しない（要件 10.1, 10.3）
  if (representativeClass === null) {
    return null;
  }

  return (
    <section
      data-testid="representative-class-section"
      data-primary-vocation={representativeClass.primaryVocation}
      data-title={representativeClass.title}
      className="rounded-xl border border-hairline bg-card p-6"
    >
      <h2 className="mb-4 flex items-center gap-2 border-b border-hairline pb-3 text-base font-semibold text-ink">
        <Icon name="military_tech" size={20} className="text-copper" />
        診断クラス
      </h2>
      <p className="text-lg font-semibold tracking-tight text-navy">
        {representativeClass.className}
      </p>
    </section>
  );
}
