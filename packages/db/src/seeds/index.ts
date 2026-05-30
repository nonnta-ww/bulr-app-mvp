export type { AssessmentPatternCode, AssessmentPatternSeed, PatternCategory } from './types';
export { assessmentPatterns, EXPECTED_COUNTS, countByCategory } from './assessment-patterns';
export { runBackendSkillSurveySeed } from './skill-surveys/backend';

// ---------------------------------------------------------------------------
// CLI entry point
// Run: tsx packages/db/src/seeds/index.ts
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { db } = await import('../client');
  const { runBackendSkillSurveySeed } = await import('./skill-surveys/backend');

  await runBackendSkillSurveySeed(db);

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
