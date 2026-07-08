// @vitest-environment jsdom
/**
 * ClassDiagnosisView UI テスト（task 8.1 / Req 4.1, 4.4, 6.2, 6.3, 8.1, 8.2）
 *
 * page.tsx（Server Component）が算出した props（record / flavor / hasSkill /
 * hasPlaystyle / isStale）から状態を導出し、状態別に適切な表示・CTA を出す:
 *   - NoVocation（!record && !hasSkill）: スキル診断へ誘導する CTA。診断ボタンは出さない。
 *   - Empty/ready（!record && hasSkill）: 「診断する」CTA。
 *   - PartialNoTemperament（record && temperament === null）: カード + 気質診断 CTA。
 *   - Complete（record && temperament && flavor && !isStale）: カード + 共有 + 再診断。
 *   - Stale（record && isStale）: 陳腐化バナー + 再診断 CTA。
 *   - 数値スコア（ベクトル値）は一切表示しない（R4.4）。
 *
 * GenerateButton は Server Action を import するためモックして DB 依存を遮断する。
 * VocationRadar は dynamic(ssr:false) で読み込まれるため、ここではカード/CTA/バナー/
 * 数値非表示を検証し、レーダー自体は task 8.2 のテストで担保する。
 */

import type { ClassResult, ClassFlavor, TemperamentSummary } from '@bulr/types';
import type { ClassDiagnosisRecord } from '@bulr/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import {
  scoreTemperament,
  type TemperamentAnswer,
  type TemperamentProfile,
} from '../../_lib/temperament/score';

// Server Action を import する GenerateButton をモックして DB/action 依存を遮断する。
// ラベルを描画し、状態別 CTA の存在を検証できるようにする。
vi.mock('./generate-button', () => ({
  GenerateButton: ({ label }: { label: string }) => (
    <button type="button" data-testid="generate-button">
      {label}
    </button>
  ),
}));

import { ClassDiagnosisView } from './class-diagnosis-view';

// ライブ算出 playstyle profile のヘルパ。
// answers 空 → completeness='none'。4軸すべてに回答 → 'full'。
const EMPTY_PROFILE: TemperamentProfile = scoreTemperament([]);

function makeFullProfile(): TemperamentProfile {
  const answers: TemperamentAnswer[] = [
    { axis: 'explorationDeepening', level: 4, reverse: false, maxLevel: 4 },
    { axis: 'soloCollaboration', level: 4, reverse: false, maxLevel: 4 },
    { axis: 'planningImprovisation', level: 4, reverse: false, maxLevel: 4 },
    { axis: 'stabilityChallenge', level: 4, reverse: false, maxLevel: 4 },
  ];
  return scoreTemperament(answers);
}

const PARTIAL_TEMPERAMENT: TemperamentSummary = {
  poles: { explorationDeepening: 'deepener', soloCollaboration: 'solo' },
  balancedAxes: [],
  code: null,
  completeness: 'partial',
};

afterEach(cleanup);

const D = new Date('2026-07-01T00:00:00Z');

// ベクトルに識別可能な数値（87.5）を含め、DOM に漏れていないことを検査する（R4.4）。
const DISTINCTIVE_SCORE = 87.5;

function makeResult(overrides: Partial<ClassResult> = {}): ClassResult {
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
    temperament: PARTIAL_TEMPERAMENT,
    title: 'specialist',
    representativeVocation: 'vanguard',
    className: 'スペシャリスト・孤高の深化者な前衛',
    confidence: 'normal',
    ...overrides,
  };
}

const FULL_FLAVOR: ClassFlavor = {
  tagline: '静かに深く磨き上げる前衛職人',
  description: 'あなたはフロントエンドの前衛として一点を深く掘り下げるタイプです。',
  nextStepHint: 'あと少しバックエンド連携を深めると後衛の色が強まります。',
};

