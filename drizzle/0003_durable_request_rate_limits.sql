CREATE TABLE "request_rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" text NOT NULL,
  "key_hash" text NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "request_rate_limits_scope_key_window_key" ON "request_rate_limits" USING btree ("scope","key_hash","window_started_at");--> statement-breakpoint
CREATE INDEX "idx_request_rate_limits_window" ON "request_rate_limits" USING btree ("window_started_at");
