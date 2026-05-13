import type { AssessmentPatternSeed, PatternCategory } from './types';
import { designPatterns } from './patterns/design';
import { troublePatterns } from './patterns/trouble';
import { performancePatterns } from './patterns/performance';
import { securityPatterns } from './patterns/security';
import { organizationPatterns } from './patterns/organization';
import { aiPatterns } from './patterns/ai';

export const assessmentPatterns: readonly AssessmentPatternSeed[] = [
  ...designPatterns,
  ...troublePatterns,
  ...performancePatterns,
  ...securityPatterns,
  ...organizationPatterns,
  ...aiPatterns,
] as const;

export const EXPECTED_COUNTS: Readonly<Record<PatternCategory, number>> = {
  design: 15,
  trouble: 12,
  performance: 8,
  security: 8,
  organization: 8,
  ai: 6,
} as const;

export function countByCategory(
  patterns: readonly AssessmentPatternSeed[],
): Record<PatternCategory, number> {
  const counts: Record<PatternCategory, number> = {
    design: 0,
    trouble: 0,
    performance: 0,
    security: 0,
    organization: 0,
    ai: 0,
  };
  for (const p of patterns) counts[p.category]++;
  return counts;
}
