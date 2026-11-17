ALTER TABLE lessons ADD COLUMN tags text[] NOT NULL DEFAULT '{}', ADD COLUMN level text, ADD COLUMN revision text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE lines ADD COLUMN key_phrase text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE auth_sessions (id text PRIMARY KEY, user_id text, csrf text NOT NULL, state text, nonce text, verifier text, expires_at timestamptz NOT NULL);
--> statement-breakpoint
CREATE TABLE legacy_progress_claims (user_id text PRIMARY KEY);
