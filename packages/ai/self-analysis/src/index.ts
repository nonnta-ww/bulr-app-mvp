// @bulr/ai-self-analysis
// 自己分析の自然言語生成パッケージ（@bulr/db 非依存）

// generateSelfAnalysisNarrative
export { generateSelfAnalysisNarrative } from './generate-self-analysis';

// Zod スキーマ
export { selfAnalysisNarrativeSchema } from './schema';

// 型
export type {
  SelfAnalysisGenInput,
  SelfAnalysisNarrative,
  SelfAnalysisGenResult,
  AggregatedSnapshot,
  CategoryCoverage,
} from './schema';
