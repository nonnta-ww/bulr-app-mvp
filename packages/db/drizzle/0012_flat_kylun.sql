CREATE TABLE "self_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"skill_survey_id" text NOT NULL,
	"source_response_id" text NOT NULL,
	"source_submitted_at" timestamp with time zone NOT NULL,
	"aggregated_snapshot" jsonb NOT NULL,
	"llm_output" jsonb,
	"metadata" jsonb,
	"regeneration_count" integer DEFAULT 0 NOT NULL,
	"regeneration_window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "self_analysis" ADD CONSTRAINT "self_analysis_candidate_profile_id_candidate_profile_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_analysis" ADD CONSTRAINT "self_analysis_skill_survey_id_skill_survey_id_fk" FOREIGN KEY ("skill_survey_id") REFERENCES "public"."skill_survey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_analysis" ADD CONSTRAINT "self_analysis_source_response_id_skill_survey_response_id_fk" FOREIGN KEY ("source_response_id") REFERENCES "public"."skill_survey_response"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "self_analysis_candidate_survey_idx" ON "self_analysis" USING btree ("candidate_profile_id","skill_survey_id");