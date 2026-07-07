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

import type { ClassResult, ClassFlavor } from '@bulr/types';
import type { ClassDiagnosisRecord } from '@bulr/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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
    temperament: 'deepener_solo',
    temperamentBalanced: false,
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
  it('NoVocation（!record && !hasSkill）: スキル診断への CTA を出し、診断ボタンは出さない (R8.1)', () => {
    render(
      <ClassDiagnosisView
        record={null}
        flavor={null}
        hasSkill={false}
        hasPlaystyle={false}
        isStale={false}
      />,
    );

    // スキルアンケートへ誘導する導線
    expect(screen.getByTestId('class-diagnosis-skill-cta')).toBeInTheDocument();
    // 何も判定材料がないため「診断する」生成ボタンは出さない
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
      />,
    );

    const btn = screen.getByTestId('generate-button');
    expect(btn).toHaveTextContent('診断する');
  });

  it('PartialNoTemperament（record && temperament===null）: カード + 気質診断 CTA を出す (R8.2)', () => {
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
      />,
    );

    // クラスカードが描画される
    expect(screen.getByTestId('class-card')).toBeInTheDocument();
    // 気質診断へ誘導する CTA
    expect(screen.getByTestId('class-diagnosis-temperament-cta')).toBeInTheDocument();
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
      />,
    );

    expect(container.textContent).not.toContain(String(DISTINCTIVE_SCORE));
  });
});
