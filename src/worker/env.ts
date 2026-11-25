import type { SourceMessage } from "./sources/queue";

export interface Env {
  ASSETS: Fetcher;
  KV: KVNamespace; // v2 catalog, active projection and cached state shards; v1 rollout fallback
  SOURCE_QUEUE?: Queue<SourceMessage>;
  DB: D1Database; // source revisions, snapshot publication journal, subscriptions and transitions (migrations/)
  SITE_URL: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY?: string; // secret
  VAPID_SUBJECT: string;
  RESEND_API_KEY?: string; // secret; when absent, email signup is unavailable
  EMAIL_FROM?: string;
  OPS_ALERT_EMAIL?: string; // optional operational recipient (secret)
  EMAIL?: SendEmail; // Cloudflare Email Service binding; used when EMAIL_TRANSPORT is "cloudflare"
  EMAIL_TRANSPORT?: string; // "cloudflare" turns on the EMAIL binding once the domain is onboarded for sending
  DASH_TOKEN?: string;
  PUSH_CANARY_ENABLED?: string;
  PUSH_CANARY_FIPS?: string;
  USAGE?: AnalyticsEngineDataset; // aggregate API/MCP counts (src/worker/usage.ts); optional
}

export const SNAPSHOT_KEY = "snapshot:v1";

/** True when some email transport is configured: Cloudflare Email Service, or Resend as the fallback. */
export function emailConfigured(env: Pick<Env, "RESEND_API_KEY" | "EMAIL" | "EMAIL_TRANSPORT">): boolean {
  return Boolean((env.EMAIL && env.EMAIL_TRANSPORT === "cloudflare") || env.RESEND_API_KEY);
}
