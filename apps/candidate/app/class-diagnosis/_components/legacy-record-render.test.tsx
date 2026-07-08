// @vitest-environment jsdom
/**
 * legacy-record-render.test.tsx — 旧4型レコードの無害描画 + 残軸導線（task 5.1 / R7.3, R7.4）
 *
 * task 4.5 の legacy.ts 単体テスト（normalizeClassResultTemperament の純関数契約）と、
 * class-diagnosis-view.test.tsx の PartialNoTemperament 分岐（temperament === null）は
 * それぞれ独立に緑だが、「旧4型文字列 → legacy 正規化 → ClassDiagnosisView 描画」という
 * end-to-end の統合パスがコンポーネントレベルで未検証だった。本テストがその穴を埋める。
 *
 * page.tsx は既存レコードの `result.temperament` を
 * `normalizeClassResultTemperament(record.result.temperament)` で正規化してから view に渡す
 * （page.tsx L76-87）。旧4型文字列 'deepener_solo' はこの正規化により
 * `{ poles:{explorationDeepening,soloCollaboration}, code:null, completeness:'partial' }`
 * という **非null の partial summary** になる。
 *
 * ここが重要な仕様の実挙動: view の PartialNoTemperament 分岐は `result.temperament === null`
 * を条件とするため（class-diagnosis-view.tsx L257, L286）、上記 partial summary（非null）は
 * その分岐に**入らず** Complete/VizOnly 分岐に落ちる。旧レコードの「残軸導線」（R7.4）は
 * したがって `class-diagnosis-temperament-cta` ではなく **ClassCard の partial 注記**
 * （`class-card-temperament-partial-note`「残りの気質の設問に答えると…確定します」）＋
 * partial 極ラベルバッジ（`class-card-temperament`）として表現される。
 *
 * 本テストはこの **実挙動** を特性化（characterization）して検証する:
 *  - R7.3: 旧値正規化レコードでも view がクラッシュせず、クラスカードが完全描画される。
 *  - R7.4: 気質を partial（判定済み2軸）として扱い、残軸に回答して確定するよう促す注記を出す。
 *  - 数値スコアが漏れない（R4.4 の付随確認）。
 *
 * GenerateButton は Server Action を import するためモックして DB/action 依存を遮断する
 * （class-diagnosis-view.test.tsx と同方針）。
 */

import type { ClassResult, ClassFlavor, TemperamentSummary } from '@bulr/types';
import type { ClassDiagnosisRecord } from '@bulr/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { normalizeClassResultTemperament } from '../../_lib/temperament/legacy';
import {
  scoreTemperament,
  type TemperamentAnswer,
  type TemperamentProfile,
} from '../../_lib/temperament/score';

// Server Action を import する GenerateButton をモックして DB/action 依存を遮断する。
vi.mock('./generate-button', () => ({
  GenerateButton: ({ label }: { label: string }) => (
    <button type="button" data-testid="generate-button">
      {label}
    </button>
  ),
}));

import { ClassDiagnosisView } from './class-diagnosis-view';

afterEach(cleanup);

const D = new Date('2026-07-01T00:00:00Z');
const PLAYSTYLE_HREF = '/skill-survey/ps-1';

// ベクトルに識別可能な数値（87.5）を含め、DOM に漏れていないことを検査する（R4.4）。
const DISTINCTIVE_SCORE = 87.5;

/** 4軸すべて回答したライブ playstyle profile（view の必須 props 用）。 */
function makeFullProfile(): TemperamentProfile {
  const answers: TemperamentAnswer[] = [
    { axis: 'explorationDeepening', level: 4, reverse: false, maxLevel: 4 },
    { axis: 'soloCollaboration', level: 4, reverse: false, maxLevel: 4 },
    { axis: 'planningImprovisation', level: 4, reverse: false, maxLevel: 4 },
    { axis: 'stabilityChallenge', level: 4, reverse: false, maxLevel: 4 },
  ];
  return scoreTemperament(answers);
}

