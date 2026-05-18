/**
 * pattern_coverage[] + interview_turn[] + assessment_pattern[] から
 * HeatmapData を決定論的に計算する。
 *
 * LLM に算術集計を任せない（速い・安い・正確）。
 * LLM が生成するのは summary_text のみ（generate-session-report.ts 参照）。
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import type {
  PatternCoverage,
  InterviewTurn,
  AssessmentPattern,
} from '@bulr/db/schema';

type CategoryKey = HeatmapData['patterns'][number]['category'];

const ALL_CATEGORIES: CategoryKey[] = [
  'design',
  'trouble',
  'performance',
  'security',
  'organization',
  'ai',
];

function emptyCategoryStats(): HeatmapData['by_category'][CategoryKey] {
  return {
    avg_authenticity: 0,
    avg_judgment: 0,
    avg_scope: 0,
    avg_meta_cognition: 0,
    avg_ai_literacy: 0,
    pattern_count: 0,
  };
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const STUCK_TYPES_DETERIORATED = new Set(['shallow', 'single_option', 'rigid']);

export function aggregateHeatmap(input: {
  allCoverage: PatternCoverage[];
  freeQuestions: InterviewTurn[];
  allPatterns: AssessmentPattern[];
  allTurns: InterviewTurn[]; // turn_count 算出に使う（全 turn、フリー質問込み）
}): HeatmapData {
  const { allCoverage, freeQuestions, allPatterns, allTurns } = input;

  // 高速ルックアップ用
  const patternById = new Map(allPatterns.map((p) => [p.id, p]));

  // turn_count 集計（pattern_id → turn 数）
  const turnCountByPatternId = new Map<string, number>();
  for (const t of allTurns) {
    if (t.pattern_id !== null) {
      turnCountByPatternId.set(t.pattern_id, (turnCountByPatternId.get(t.pattern_id) ?? 0) + 1);
    }
  }

  // ----- patterns 配列を組み立て -----
  const patterns: HeatmapData['patterns'] = allCoverage.flatMap((c) => {
    const pat = patternById.get(c.pattern_id);
    if (!pat) return []; // 想定外、スキップ
    const e = c.llm_evaluation;
    return [{
      pattern_id: c.pattern_id,
      pattern_code: pat.code,
      pattern_title: pat.title,
      category: pat.category as CategoryKey,
      level_reached: c.level_reached as 0 | 1 | 2 | 3 | 4,
      stuck_type: c.stuck_type,
      scores: {
        authenticity: e.authenticity,
        judgment: e.judgment,
        scope: e.scope,
        meta_cognition: e.meta_cognition,
        ai_literacy: e.ai_literacy,
      },
      notes: e.notes,
      turn_count: turnCountByPatternId.get(c.pattern_id) ?? 0,
    }];
  });

  // ----- by_category 集計 -----
  const by_category = Object.fromEntries(
    ALL_CATEGORIES.map((cat) => [cat, emptyCategoryStats()]),
  ) as HeatmapData['by_category'];

  for (const cat of ALL_CATEGORIES) {
    const inCat = patterns.filter((p) => p.category === cat);
    by_category[cat] = {
      avg_authenticity: average(inCat.map((p) => p.scores.authenticity)),
      avg_judgment: average(inCat.map((p) => p.scores.judgment)),
      avg_scope: average(inCat.map((p) => p.scores.scope)),
      avg_meta_cognition: average(inCat.map((p) => p.scores.meta_cognition)),
      avg_ai_literacy: average(inCat.map((p) => p.scores.ai_literacy)),
      pattern_count: inCat.length,
    };
  }

  // ----- scope_distribution -----
  const scope_distribution: HeatmapData['scope_distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of patterns) {
    const s = p.scores.scope;
    if (s >= 1 && s <= 5) {
      scope_distribution[Math.round(s) as 1 | 2 | 3 | 4 | 5]++;
    }
  }

  // ----- ai_literacy_distribution -----
  const ai_literacy_distribution: HeatmapData['ai_literacy_distribution'] = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const p of patterns) {
    const a = p.scores.ai_literacy;
    if (a >= 0 && a <= 3) {
      ai_literacy_distribution[Math.round(a) as 0 | 1 | 2 | 3]++;
    }
  }

  // ----- overall -----
  const overall: HeatmapData['overall'] = {
    avg_authenticity: average(patterns.map((p) => p.scores.authenticity)),
    avg_judgment: average(patterns.map((p) => p.scores.judgment)),
    avg_scope: average(patterns.map((p) => p.scores.scope)),
    avg_meta_cognition: average(patterns.map((p) => p.scores.meta_cognition)),
    avg_ai_literacy: average(patterns.map((p) => p.scores.ai_literacy)),
    reached_count: patterns.filter((p) => p.stuck_type === null && p.level_reached >= 2).length,
    stuck_count: patterns.filter((p) => p.stuck_type !== null && STUCK_TYPES_DETERIORATED.has(p.stuck_type)).length,
    not_experienced_count: patterns.filter((p) => p.stuck_type === 'not_experienced').length,
    undeveloped_count: patterns.filter((p) => p.stuck_type === null && p.level_reached <= 1).length,
  };

  return {
    by_category,
    scope_distribution,
    ai_literacy_distribution,
    free_question_count: freeQuestions.length,
    overall,
    patterns,
  };
}
