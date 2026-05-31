CREATE TYPE "public"."entry_status" AS ENUM('submitted', 'reviewed', 'rejected', 'progressing');--> statement-breakpoint
CREATE TABLE "entry" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"opening_id" text NOT NULL,
	"invitation_id" text NOT NULL,
	"resume_document_id" text,
	"skill_survey_response_id" text,
	"status" "entry_status" DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_candidate_profile_id_candidate_profile_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_opening_id_opening_id_fk" FOREIGN KEY ("opening_id") REFERENCES "public"."opening"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_resume_document_id_resume_document_id_fk" FOREIGN KEY ("resume_document_id") REFERENCES "public"."resume_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_skill_survey_response_id_skill_survey_response_id_fk" FOREIGN KEY ("skill_survey_response_id") REFERENCES "public"."skill_survey_response"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_candidate_opening_uniq" ON "entry" USING btree ("candidate_profile_id","opening_id");