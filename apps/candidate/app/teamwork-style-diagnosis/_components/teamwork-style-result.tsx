/**
 * teamwork-style-result.tsx — チームワーク・スタイル診断の結果ビュー合成（task 5.5 / R3.2, R3.3, R3.4, R3.5）
 *
 * profile.completeness で3分岐する。
 *  - none    : タイプ・カルチャーを提示せず、回答を促す誘導＋CTA を表示（R3.2）。
 *  - partial : 判定済み軸の寄りを AxisBars で暫定提示し、残軸への回答 CTA を表示。アーキタイプ名・
 *              カルチャー親和性は提示しない（R3.3）。防御的分岐（L1 全必須のため通常は発生しない）。
 *  - full    : 確定16タイプ（正式名＋キャッチ＋説明＋次の一歩）＋4軸 AxisBars＋カルチャー親和性＋
 *              共有パネルを表示（R3.4）。
 * 成長アドバイスは回答があれば（partial/full 問わず）上乗せ表示する（R3.5）。
 *
 * 数値スコア（点数・偏差値・順位・他者比較・パーセント）は一切描画しない（R9.2）。軸の寄りは
 * AxisBars に position-only で委譲する。本人スコープは親 page の認証ガードで担保する presentational。
 *
 * Boundary: teamwork-style-result
 * Requirements: 3.2, 3.3, 3.4, 3.5
 */

import { TEAMWORK_ARCHETYPES } from '../../_lib/teamwork-style/archetypes';
import type { CultureAffinity } from '../../_lib/teamwork-style/culture-affinity';
import type { GrowthAdvice } from '../../_lib/teamwork-style/growth';
import type { TeamworkProfile } from '../../_lib/teamwork-style/score';
import { AxisBars } from './axis-bars';
import { CultureAffinityCard } from './culture-affinity-card';
import { GrowthAdviceSection } from './growth-advice-section';
import { TeamworkStyleSharePanel } from './teamwork-style-share-panel';

interface TeamworkStyleResultProps {
  /** ライブ算出済みのチームワーク・スタイルプロフィール（4軸キー完備）。 */
  profile: TeamworkProfile;
  /** 回答済みディメンションの成長アドバイス（空なら非表示）。 */
  growthAdvice: GrowthAdvice[];
  /** full のときのカルチャー親和性（未確定なら null）。 */
  cultureAffinity: CultureAffinity | null;
  /** アンケートへの deep-link（未回答誘導 / フォールバック含む）。 */
  surveyHref: string;
}

/** アンケートへ誘導する CTA リンク。 */
function SurveyCta({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700"
      data-testid="teamwork-style-cta"
    >
      {label}
      <span aria-hidden="true">→</span>
    </a>
  );
}

export function TeamworkStyleResult({
  profile,
  growthAdvice,
  cultureAffinity,
  surveyHref,
}: TeamworkStyleResultProps) {
  const { completeness } = profile;

  if (completeness === 'none') {
    return (
      <div data-testid="teamwork-style-result">
        <section
          className="rounded-card border border-hairline bg-card p-6"
          data-testid="teamwork-style-result-none"
        >
          <h2 className="text-lg font-semibold text-gray-900">
            チームワーク・スタイルはまだ診断されていません
          </h2>
          <p className="mt-2 text-sm text-muted">
            アンケートに回答すると、あなたが他者とどう関わるタイプかを診断できます。
            まずはアンケートに答えてみましょう。
          </p>
          <SurveyCta href={surveyHref} label="アンケートに回答する" />
        </section>
      </div>
    );
  }

  if (completeness === 'partial') {
    return (
      <div data-testid="teamwork-style-result">
        <section
          className="flex flex-col gap-6"
          data-testid="teamwork-style-result-partial"
        >
          <div className="rounded-card border border-hairline bg-card p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              今のところの寄り（暫定結果）
            </h2>
            <p className="mt-2 text-sm text-muted">
              回答済みの軸の寄りを表示しています。未回答の軸に回答すると、
              16タイプの中から完全なチームワーク・スタイルが確定します。
            </p>
          </div>

          <AxisBars axes={profile.axes} />

          <GrowthAdviceSection advice={growthAdvice} />

          <div className="rounded-card border border-hairline bg-card p-6">
            <p className="text-sm text-gray-800">
              残りの軸に回答すると、あなたの完全なチームワーク・スタイルが確定します。
            </p>
            <SurveyCta href={surveyHref} label="残りの軸に回答する" />
          </div>
        </section>
      </div>
    );
  }

  // completeness === 'full' — INVARIANT: code は非null。
  const archetype = profile.code ? TEAMWORK_ARCHETYPES[profile.code] : null;

  return (
    <div data-testid="teamwork-style-result">
      <section
        className="flex flex-col gap-6"
        data-testid="teamwork-style-result-full"
      >
        {archetype ? (
          <div className="rounded-card border border-hairline bg-card p-6">
            <p className="text-sm font-medium text-orange-700">
              あなたのチームワーク・スタイル
            </p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">
              {archetype.name}
            </h2>
            <p className="mt-1 text-base font-medium text-gray-700">
              {archetype.catch}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-800">
              {archetype.description}
            </p>

            <div className="mt-4 rounded-card bg-orange-50 p-4">
              <p className="text-xs font-semibold text-orange-700">次の一歩</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-800">
                {archetype.nextStep}
              </p>
            </div>
          </div>
        ) : null}

        <AxisBars axes={profile.axes} />

        {cultureAffinity ? (
          <CultureAffinityCard affinity={cultureAffinity} />
        ) : null}

        <GrowthAdviceSection advice={growthAdvice} />

        {archetype ? <TeamworkStyleSharePanel archetype={archetype} /> : null}
      </section>
    </div>
  );
}
