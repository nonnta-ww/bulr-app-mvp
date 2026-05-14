CREATE TYPE "public"."interview_session_status" AS ENUM('draft', 'in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."question_intent" AS ENUM('deep_dive', 'meta_cognition', 'next_pattern');--> statement-breakpoint
CREATE TYPE "public"."pattern_match_confidence" AS ENUM('exact', 'inferred_high', 'inferred_low', 'off_pattern');--> statement-breakpoint
CREATE TYPE "public"."question_source" AS ENUM('llm_candidate_1', 'llm_candidate_2', 'llm_candidate_3', 'manual');--> statement-breakpoint
CREATE TYPE "public"."stuck_type" AS ENUM('not_experienced', 'shallow', 'single_option', 'rigid');--> statement-breakpoint
CREATE TABLE "candidate" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"applied_role" text NOT NULL,
	"background_summary" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_session" (
	"id" text PRIMARY KEY NOT NULL,
	"interviewer_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"status" "interview_session_status" DEFAULT 'draft' NOT NULL,
	"role" text DEFAULT 'backend' NOT NULL,
	"planned_pattern_codes" text[] NOT NULL,
	"consent_obtained_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_version" text DEFAULT 'ja-v1' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"prepared_for_turn_no" integer NOT NULL,
	"candidate_1_text" text NOT NULL,
	"candidate_1_intent" "question_intent" NOT NULL,
	"candidate_2_text" text NOT NULL,
	"candidate_2_intent" "question_intent" NOT NULL,
	"candidate_3_text" text NOT NULL,
	"candidate_3_intent" "question_intent" NOT NULL,
	"selected_index" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_turn" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"sequence_no" integer NOT NULL,
	"pattern_id" text,
	"proposal_id" text,
	"question_source" "question_source" NOT NULL,
	"question_text" text NOT NULL,
	"audio_key" text,
	"audio_expires_at" timestamp with time zone,
	"transcript" jsonb NOT NULL,
	"llm_analysis" jsonb NOT NULL,
	"pattern_match_confidence" "pattern_match_confidence" NOT NULL,
	"off_pattern_summary" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pattern_coverage" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"pattern_id" text NOT NULL,
	"level_reached" integer NOT NULL,
	"stuck_type" "stuck_type",
	"llm_evaluation" jsonb NOT NULL,
	"manual_evaluation" jsonb,
	"turn_ids" text[] NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_report" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"heatmap_data" jsonb NOT NULL,
	"summary_text" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_report_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_interviewer_id_user_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_proposal" ADD CONSTRAINT "question_proposal_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turn" ADD CONSTRAINT "interview_turn_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turn" ADD CONSTRAINT "interview_turn_pattern_id_assessment_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."assessment_pattern"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turn" ADD CONSTRAINT "interview_turn_proposal_id_question_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."question_proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_coverage" ADD CONSTRAINT "pattern_coverage_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_coverage" ADD CONSTRAINT "pattern_coverage_pattern_id_assessment_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."assessment_pattern"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_report" ADD CONSTRAINT "session_report_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pattern_coverage_session_pattern_unique" ON "pattern_coverage" USING btree ("session_id","pattern_id");