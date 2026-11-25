CREATE TABLE source_jobs (
  source_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  PRIMARY KEY (source_id, slot)
);
CREATE INDEX source_jobs_slot ON source_jobs(slot);

CREATE TABLE source_dead_letters (
  message_id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  body TEXT NOT NULL,
  replayed_at INTEGER
);

CREATE TABLE source_monitor (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  started_at INTEGER NOT NULL
);

CREATE TABLE source_issues (
  id TEXT PRIMARY KEY,
  opened_at INTEGER NOT NULL,
  detail TEXT NOT NULL
);
