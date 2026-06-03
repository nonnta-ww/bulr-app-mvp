ALTER TABLE "candidate_profile" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;