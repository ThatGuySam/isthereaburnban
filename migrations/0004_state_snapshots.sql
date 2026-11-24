-- Store source revisions alongside their heads, partitioning national feeds by state.
ALTER TABLE source_refresh ADD COLUMN stored INTEGER NOT NULL DEFAULT 0;
CREATE TABLE source_payload (
  id TEXT NOT NULL,
  state TEXT NOT NULL,
  hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (id, state)
);

-- One serialized refresh at a time. Each state commits its shard, transition history
-- and pending notices atomically. Two revisions let readers follow a cached index.
CREATE TABLE snapshot_state (
  state TEXT NOT NULL,
  revision TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  summary TEXT NOT NULL,
  active TEXT NOT NULL,
  active_pretty TEXT NOT NULL,
  weather_counties TEXT NOT NULL,
  weather TEXT NOT NULL,
  notices TEXT NOT NULL,
  cached INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (state, revision)
);

CREATE TABLE snapshot_run (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  generated TEXT NOT NULL,
  plan TEXT NOT NULL,
  cursor INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE snapshot_publication (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  slot INTEGER NOT NULL,
  catalog TEXT NOT NULL
);
