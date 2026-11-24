ALTER TABLE push_subscriptions ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1));
ALTER TABLE push_subscriptions ADD COLUMN is_canary INTEGER NOT NULL DEFAULT 0 CHECK (is_canary IN (0, 1) AND is_canary <= is_test);
ALTER TABLE push_subscriptions ADD COLUMN ops_id TEXT;
CREATE UNIQUE INDEX push_subscriptions_ops_id ON push_subscriptions (ops_id) WHERE ops_id IS NOT NULL;
ALTER TABLE email_subscriptions ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1));

CREATE TABLE notification_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
  generation INTEGER NOT NULL DEFAULT 0
);
INSERT INTO notification_settings (id, paused) VALUES (1, 0);

-- Claims make repeat and concurrent operator requests safe across Worker isolates.
CREATE TABLE notification_runs (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  origin TEXT NOT NULL,
  audience TEXT NOT NULL,
  fips TEXT NOT NULL,
  completed_at INTEGER
);
CREATE INDEX notification_runs_origin_at ON notification_runs (origin, at);

CREATE TABLE notification_delivery_log (
  id INTEGER PRIMARY KEY,
  run_id TEXT NOT NULL,
  at TEXT NOT NULL,
  channel TEXT NOT NULL,
  audience TEXT NOT NULL,
  mode TEXT NOT NULL,
  fips TEXT NOT NULL,
  target_masked TEXT,
  result TEXT NOT NULL,
  provider_id TEXT,
  error TEXT
);
