ALTER TABLE notification_runs ADD COLUMN push_seed_token TEXT;

CREATE TABLE notification_push_deliveries (
  run_id TEXT NOT NULL REFERENCES notification_runs(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL REFERENCES push_subscriptions(endpoint) ON DELETE CASCADE,
  fips TEXT NOT NULL,
  notice TEXT NOT NULL,
  pause_generation INTEGER NOT NULL,
  available_at INTEGER,
  lease TEXT,
  sent_at INTEGER,
  PRIMARY KEY (run_id, endpoint, fips)
);
CREATE INDEX notification_push_deliveries_due ON notification_push_deliveries (pause_generation, available_at)
  WHERE available_at IS NOT NULL;
