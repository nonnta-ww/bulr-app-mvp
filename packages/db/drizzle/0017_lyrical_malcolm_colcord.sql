CREATE TYPE "public"."score_kind" AS ENUM('proficiency', 'recency');--> statement-breakpoint
ALTER TABLE "skill_survey_choice" ADD COLUMN "level" integer;--> statement-breakpoint
ALTER TABLE "skill_survey_question" ADD COLUMN "scoring_kind" "score_kind";