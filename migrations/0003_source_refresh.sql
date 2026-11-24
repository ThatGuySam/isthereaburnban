-- Source refresh checkpoints protect the queue from duplicate and out-of-order delivery.
-- KV holds publisher data and the public snapshot.
CREATE TABLE source_refresh (
  id TEXT PRIMARY KEY,
  slot INTEGER NOT NULL,
  hash TEXT,
  health TEXT NOT NULL
);

-- A single checkpoint journals the snapshot and its alerts with the transition insert.
-- A retried merge resumes KV publication before handling another set of source changes.
CREATE TABLE source_snapshot (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  id TEXT NOT NULL,
  signature TEXT NOT NULL,
  published INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  notices TEXT NOT NULL
);
