ALTER TABLE snapshot_state ADD COLUMN chunked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE snapshot_state ADD COLUMN encoded_bytes INTEGER;

CREATE TABLE snapshot_state_part (
  state TEXT NOT NULL,
  revision TEXT NOT NULL,
  field TEXT NOT NULL,
  part INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (state, revision, field, part),
  FOREIGN KEY (state, revision) REFERENCES snapshot_state(state, revision) ON DELETE CASCADE
);
