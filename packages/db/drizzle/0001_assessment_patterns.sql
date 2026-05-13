CREATE TYPE "public"."pattern_category" AS ENUM('design', 'trouble', 'performance', 'security', 'organization', 'ai');--> statement-breakpoint
CREATE TABLE "assessment_pattern" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"category" "pattern_category" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"expected_scope_min" integer NOT NULL,
	"expected_scope_max" integer NOT NULL,
	"level_1_intro" text NOT NULL,
	"level_2_focus" text NOT NULL,
	"level_3_focus" text NOT NULL,
	"level_4_focus" text NOT NULL,
	"signals" text[] NOT NULL,
	"ai_perspective" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_pattern_code_unique" UNIQUE("code")
);
