CREATE TYPE "public"."capture_recording_kind" AS ENUM('mic_chunk', 'bot_full');--> statement-breakpoint
CREATE TYPE "public"."capture_provider" AS ENUM('recall', 'mic');--> statement-breakpoint
CREATE TYPE "public"."capture_status" AS ENUM('idle', 'bot_joining', 'recording', 'stopping', 'stopped', 'failed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."segment_origin" AS ENUM('bot_realtime', 'mic_chunk', 'post_batch');--> statement-breakpoint
CREATE TYPE "public"."speaker_role" AS ENUM('interviewer', 'candidate', 'unknown');--> statement-breakpoint
CREATE TABLE "capture_recording" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"kind" "capture_recording_kind" NOT NULL,
	"chunk_no" integer,
	"audio_key" text,
	"audio_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"source_id" text NOT NULL,
	"speaker_role" "speaker_role" NOT NULL,
	"speaker_label" text,
	"text" text NOT NULL,
	"started_at_ms" integer NOT NULL,
	"ended_at_ms" integer NOT NULL,
	"origin" "segment_origin" NOT NULL,
	"logical_turn_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "capture_provider" "capture_provider";--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "capture_status" "capture_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "bot_id" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "last_capture_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "analysis_capped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_turn" ADD COLUMN "turn_fingerprint" text;--> statement-breakpoint
ALTER TABLE "capture_recording" ADD CONSTRAINT "capture_recording_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segment" ADD CONSTRAINT "transcript_segment_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segment" ADD CONSTRAINT "transcript_segment_logical_turn_id_interview_turn_id_fk" FOREIGN KEY ("logical_turn_id") REFERENCES "public"."interview_turn"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segment_session_seq_unique" ON "transcript_segment" USING btree ("session_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segment_session_source_unique" ON "transcript_segment" USING btree ("session_id","source_id");--> statement-breakpoint
CREATE INDEX "transcript_segment_session_id_idx" ON "transcript_segment" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_session_bot_id_unique" ON "interview_session" USING btree ("bot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_turn_session_fingerprint_unique" ON "interview_turn" USING btree ("session_id","turn_fingerprint");