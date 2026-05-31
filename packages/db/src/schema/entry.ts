import { pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { candidateProfile } from './candidate-profile';
import { opening } from './opening';
import { invitation } from './invitation';
import { resumeDocument } from './resume-document';
import { skillSurveyResponse } from './skill-survey-response';

export const entryStatus = pgEnum('entry_status', [
  'submitted',
  'reviewed',
  'rejected',
  'progressing',
]);

export const entry = pgTable(
  'entry',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    candidateProfileId: text('candidate_profile_id')
      .notNull()
      .references(() => candidateProfile.id),
    openingId: text('opening_id')
      .notNull()
      .references(() => opening.id),
    invitationId: text('invitation_id')
      .notNull()
      .references(() => invitation.id),
    resumeDocumentId: text('resume_document_id')
      .references(() => resumeDocument.id, { onDelete: 'set null' }),
    skillSurveyResponseId: text('skill_survey_response_id')
      .references(() => skillSurveyResponse.id, { onDelete: 'set null' }),
    status: entryStatus('status').notNull().default('submitted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('entry_candidate_opening_uniq').on(
      table.candidateProfileId,
      table.openingId,
    ),
  ],
);

export type Entry = typeof entry.$inferSelect;
export type NewEntry = typeof entry.$inferInsert;
export type EntryStatus = (typeof entryStatus.enumValues)[number];
