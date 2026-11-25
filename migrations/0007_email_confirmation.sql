ALTER TABLE email_subscriptions ADD COLUMN fips_key TEXT;
ALTER TABLE email_subscriptions ADD COLUMN merged_into TEXT;

UPDATE email_subscriptions
SET email = lower(trim(email)),
    fips_key = (SELECT json_group_array(value) FROM
      (SELECT DISTINCT value FROM json_each(fips_json) ORDER BY value));

-- Keep one active row per address and county selection. Preserve the subscription
-- behind old unsubscribe links when collapsing duplicate confirmations.
WITH ranked AS (
  SELECT id, first_value(id) OVER canonical AS primary_id,
    max(is_test) OVER (PARTITION BY email, fips_key) AS any_test
  FROM email_subscriptions WHERE unsubscribed_at IS NULL
  WINDOW canonical AS (PARTITION BY email, fips_key
    ORDER BY (confirmed_at IS NOT NULL) DESC, created DESC, id)
)
UPDATE email_subscriptions AS s
SET is_test = ranked.any_test,
    merged_into = CASE WHEN s.id <> ranked.primary_id THEN ranked.primary_id END,
    unsubscribed_at = CASE WHEN s.id <> ranked.primary_id THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END
FROM ranked WHERE s.id = ranked.id;

CREATE UNIQUE INDEX email_subscriptions_active_selection ON email_subscriptions(email, fips_key)
  WHERE unsubscribed_at IS NULL;
CREATE TABLE email_confirmation_gate (
  email TEXT PRIMARY KEY,
  next_send_at INTEGER NOT NULL,
  nonce TEXT NOT NULL
);
