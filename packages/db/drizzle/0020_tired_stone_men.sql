CREATE TYPE "public"."survey_kind" AS ENUM('skill', 'playstyle');--> statement-breakpoint
ALTER TYPE "public"."score_kind" ADD VALUE 'polarity';--> statement-breakpoint
CREATE TABLE "class_diagnosis" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"source_signature" text NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"llm_flavor" jsonb,
	"metadata" jsonb,
	"regeneration_count" integer DEFAULT 0 NOT NULL,
	"regeneration_window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_survey" ADD COLUMN "kind" "survey_kind" DEFAULT 'skill' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_diagnosis" ADD CONSTRAINT "class_diagnosis_candidate_profile_id_candidate_profile_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_diagnosis_candidate_signature_idx" ON "class_diagnosis" USING btree ("candidate_profile_id","source_signature");--> statement-breakpoint
CREATE INDEX "class_diagnosis_candidate_generated_idx" ON "class_diagnosis" USING btree ("candidate_profile_id","generated_at");