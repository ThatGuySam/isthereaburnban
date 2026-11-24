export interface Env {
  ASSETS: Fetcher;
  KV: KVNamespace; // key "snapshot:v1" -> Snapshot JSON (src/shared/types.ts)
  DB: D1Database; // subscriptions, transitions (migrations/)
  SITE_URL: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY?: string; // secret
  VAPID_SUBJECT: string;
  RESEND_API_KEY?: string; // secret; when absent, email signups are stored but not sent
  EMAIL_FROM?: string;
}

export const SNAPSHOT_KEY = "snapshot:v1";
