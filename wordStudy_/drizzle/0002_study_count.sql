ALTER TABLE lessons ADD COLUMN study_count integer NOT NULL DEFAULT 0 CHECK (study_count >= 0);
--> statement-breakpoint
UPDATE lessons SET study_count = 1;
--> statement-breakpoint
CREATE TABLE study_completions (
  event_id uuid PRIMARY KEY,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now()
);
