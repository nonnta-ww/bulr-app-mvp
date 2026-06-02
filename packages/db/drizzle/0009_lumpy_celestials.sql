ALTER TABLE "interview_session" ALTER COLUMN "candidate_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "entry_id" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE no action ON UPDATE no action;