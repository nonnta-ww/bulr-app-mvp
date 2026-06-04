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
