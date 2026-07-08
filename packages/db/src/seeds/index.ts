export type { AssessmentPatternCode, AssessmentPatternSeed, PatternCategory } from './types';
export { assessmentPatterns, EXPECTED_COUNTS, countByCategory } from './assessment-patterns';
export { runBackendSkillSurveySeed } from './skill-surveys/backend';
export { runAiDrivenDevelopmentSkillSurveySeed } from './skill-surveys/ai-driven-development';
export { runFrontendSkillSurveySeed } from './skill-surveys/frontend';
export { runInfrastructureSreSkillSurveySeed } from './skill-surveys/infrastructure-sre';
export { runEngineeringManagerSkillSurveySeed } from './skill-surveys/engineering-manager';
export { runPlaystyleSkillSurveySeed } from './skill-surveys/playstyle';
export { runThinkingStyleSkillSurveySeed } from './skill-surveys/thinking-style';

// ---------------------------------------------------------------------------
// CLI entry point
// Run: tsx packages/db/src/seeds/index.ts
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { db } = await import('../client');
  const { runBackendSkillSurveySeed } = await import('./skill-surveys/backend');
  const { runAiDrivenDevelopmentSkillSurveySeed } = await import('./skill-surveys/ai-driven-development');
  const { runFrontendSkillSurveySeed } = await import('./skill-surveys/frontend');
  const { runInfrastructureSreSkillSurveySeed } = await import('./skill-surveys/infrastructure-sre');
  const { runEngineeringManagerSkillSurveySeed } = await import('./skill-surveys/engineering-manager');
  const { runPlaystyleSkillSurveySeed } = await import('./skill-surveys/playstyle');
  const { runThinkingStyleSkillSurveySeed } = await import('./skill-surveys/thinking-style');

  await runBackendSkillSurveySeed(db);
  await runAiDrivenDevelopmentSkillSurveySeed(db);
  await runFrontendSkillSurveySeed(db);
  await runInfrastructureSreSkillSurveySeed(db);
  await runEngineeringManagerSkillSurveySeed(db);
  await runPlaystyleSkillSurveySeed(db);
  await runThinkingStyleSkillSurveySeed(db);

  console.log('All seeds completed.');
}

// Execute only when run directly (not when imported as a module)
// tsx sets import.meta.url === `file://${process.argv[1]}` when running as a script
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
