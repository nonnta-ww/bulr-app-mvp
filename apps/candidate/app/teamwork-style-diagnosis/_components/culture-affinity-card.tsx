/**
 * culture-affinity-card.tsx — カルチャー親和性の提示（task 5.2 / R6.1, R6.2）
 *
 * `CultureAffinity`（2カルチャー軸: conflict / bonding ＋ 個人起点の description）を提示する。
 * 「この人はどんなカルチャーで活きるか」という個人起点の情報に限り、特定企業への適合・合否は
 * 表示しない（R6.2）。full 結果でのみマウントされる想定。
 *
 * presentational / summary-only。数値は描画しない。
 *
 * Boundary: culture-affinity-card
 * Requirements: 6.1, 6.2
 */

import type {
  BondingCulture,
  ConflictCulture,
  CultureAffinity,
} from '../../_lib/teamwork-style/culture-affinity';

interface CultureAffinityCardProps {
  affinity: CultureAffinity;
}

const CONFLICT_LABELS: Record<ConflictCulture, string> = {
  debate: '議論歓迎',
  consensus: '合意形成',
  balanced: '中庸',
};

const BONDING_LABELS: Record<BondingCulture, string> = {
  results: '成果主義',
  family: '家族的',
  balanced: '中庸',
};

/** カルチャー親和性を軸ラベル＋説明で提示する presentational コンポーネント。 */
export function CultureAffinityCard({ affinity }: CultureAffinityCardProps) {
  return (
    <section
      className="rounded-card border border-hairline bg-card p-6"
      data-testid="teamwork-style-culture-affinity"
    >
      <p className="text-sm font-medium text-orange-700">活きるカルチャー</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-800"
          data-testid="culture-affinity-conflict"
        >
          対立の扱い：{CONFLICT_LABELS[affinity.conflict]}
        </span>
        <span
          className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-800"
          data-testid="culture-affinity-bonding"
        >
          結束の作り方：{BONDING_LABELS[affinity.bonding]}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-gray-800">
        {affinity.description}
      </p>
    </section>
  );
}
