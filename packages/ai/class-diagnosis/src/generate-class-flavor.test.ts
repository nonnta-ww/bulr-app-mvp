// Requirements: 7.1, 7.2, 4.3
// 純粋テスト — 実 LLM を呼ばない（builders + schema のみ検証）

import { describe, it, expect } from 'vitest';
import type { ClassResult } from '@bulr/types';
import { classFlavorSchema } from './schema';
import {
  buildClassFlavorSystemPrompt,
  buildClassFlavorPrompt,
} from './generate-class-flavor';
import type { ClassFlavorInput } from './schema';

// 特徴的な数値（87.5）を vocationVector に埋め込み、プロンプトに漏れないことを検証する
const sampleResult: ClassResult = {
  primaryVocation: 'vanguard',
  subVocations: ['sage'],
  vocationVector: {
    vanguard: 87.5,
    rearguard: 12,
    guardian: 0,
    sage: 40,
    commander: 5,
    strategist: 3,
    ranger: 20,
  },
  temperament: 'explorer_solo',
  temperamentBalanced: false,
  title: 'specialist',
  representativeVocation: 'vanguard',
  className: '前衛の探究者',
  confidence: 'normal',
};

const sampleInput: ClassFlavorInput = {
  result: sampleResult,
  answers: [
    {
      categoryName: 'フロントエンド設計',
      selectedLabels: ['コンポーネント設計', 'アクセシビリティ'],
      freeText: 'デザインシステムの構築が得意',
    },
    {
      categoryName: 'AI活用',
      selectedLabels: ['プロンプト設計'],
      freeText: null,
    },
  ],
};

describe('classFlavorSchema', () => {
  it('accepts a valid flavor object', () => {
    const valid = {
      tagline: 'フロントを切り拓く探究者',
      description: '選択ラベルに根ざした説明文。',
      nextStepHint: '賢者クラスへ向けてAI活用を深めよう。',
    };
    expect(() => classFlavorSchema.parse(valid)).not.toThrow();
    expect(classFlavorSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an over-length tagline (81 chars)', () => {
    const bad = {
      tagline: 'あ'.repeat(81),
      description: 'ok',
      nextStepHint: 'ok',
    };
    expect(() => classFlavorSchema.parse(bad)).toThrow();
  });

  it('rejects an over-length description (401 chars)', () => {
    const bad = {
      tagline: 'ok',
      description: 'あ'.repeat(401),
      nextStepHint: 'ok',
    };
    expect(() => classFlavorSchema.parse(bad)).toThrow();
  });

  it('rejects an over-length nextStepHint (201 chars)', () => {
    const bad = {
      tagline: 'ok',
      description: 'ok',
      nextStepHint: 'あ'.repeat(201),
    };
    expect(() => classFlavorSchema.parse(bad)).toThrow();
  });

  it('accepts boundary-length values (80/400/200 chars)', () => {
    const boundary = {
      tagline: 'あ'.repeat(80),
      description: 'あ'.repeat(400),
      nextStepHint: 'あ'.repeat(200),
    };
    expect(() => classFlavorSchema.parse(boundary)).not.toThrow();
  });
});

describe('buildClassFlavorSystemPrompt', () => {
  const system = buildClassFlavorSystemPrompt();

  it('includes the no-numeric-score constraint', () => {
    expect(system).toContain('数値スコア');
  });

  it('includes the no-other-comparison constraint', () => {
    expect(system).toContain('他者比較');
  });

  it('includes the no-ranking constraint', () => {
    expect(system).toContain('順位付け');
  });

  it('includes grounding constraint', () => {
    expect(system).toContain('Grounding');
  });

  it('references growth toward an adjacent class (R4.3)', () => {
    expect(system).toContain('隣接');
  });
});

describe('buildClassFlavorPrompt', () => {
  const prompt = buildClassFlavorPrompt(sampleInput);

  it('includes the className', () => {
    expect(prompt).toContain('前衛の探究者');
  });

  it('includes at least one selectedLabel', () => {
    expect(prompt).toContain('コンポーネント設計');
  });

  it('includes free text grounding', () => {
    expect(prompt).toContain('デザインシステムの構築が得意');
  });

  it('does NOT include raw numeric vocationVector values (Grounding proof)', () => {
    expect(prompt).not.toContain('87.5');
  });
});
