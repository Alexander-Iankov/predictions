CREATE TYPE "public"."prediction_window" AS ENUM('auto', 'open', 'locked');--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "prediction_window" "prediction_window" DEFAULT 'auto' NOT NULL;