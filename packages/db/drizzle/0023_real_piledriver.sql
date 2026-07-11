CREATE TYPE "public"."consent_method" AS ENUM('interviewer_attestation');--> statement-breakpoint
ALTER TABLE "interview_session" ALTER COLUMN "consent_obtained_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "interview_session" ALTER COLUMN "consent_obtained_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "consent_method" "consent_method";--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "consent_actor_id" text;--> statement-breakpoint
-- interview-consent-gate (Requirement 5.1): 導入前は consent_obtained_at が
-- defaultNow() により全セッションで自動的に「同意済み」扱いになっていた（ゲート vacuous）。
-- 実際の同意取得は行われていないため、既存行の consent_obtained_at を null 化し、
-- 未同意状態として遡って同意ゲートを実効化する。
UPDATE "interview_session" SET "consent_obtained_at" = NULL;