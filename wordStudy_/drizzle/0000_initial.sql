CREATE TABLE lessons (
  id text PRIMARY KEY,
  title text NOT NULL,
  date timestamptz,
  description text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE conversations (
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  title text,
  description text[] NOT NULL,
  PRIMARY KEY (lesson_id, ordinal)
);
--> statement-breakpoint
CREATE TABLE lines (
  lesson_id text NOT NULL,
  conversation_ordinal integer NOT NULL,
  ordinal integer NOT NULL,
  speaker text NOT NULL,
  text text NOT NULL,
  meaning text,
  PRIMARY KEY (lesson_id, conversation_ordinal, ordinal),
  FOREIGN KEY (lesson_id, conversation_ordinal) REFERENCES conversations(lesson_id, ordinal) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE progress (
  user_id text NOT NULL,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (user_id, lesson_id)
);