function makeResult(temperament: TemperamentSummary | null): ClassResult {
  return {
    primaryVocation: 'vanguard',
    subVocations: ['rearguard'],
    vocationVector: {
      vanguard: DISTINCTIVE_SCORE,
      rearguard: 42,
      guardian: 10,
      sage: 5,
      commander: 3,
      strategist: 2,
      ranger: 1,
    },
    temperament,
    title: 'specialist',
    representativeVocation: 'vanguard',
    className: 'スペシャリスト・孤高の深化者な前衛',
    confidence: 'normal',
  };
}

function makeRecord(
  result: ClassResult,
  flavor: ClassFlavor | null,
): ClassDiagnosisRecord {
  return {
    id: 'cd-legacy',
    candidateProfileId: 'p1',
    sourceSignature: 'sig-legacy',
    sourceSnapshot: {
      skillResponses: [
        {
          surveyId: 's1',
          responseId: 'r1',
          submittedAt: D.toISOString(),
          overallCoverageRatio: 1,
        },
      ],
      playstyleResponseId: null,
      playstyleSubmittedAt: null,
    },
    result,
    llmFlavor: flavor,
    metadata: null,
    regenerationCount: 0,
    regenerationWindowStart: D,
    generatedAt: D,
    createdAt: D,
    updatedAt: D,
  };
}

describe('ClassDiagnosisView — 旧4型レコードの無害描画 + 残軸導線 (task 5.1 / R7.3, R7.4)', () => {
  // page.tsx と同じ正規化を通す: 旧4型文字列 → partial summary（非null, code=null）。
  const normalized = normalizeClassResultTemperament('deepener_solo');

  it('前提: 旧4型 deepener_solo は正規化で 2軸のみ determined な partial summary（非null）になる', () => {
    // page.tsx が view へ渡す result.temperament の実体を固定する。
    expect(normalized).not.toBeNull();
    expect(normalized?.completeness).toBe('partial');
    expect(normalized?.code).toBeNull();
    expect(normalized?.poles).toEqual({
      explorationDeepening: 'deepener',
      soloCollaboration: 'solo',
    });
  });

  it('旧レコードをクラッシュせず描画し、残軸導線（partial 注記＋極ラベル）を出す (R7.3, R7.4)', () => {
    const record = makeRecord(makeResult(normalized), null);

    // クラッシュしないこと自体が R7.3 の第一義。
    expect(() =>
      render(
        <ClassDiagnosisView
          record={record}
          flavor={null}
          hasSkill
          hasPlaystyle={false}
          isStale={false}
          playstyleProfile={makeFullProfile()}
          playstyleSurveyHref={PLAYSTYLE_HREF}
        />,
      ),
    ).not.toThrow();

    // クラスカードが完全描画される（R7.3）。
    expect(screen.getByTestId('class-card')).toBeInTheDocument();

    // 残軸導線（R7.4）: 判定済み2軸の極ラベルバッジ + 「残りの気質の設問に答えると…確定します」注記。
    // 正規化 summary は非null（partial）なので view は Complete 分岐に落ち、
    // 気質未診断（class-card-temperament-missing）ではなく partial 表現になる。
    expect(screen.getByTestId('class-card-temperament')).toBeInTheDocument();
    expect(
      screen.queryByTestId('class-card-temperament-missing'),
    ).not.toBeInTheDocument();
    const partialNote = screen.getByTestId('class-card-temperament-partial-note');
    expect(partialNote).toBeInTheDocument();
    expect(partialNote).toHaveTextContent('残りの気質の設問に答えると');

    // 旧アーキタイプ（16タイプ）は捏造しない: full 用の shortLabel バッジ扱いにならない
    // ことは code=null により担保される（archetype 参照は completeness==='full' のみ）。
  });

  it('旧レコード描画でも数値スコア（ベクトル値）を一切表示しない (R4.4)', () => {
    const record = makeRecord(makeResult(normalized), null);

    const { container } = render(
      <ClassDiagnosisView
        record={record}
        flavor={null}
        hasSkill
        hasPlaystyle={false}
        isStale={false}
        playstyleProfile={makeFullProfile()}
        playstyleSurveyHref={PLAYSTYLE_HREF}
      />,
    );

    expect(container.textContent).not.toContain(String(DISTINCTIVE_SCORE));
  });
});
