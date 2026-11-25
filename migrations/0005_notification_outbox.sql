CREATE TABLE notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES notification_runs(id) DEFERRABLE INITIALLY DEFERRED,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'email')),
  recipient TEXT,
  notices TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER NOT NULL,
  lease TEXT
);
CREATE INDEX notification_outbox_pending ON notification_outbox(channel, due_at, id) WHERE status = 'pending';
CREATE INDEX notification_outbox_run ON notification_outbox(run_id, status);
