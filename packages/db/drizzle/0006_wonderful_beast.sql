CREATE TYPE "public"."question_type" AS ENUM('single_choice', 'multi_choice', 'free_text');--> statement-breakpoint
CREATE TABLE "skill_survey" (
	"id" text PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_survey_job_type_unique" UNIQUE("job_type")
);
--> statement-breakpoint
CREATE TABLE "skill_survey_category" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_survey_id" text NOT NULL,
	"name" text NOT NULL,
	"subcategory" text,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_survey_choice" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"label" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_survey_question" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"body" text NOT NULL,
	"question_type" "question_type" NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_survey_answer" (
	"id" text PRIMARY KEY NOT NULL,
	"response_id" text NOT NULL,
	"question_id" text NOT NULL,
	"selected_choice_ids" text[],
	"free_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_survey_response" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"skill_survey_id" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_survey_category" ADD CONSTRAINT "skill_survey_category_skill_survey_id_skill_survey_id_fk" FOREIGN KEY ("skill_survey_id") REFERENCES "public"."skill_survey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_survey_choice" ADD CONSTRAINT "skill_survey_choice_question_id_skill_survey_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."skill_survey_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_survey_question" ADD CONSTRAINT "skill_survey_question_category_id_skill_survey_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_survey_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_survey_answer" ADD CONSTRAINT "skill_survey_answer_response_id_skill_survey_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."skill_survey_response"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_survey_answer" ADD CONSTRAINT "skill_survey_answer_question_id_skill_survey_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."skill_survey_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_survey_response" ADD CONSTRAINT "skill_survey_response_candidate_profile_id_candidate_profile_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_survey_response" ADD CONSTRAINT "skill_survey_response_skill_survey_id_skill_survey_id_fk" FOREIGN KEY ("skill_survey_id") REFERENCES "public"."skill_survey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_survey_category_survey_name_sub_idx" ON "skill_survey_category" USING btree ("skill_survey_id","name","subcategory");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_survey_choice_question_label_idx" ON "skill_survey_choice" USING btree ("question_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_survey_question_category_body_idx" ON "skill_survey_question" USING btree ("category_id","body");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_survey_response_candidate_survey_idx" ON "skill_survey_response" USING btree ("candidate_profile_id","skill_survey_id");