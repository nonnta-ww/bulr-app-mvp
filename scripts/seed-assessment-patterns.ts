import { db } from '@bulr/db';
import { assessmentPattern } from '@bulr/db/schema';
import { assessmentPatterns, EXPECTED_COUNTS, countByCategory } from '@bulr/db/seeds';
import { sql } from 'drizzle-orm';

async function main(): Promise<void> {
  // 1. Validate DATABASE_URL
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  // 2. Validate all codes
  const CODE_REGEX = /^[DTPSOA]-\d{2}$/;
  for (const p of assessmentPatterns) {
    if (!CODE_REGEX.test(p.code)) {
      throw new Error(`Invalid code: ${p.code}`);
    }
  }

  // 3. Upsert in transaction
  await db.transaction(async (tx) => {
    await tx
      .insert(assessmentPattern)
      .values([...assessmentPatterns])
      .onConflictDoUpdate({
        target: assessmentPattern.code,
        set: {
          category: sql`excluded.category`,
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          expected_scope_min: sql`excluded.expected_scope_min`,
          expected_scope_max: sql`excluded.expected_scope_max`,
          level_1_intro: sql`excluded.level_1_intro`,
          level_2_focus: sql`excluded.level_2_focus`,
          level_3_focus: sql`excluded.level_3_focus`,
          level_4_focus: sql`excluded.level_4_focus`,
          signals: sql`excluded.signals`,
          ai_perspective: sql`excluded.ai_perspective`,
          updated_at: new Date(),
        },
      });
  });

  // 4. Log counts
  const actualCounts = countByCategory(assessmentPatterns);
  const total = assessmentPatterns.length;

  console.log(`assessment_pattern: total = ${total}`);
  console.log(
    `category: design = ${actualCounts.design}, trouble = ${actualCounts.trouble}, performance = ${actualCounts.performance}, security = ${actualCounts.security}, organization = ${actualCounts.organization}, ai = ${actualCounts.ai}`,
  );

  // 5. Warn if counts don't match expectations
  let hasCountMismatch = false;
  for (const [category, expected] of Object.entries(EXPECTED_COUNTS) as [
    keyof typeof EXPECTED_COUNTS,
    number,
  ][]) {
    const actual = actualCounts[category];
    if (actual !== expected) {
      hasCountMismatch = true;
      console.error(
        `Count mismatch for category "${category}": expected = ${expected}, actual = ${actual}`,
      );
    }
  }

  if (total !== 57) {
    console.error(`Total count mismatch: expected = 57, actual = ${total}`);
  }

  if (!hasCountMismatch && total === 57) {
    console.log('Seed completed successfully.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
