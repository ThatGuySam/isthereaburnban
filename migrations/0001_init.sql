-- Push subscriptions: one row per browser endpoint, with the counties it follows.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  fips_json TEXT NOT NULL, -- JSON array of 5-digit FIPS strings
  created TEXT NOT NULL
);

-- Email alerts, double opt-in. token confirms and unsubscribes.
CREATE TABLE IF NOT EXISTS email_subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  fips_json TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  confirmed_at TEXT,
  created TEXT NOT NULL,
  unsubscribed_at TEXT
);
CREATE INDEX IF NOT EXISTS email_subscriptions_email ON email_subscriptions (email);

-- Status changes seen by the hourly refresh.
CREATE TABLE IF NOT EXISTS transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fips TEXT NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS transitions_fips_at ON transitions (fips, at);
