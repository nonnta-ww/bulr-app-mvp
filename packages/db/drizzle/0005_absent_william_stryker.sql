CREATE TYPE "public"."resume_kind" AS ENUM('履歴書', '職務経歴書', 'CV', 'レジュメ');--> statement-breakpoint
CREATE TABLE "resume_document" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"kind" "resume_kind" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_filename" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_document" ADD CONSTRAINT "resume_document_candidate_profile_id_candidate_profile_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE no action ON UPDATE no action;