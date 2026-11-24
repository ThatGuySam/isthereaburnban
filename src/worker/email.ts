import { cleanFipsList, COUNTY_BY_FIPS } from "./counties";
import type { DeliveryOutcome } from "./delivery";
import type { Env } from "./env";
import type { Notice } from "./notification-message";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function from(env: Env): string {
  return env.EMAIL_FROM || "Is There a Burn Ban? <alerts@isthereaburnban.com>";
}

async function sendEmail(
  env: Env, to: string, subject: string, text: string, idempotencyKey?: string,
): Promise<string | undefined> {
  if (!env.RESEND_API_KEY) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ from: from(env), to: [to], subject, text }),
  });
  if (!res.ok) throw new ResendError(res.status);
  const body: unknown = await res.json().catch(() => null);
  if (body && typeof body === "object" && "id" in body &&
      typeof body.id === "string" && /^[a-z0-9_-]{1,128}$/i.test(body.id)) return body.id;
}

class ResendError extends Error {
  constructor(status: number) {
    super(`Resend HTTP ${status}`);
  }
}

function countyNames(fips: string[]): string {
  return fips.map((f) => { const c = COUNTY_BY_FIPS.get(f); return c ? `${c.name}, ${c.state}` : f; }).join("; ");
}

export async function subscribeEmail(env: Env, body: unknown): Promise<{ ok: boolean; pending?: boolean; emailEnabled?: boolean; error?: string }> {
  const b = (body ?? {}) as { email?: unknown; fips?: unknown };
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "a valid email is required" };
  const fips = cleanFipsList(b.fips);
  if (!fips.length) return { ok: false, error: "fips must be a non-empty array of 5-digit county FIPS codes" };

  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO email_subscriptions (id, email, fips_json, token, confirmed_at, created, unsubscribed_at) VALUES (?, ?, ?, ?, NULL, ?, NULL)",
  )
    .bind(crypto.randomUUID(), email, JSON.stringify(fips), token, now)
    .run();

  const emailEnabled = Boolean(env.RESEND_API_KEY);
  if (emailEnabled) {
    const base = env.SITE_URL.replace(/\/$/, "");
    await sendEmail(
      env,
      email,
      "Confirm your burn ban alerts",
      `Someone (hopefully you) asked for burn ban alerts for: ${countyNames(fips)}.\n\n` +
        `Confirm: ${base}/api/v1/email/confirm?token=${token}\n\n` +
        `If this wasn't you, ignore this email and nothing will be sent.\n`,
    );
  }
  return { ok: true, pending: true, emailEnabled };
}

export async function confirmEmail(env: Env, token: string): Promise<boolean> {
  if (!token) return false;
  const r = await env.DB.prepare("UPDATE email_subscriptions SET confirmed_at = COALESCE(confirmed_at, ?) WHERE token = ? AND unsubscribed_at IS NULL")
    .bind(new Date().toISOString(), token)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function unsubscribeEmail(env: Env, token: string): Promise<boolean> {
  if (!token) return false;
  const r = await env.DB.prepare("UPDATE email_subscriptions SET unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE token = ?")
    .bind(new Date().toISOString(), token)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function sendAlertEmail(
  env: Env, target: { email: string; token: string | null }, notices: Notice[], idempotencyKey: string,
): Promise<DeliveryOutcome> {
  if (!env.RESEND_API_KEY) return { result: "error", error: "Resend is unavailable" };
  const base = env.SITE_URL.replace(/\/$/, "");
  const footer = target.token
    ? `\nUnsubscribe: ${base}/api/v1/email/unsubscribe?token=${target.token}\n` : "";
  const text = notices.map((m) => `${m.title}\n${m.body}\n${base}${m.url}`).join("\n\n") +
    "\n\nInformational only. Always confirm with the official source before burning." + footer;
  const subject = notices.length === 1 ? notices[0].title : `Burn ban changes in ${notices.length} counties`;
  try {
    const providerId = await sendEmail(env, target.email, subject, text, idempotencyKey);
    return { result: "accepted", providerId };
  } catch (err) {
    return { result: "error", error: err instanceof ResendError ? err.message : "Resend request failed" };
  }
}
