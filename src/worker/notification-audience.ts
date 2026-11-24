import type { Env } from "./env";
import type { Notice } from "./notification-message";
import type { PushTarget } from "./push";

export const CHANNELS = ["push", "email"] as const;
export type Channel = typeof CHANNELS[number];
export const RESEND_TEST_ADDRESSES = ["delivered@resend.dev", "bounced@resend.dev", "complained@resend.dev"] as const;
export type SandboxAddress = typeof RESEND_TEST_ADDRESSES[number];

export type Audience =
  | { kind: "all" | "test" | "canary" }
  | { kind: "push-devices"; ids: string[] }
  | { kind: "sandbox"; address: SandboxAddress };

type PushRow = PushTarget & { fips_json: string };
type EmailTarget = { id: string; email: string; token: string | null };
type EmailRow = EmailTarget & { fips_json: string };

export type Delivery =
  | { channel: "push"; target: PushTarget; notices: [Notice] }
  | { channel: "email"; target: EmailTarget; notices: Notice[] };

export type AudienceWindow = { limit: number; offset: number };
export type AudiencePlan = { deliveries: Delivery[]; subscriptions: number };

const SUBSCRIBERS = {
  push: { table: "push_subscriptions", id: "endpoint", columns: "endpoint, p256dh, auth" },
  email: { table: "email_subscriptions", id: "id", columns: "id, email, token" },
} satisfies Record<Channel, { table: string; id: string; columns: string }>;

export async function planAudience(
  env: Env, channel: Channel, audience: Audience, notices: Notice[], window?: AudienceWindow,
): Promise<AudiencePlan> {
  if (!notices.length || (channel === "email" && (audience.kind === "push-devices" || audience.kind === "canary"))) {
    return { deliveries: [], subscriptions: 0 };
  }
  if (audience.kind === "sandbox") {
    return channel === "email"
      ? { deliveries: [{ channel, target: { id: "sandbox", email: audience.address, token: null }, notices }], subscriptions: 1 }
      : { deliveries: [], subscriptions: 0 };
  }

  const { table, id, columns } = SUBSCRIBERS[channel];
  const byFips = new Map(notices.map((notice) => [notice.fips, notice]));
  const values: (string | number)[] = [];
  const filters = [];
  if (channel === "email") filters.push("confirmed_at IS NOT NULL", "unsubscribed_at IS NULL");
  if (audience.kind !== "all") filters.push("is_test = 1");
  if (audience.kind === "canary") filters.push("is_canary = 1");
  if (audience.kind === "push-devices") {
    filters.push("ops_id IN (SELECT value FROM json_each(?))");
    values.push(JSON.stringify(audience.ids));
  }
  filters.push("EXISTS (SELECT 1 FROM json_each(fips_json) WHERE value IN (SELECT value FROM json_each(?)))");
  values.push(JSON.stringify([...byFips.keys()]));

  const from = `FROM ${table} WHERE ${filters.join(" AND ")}`;
  const rows = env.DB.prepare(
    `SELECT ${columns}, fips_json${window ? ", COUNT(*) OVER () AS total_count" : ""}
     ${from} ORDER BY ${id}${window ? " LIMIT ? OFFSET ?" : ""}`,
  ).bind(...values, ...(window ? [window.limit, window.offset] : []));
  const matchingNotices = (row: PushRow | EmailRow): Notice[] =>
    (JSON.parse(row.fips_json) as string[]).flatMap((fips) => byFips.get(fips) ?? []);
  async function readPage<Row>() {
    const { results } = await rows.all<Row & { total_count?: number }>();
    // An empty page after the first can occur when subscriptions change between requests.
    const total = results[0]?.total_count ?? (window?.offset
      ? await env.DB.prepare(`SELECT COUNT(*) AS count ${from}`).bind(...values).first<number>("count")
      : results.length);
    return { results, subscriptions: total ?? 0 };
  }

  if (channel === "email") {
    const { results, subscriptions } = await readPage<EmailRow>();
    return {
      deliveries: results.map((target) => ({ channel, target, notices: matchingNotices(target) })),
      subscriptions,
    };
  }
  const { results, subscriptions } = await readPage<PushRow>();
  return {
    deliveries: results.flatMap((target) => matchingNotices(target).map((notice): Delivery => ({
      channel, target, notices: [notice],
    }))),
    subscriptions,
  };
}

export function maskPush(endpoint: string): string {
  try {
    return `${new URL(endpoint).hostname} · …${endpoint.slice(-4)}`;
  } catch {
    return "Push subscription";
  }
}

export function maskTarget(delivery: Delivery): string {
  if (delivery.channel === "push") return maskPush(delivery.target.endpoint);
  if (delivery.target.id === "sandbox") return delivery.target.email;
  const [local, domain] = delivery.target.email.split("@");
  return `${[...local][0] ?? ""}…@${[...(domain ?? "")][0] ?? ""}… · ${delivery.target.id.slice(0, 6)}`;
}
