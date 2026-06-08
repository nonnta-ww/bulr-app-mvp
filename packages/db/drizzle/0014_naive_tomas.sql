DROP INDEX "skill_survey_response_candidate_survey_idx";--> statement-breakpoint
DROP INDEX "self_analysis_candidate_survey_idx";--> statement-breakpoint
CREATE INDEX "skill_survey_response_candidate_survey_submitted_idx" ON "skill_survey_response" USING btree ("candidate_profile_id","skill_survey_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "self_analysis_source_response_idx" ON "self_analysis" USING btree ("source_response_id");--> statement-breakpoint
CREATE INDEX "self_analysis_candidate_survey_submitted_idx" ON "self_analysis" USING btree ("candidate_profile_id","skill_survey_id","source_submitted_at");