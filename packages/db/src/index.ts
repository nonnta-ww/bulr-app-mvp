export { db } from './client';
export type { DB } from './client';
export * as schema from './schema';
export * from './queries/index';
// Self-analysis 型の直接 export（aggregate _lib / cost _lib から import するため）
export type {
  AggregatedSnapshot,
  CategoryCoverage,
  SelfAnalysisNarrative,
  SelfAnalysisMetadata,
} from './schema/self-analysis';
// SelfAnalysisVersion は trend _lib / compare _lib から import するため明示再 export
export type { SelfAnalysisVersion } from './queries/self-analysis/self-analysis-query';