function makeRecord(
  result: ClassResult,
  flavor: ClassFlavor | null,
): ClassDiagnosisRecord {
  return {
    id: 'cd1',
    candidateProfileId: 'p1',
    sourceSignature: 'sig-1',
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

describe('ClassDiagnosisView — 状態分岐 (task 8.1)', () => {
  it('NoVocation（!record && !hasSkill && !hasPlaystyle）: スキル診断への CTA を出し、診断ボタンは出さない (R8.1)', () => {
    render(
      <ClassDiagnosisView
        record={null}
        flavor={null}
        hasSkill={false}
        hasPlaystyle={false}
        isStale={false}
        playstyleProfile={EMPTY_PROFILE}
        playstyleSurveyHref="/skill-survey/ps-1"
      />,
    );

    // スキルアンケートへ誘導する導線
    expect(screen.getByTestId('class-diagnosis-skill-cta')).toBeInTheDocument();
    // 気質のみ回答者向けの UI は出さない（未回答なので）
    expect(
      screen.queryByTestId('class-diagnosis-skill-unlock-cta'),
    ).not.toBeInTheDocument();
    // 何も判定材料がないため「診断する」生成ボタンは出さない
    expect(screen.queryByTestId('generate-button')).not.toBeInTheDocument();
  });

  it('NoVocation + 気質回答済み（!record && !hasSkill && hasPlaystyle）: 気質結果 + スキル解放 CTA を出す (R6.2/6.3)', () => {
    render(
      <ClassDiagnosisView
        record={null}
        flavor={null}
        hasSkill={false}
        hasPlaystyle
        isStale={false}
        playstyleProfile={makeFullProfile()}
        playstyleSurveyHref="/skill-survey/ps-1"
      />,
    );

    // 気質結果（PlaystyleResult）が描画される（R6.2）
    expect(screen.getByTestId('playstyle-result')).toBeInTheDocument();
    // スキル診断で RPG クラスが解放される旨の次の一歩 CTA（R6.3）
    const skillUnlockCta = screen.getByTestId(
      'class-diagnosis-skill-unlock-cta',
    );
    expect(skillUnlockCta).toBeInTheDocument();
    expect(skillUnlockCta).toHaveAttribute('href', '/skill-survey');
    // まだクラスは確定していないので生成ボタンは出さない
    expect(screen.queryByTestId('generate-button')).not.toBeInTheDocument();
  });

  it('Empty/ready（!record && hasSkill）: 「診断する」CTA を出す', () => {
    render(
      <ClassDiagnosisView
        record={null}
        flavor={null}
        hasSkill
        hasPlaystyle={false}
        isStale={false}
        playstyleProfile={EMPTY_PROFILE}
        playstyleSurveyHref="/skill-survey/ps-1"
      />,
    );

    const btn = screen.getByTestId('generate-button');
    expect(btn).toHaveTextContent('診断する');
  });

  it('PartialNoTemperament（record && temperament===null）: カード + 気質診断 CTA を出し、CTA は deep-link 先を指す (R8.2/R6.1)', () => {
    const record = makeRecord(
      makeResult({ temperament: null, className: 'スペシャリスト・前衛' }),
      null,
    );

    render(
      <ClassDiagnosisView
        record={record}
        flavor={null}
        hasSkill
        hasPlaystyle={false}
        isStale={false}
        playstyleProfile={EMPTY_PROFILE}
        playstyleSurveyHref="/skill-survey/ps-1"
      />,
    );

    // クラスカードが描画される
    expect(screen.getByTestId('class-card')).toBeInTheDocument();
    // 気質診断へ誘導する CTA。href は渡された deep-link（アンケート直行）を指す（R6.1）。
    const temperamentCta = screen.getByTestId(
      'class-diagnosis-temperament-cta',
    );
    expect(temperamentCta).toBeInTheDocument();
    expect(temperamentCta).toHaveAttribute('href', '/skill-survey/ps-1');
  });

  it('Complete（record && temperament && flavor）: カード + 共有 + 再診断 が揃う', () => {
    const record = makeRecord(makeResult(), FULL_FLAVOR);

    render(
      <ClassDiagnosisView
        record={record}
        flavor={FULL_FLAVOR}
        hasSkill
        hasPlaystyle
        isStale={false}
        playstyleProfile={makeFullProfile()}
        playstyleSurveyHref="/skill-survey/ps-1"
      />,
    );

    expect(screen.getByTestId('class-card')).toBeInTheDocument();
    expect(screen.getByTestId('share-panel')).toBeInTheDocument();
    // 再診断ボタン
    expect(screen.getByTestId('generate-button')).toHaveTextContent('再診断');
  });

  it('Stale（record && isStale）: 陳腐化バナー + 再診断 CTA を出す (R6.2/6.3)', () => {
    const record = makeRecord(makeResult(), FULL_FLAVOR);

    render(
      <ClassDiagnosisView
        record={record}
        flavor={FULL_FLAVOR}
        hasSkill
        hasPlaystyle
        isStale
        playstyleProfile={makeFullProfile()}
        playstyleSurveyHref="/skill-survey/ps-1"
      />,
    );

    // 陳腐化バナー（新しい回答がある旨）
    expect(screen.getByText(/新しい回答があります/)).toBeInTheDocument();
    // 再診断 CTA
    expect(screen.getByTestId('generate-button')).toHaveTextContent('再診断');
  });

  it('数値スコア（ベクトル値）を一切表示しない (R4.4)', () => {
    const record = makeRecord(makeResult(), FULL_FLAVOR);

    const { container } = render(
      <ClassDiagnosisView
        record={record}
        flavor={FULL_FLAVOR}
        hasSkill
        hasPlaystyle
        isStale={false}
        playstyleProfile={makeFullProfile()}
        playstyleSurveyHref="/skill-survey/ps-1"
      />,
    );

    expect(container.textContent).not.toContain(String(DISTINCTIVE_SCORE));
  });
});
