/**
 * resume_document テーブル定義
 *
 * 候補者がアップロードした履歴書ドキュメント。`candidate_profile` に紐づく候補者所有の
 * ポータブル資産として管理され、Vercel Blob（private）に保存される。
 * 種別（resumeKind）ごとに primary フラグを持ち、Wave 3 `entry-flow` が
 * is_primary=true のドキュメントを参照するための seam を提供する。
 */

import { boolean, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { candidateProfile } from './candidate-profile';

export const resumeKind = pgEnum('resume_kind', ['履歴書', '職務経歴書', 'CV', 'レジュメ']);

export const resumeDocument = pgTable('resume_document', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  candidateProfileId: text('candidate_profile_id')
    .notNull()
    .references(() => candidateProfile.id),
  kind: resumeKind('kind').notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  blobUrl: text('blob_url').notNull(),
  blobPathname: text('blob_pathname').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  originalFilename: text('original_filename').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ResumeDocument = typeof resumeDocument.$inferSelect;
export type NewResumeDocument = typeof resumeDocument.$inferInsert;

// ResumeKind は pgEnum から派生（DRY 原則: enum 値の単一の真実を pgEnum 側に置く）
// packages/db のバレルで再 export し、後続 spec は `import type { ResumeKind } from '@bulr/db'` する
export type ResumeKind = (typeof resumeKind.enumValues)[number];
