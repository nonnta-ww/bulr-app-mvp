CREATE TABLE "mock_interview" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"pattern_code" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"formative_feedback" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_profile" ADD COLUMN "quota_reset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mock_interview" ADD CONSTRAINT "mock_interview_candidate_profile_id_candidate_profile_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mock_interview_candidate_profile_id_idx" ON "mock_interview" USING btree ("candidate_profile_id");--> statement-breakpoint
CREATE INDEX "mock_interview_created_at_idx" ON "mock_interview" USING btree ("created_at");