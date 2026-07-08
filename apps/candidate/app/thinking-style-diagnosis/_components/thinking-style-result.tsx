/**
 * thinking-style-result.tsx — 思考スタイル診断の共有プレゼンテーション（task 4.2 / R2.1, R2.3, R2.4, R3.1, R3.2, R3.3）
 *
 * profile.completeness で3分岐する単一実装。standalone route とクラス診断ビューの
 * 両方からマウントされる（design.md「ThinkingStyleResult」）。
 *
 *  - none    : 思考スタイルタイプを提示せず、思考スタイルアンケートへの回答を促す誘導＋CTA を表示（R3.1）。
 *  - partial : 判定済み軸の寄りを AxisBars で暫定提示し、残（未回答）軸に回答すると完全タイプが
 *              確定する旨＋その回答への CTA を表示。アーキタイプは確定させない（R3.2）。
 *  - full    : 確定16タイプの1つとして、アーキタイプ名・キュレーテッド説明・次の一歩＋
 *              4軸 AxisBars＋共有パネルを表示（R2.1, R2.4, R3.3）。
 *
 * このコンポーネント自体は数値スコア（点数・偏差値・順位・他者比較・パーセント）を一切描画しない
 * （R2.3）。軸の寄りは AxisBars に委譲し、position-only で表現される。アーキタイプ文言は
 * archetypes.ts の決定論的キュレーテッド copy をそのまま用いる（R2.4）。
 * 本人スコープは親 page の認証ガードで担保する presentational コンポーネント。
 *
 * Zenith デザイントークン（rounded-card / border-hairline / bg-card / text-muted）を用い、
 * テーマトークン非依存の配色は明示 Tailwind クラスで指定する（candidate の運用方針）。
 *
 * Boundary: thinking-style-result.tsx
 * Requirements: 2.1, 2.3, 2.4, 3.1, 3.2, 3.3
 */

import { THINKING_STYLE_ARCHETYPES } from '../../_lib/thinking-style/archetypes';
import type { ThinkingStyleProfile } from '../../_lib/thinking-style/score';
import { AxisBars } from './axis-bars';
import { ThinkingStyleSharePanel } from './thinking-style-share-panel';

interface ThinkingStyleResultProps {
  /** ライブ算出済みの思考スタイルプロフィール（4軸キー完備）。 */
  profile: ThinkingStyleProfile;
  /**
   * 思考スタイルアンケートへの deep-link。親 page が解決する（未回答軸への誘導 / フォールバック含む）。
   * none / partial の CTA と full の再回答導線に用いる。
   */
  thinkingStyleSurveyHref: string;
}

/** アンケートへ誘導する CTA リンク（Zenith プライマリボタン）。 */
function SurveyCta({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700"
      data-testid="thinking-style-cta"
    >
      {label}
      <span aria-hidden="true">→</span>
    </a>
  );
}

/**
 * profile.completeness で分岐して思考スタイル結果を描画する。
 * 数値スコアは自身では一切描画しない（R2.3）。
 */
export function ThinkingStyleResult({
  profile,
  thinkingStyleSurveyHref,
}: ThinkingStyleResultProps) {
  const { completeness } = profile;

  if (completeness === 'none') {
    return (
      <div data-testid="thinking-style-result">
        <section
          className="rounded-card border border-hairline bg-card p-6"
          data-testid="thinking-style-result-none"
        >
          <h2 className="text-lg font-semibold text-gray-900">
            思考スタイルはまだ診断されていません
          </h2>
          <p className="mt-2 text-sm text-muted">
            思考スタイルアンケートに回答すると、あなたの思考スタイルタイプを診断できます。
            まずはアンケートに答えてみましょう。
          </p>
          <SurveyCta
            href={thinkingStyleSurveyHref}
            label="思考スタイルアンケートに回答する"
          />
        </section>
      </div>
    );
  }

  if (completeness === 'partial') {
    return (
      <div data-testid="thinking-style-result">
        <section
          className="flex flex-col gap-6"
          data-testid="thinking-style-result-partial"
        >
          <div className="rounded-card border border-hairline bg-card p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              今のところの寄り（暫定結果）
            </h2>
            <p className="mt-2 text-sm text-muted">
              回答済みの軸の寄りを表示しています。未回答の軸に回答すると、
              16タイプの中から完全な思考スタイルが確定します。
            </p>
          </div>

          {/* 判定済み軸の寄り。未回答軸は AxisBars 側で淡色＋「未回答」表示。 */}
          <AxisBars axes={profile.axes} />

          <div className="rounded-card border border-hairline bg-card p-6">
            <p className="text-sm text-gray-800">
              残りの軸に回答すると、あなたの完全な思考スタイルが確定します。
            </p>
            <SurveyCta
              href={thinkingStyleSurveyHref}
              label="残りの軸に回答する"
            />
          </div>
        </section>
      </div>
    );
  }

  // completeness === 'full' — INVARIANT: code は非null。
  const archetype = profile.code
    ? THINKING_STYLE_ARCHETYPES[profile.code]
    : null;

  return (
    <div data-testid="thinking-style-result">
      <section
        className="flex flex-col gap-6"
        data-testid="thinking-style-result-full"
      >
        {archetype ? (
          <div className="rounded-card border border-hairline bg-card p-6">
            <p className="text-sm font-medium text-orange-700">
              あなたの思考スタイル
            </p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">
              {archetype.name}
            </h2>
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

        {/* 4軸すべての寄り（position-only, 数値非表示）。 */}
        <AxisBars axes={profile.axes} />

        {archetype ? <ThinkingStyleSharePanel archetype={archetype} /> : null}
      </section>
    </div>
  );
}
