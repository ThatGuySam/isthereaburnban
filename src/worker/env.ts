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
  RESEND_API_KEY?: string; // secret; when absent, email signups are stored but not sent
  EMAIL_FROM?: string;
  DASH_TOKEN?: string;
  PUSH_CANARY_ENABLED?: string;
  PUSH_CANARY_FIPS?: string;
  USAGE?: AnalyticsEngineDataset; // aggregate API/MCP counts (src/worker/usage.ts); optional
}

export const SNAPSHOT_KEY = "snapshot:v1";
