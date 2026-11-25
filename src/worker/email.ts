import { cleanFipsList } from "./counties";
import type { DeliveryOutcome } from "./delivery";
import { DEFAULT_EMAIL_FROM, renderAlertEmail, renderConfirmationEmail, UNSUBSCRIBE_FIELD, UNSUBSCRIBE_VALUE, type EmailMessage } from "./email-message";
import { emailConfigured, type Env } from "./env";
import type { Notice } from "./notification-message";
import { readLimitedBody, RequestBodyError } from "./request-body";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function from(env: Env): string {
  return env.EMAIL_FROM || DEFAULT_EMAIL_FROM;
}

async function sendEmail(
  env: Env, to: string, message: EmailMessage, idempotencyKey: string,
): Promise<string | undefined> {
  if (env.EMAIL && env.EMAIL_TRANSPORT === "cloudflare") {
    try {
      const sent = await env.EMAIL.send({
        from: parseFrom(from(env)), to, ...message,
        headers: { ...message.headers, "X-Entity-Ref-ID": idempotencyKey },
      });
      return sent.messageId;
    } catch (err) {
      throw new EmailProviderError(0, `Cloudflare Email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!env.RESEND_API_KEY) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ from: from(env), to: [to], ...message }),
  });
  if (!res.ok) throw new EmailProviderError(res.status, `Resend HTTP ${res.status}`);
  const body: unknown = await res.json().catch(() => null);
  if (body && typeof body === "object" && "id" in body &&
      typeof body.id === "string" && /^[a-z0-9_-]{1,128}$/i.test(body.id)) return body.id;
}

/** "Name <addr>" -> { name, email } for the Cloudflare builder; a bare address passes through. */
function parseFrom(value: string): string | { name: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  return m ? { name: m[1], email: m[2] } : value;
}

class EmailProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const CONFIRM_TTL_MS = 24 * 60 * 60_000;
const CONFIRM_COOLDOWN_MS = 15 * 60_000;

export async function subscribeEmail(env: Env, body: unknown, now = Date.now()): Promise<{ ok: boolean; emailEnabled?: boolean; error?: string }> {
  const b = (body ?? {}) as { email?: unknown; fips?: unknown };
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "a valid email is required" };
  const fips = cleanFipsList(b.fips).sort();
  if (!fips.length) return { ok: false, error: "fips must be a non-empty array of 5-digit county FIPS codes" };
  if (!emailConfigured(env)) return { ok: true, emailEnabled: false };

  const { DB: db } = env;
  const selection = JSON.stringify(fips);
  const nonce = crypto.randomUUID();
  const nowIso = new Date(now).toISOString();
  const cutoff = new Date(now - CONFIRM_TTL_MS).toISOString();
  const [, pending] = await db.batch<{ token: string; created: string }>([
    db.prepare(`INSERT INTO email_confirmation_gate (email, next_send_at, nonce)
      SELECT ?, ?, ? WHERE NOT EXISTS (
        SELECT 1 FROM email_subscriptions WHERE email = ? AND fips_key = ?
        AND confirmed_at IS NOT NULL AND unsubscribed_at IS NULL
      )
      ON CONFLICT(email) DO UPDATE SET next_send_at = excluded.next_send_at, nonce = excluded.nonce
      WHERE email_confirmation_gate.next_send_at <= ?`).bind(email, now + CONFIRM_COOLDOWN_MS, nonce, email, selection, now),
    db.prepare(`INSERT INTO email_subscriptions (id, email, fips_json, fips_key, token, created)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM email_confirmation_gate WHERE email = ? AND nonce = ?)
      ON CONFLICT(email, fips_key) WHERE unsubscribed_at IS NULL DO UPDATE SET
        token = CASE WHEN email_subscriptions.created <= ? THEN excluded.token ELSE email_subscriptions.token END,
        created = CASE WHEN email_subscriptions.created <= ? THEN excluded.created ELSE email_subscriptions.created END
      WHERE email_subscriptions.confirmed_at IS NULL RETURNING token, created`)
      .bind(crypto.randomUUID(), email, selection, selection, crypto.randomUUID(), nowIso, email, nonce, cutoff, cutoff),
  ]);

  const confirmation = pending.results[0];
  if (confirmation) {
    const expiry = new Date(Date.parse(confirmation.created) + CONFIRM_TTL_MS).toISOString();
    const message = renderConfirmationEmail(env.SITE_URL, fips, confirmation.token, expiry);
    await sendEmail(env, email, message, `confirm/${nonce}`);
  }
  // Use the same reply for active, already pending and newly requested selections.
  return { ok: true, emailEnabled: true };
}

export async function confirmEmail(env: Env, token: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const r = await env.DB.prepare(`UPDATE email_subscriptions SET confirmed_at = COALESCE(confirmed_at, ?)
    WHERE token = ? AND unsubscribed_at IS NULL AND created > ?`)
    .bind(new Date(now).toISOString(), token, new Date(now - CONFIRM_TTL_MS).toISOString())
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function unsubscribeEmail(env: Env, token: string): Promise<boolean> {
  if (!token) return false;
  const removed = await env.DB.prepare(`UPDATE email_subscriptions SET unsubscribed_at = COALESCE(unsubscribed_at, ?)
    WHERE id = (SELECT COALESCE(merged_into, id) FROM email_subscriptions WHERE token = ?) RETURNING id`)
    .bind(new Date().toISOString(), token)
    .first<string>("id");
  return removed !== null;
}

export async function unsubscribeEmailFromForm(env: Env, request: Request, token: string): Promise<boolean> {
  const contentType = request.headers.get("content-type") ?? "";
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded" && type !== "multipart/form-data") {
    throw new RequestBodyError("The unsubscribe request must be form data.", 415);
  }
  const body = await readLimitedBody(request, 8_192);
  const form = await new Response(body, { headers: { "content-type": contentType } }).formData().catch(() => null);
  const values = form?.getAll(UNSUBSCRIBE_FIELD);
  if (values?.length !== 1 || values[0] !== UNSUBSCRIBE_VALUE) {
    throw new RequestBodyError("The unsubscribe request is invalid.");
  }
  return unsubscribeEmail(env, token);
}

export async function sendAlertEmail(
  env: Env, target: { email: string; token: string | null }, notices: Notice[], idempotencyKey: string,
): Promise<DeliveryOutcome> {
  if (!emailConfigured(env)) return { result: "error", error: "Email is not configured" };
  try {
    const message = renderAlertEmail(env.SITE_URL, notices, target.token);
    const providerId = await sendEmail(env, target.email, message, idempotencyKey);
    return { result: "accepted", providerId };
  } catch (err) {
    return { result: "error", error: err instanceof EmailProviderError ? err.message : "Email request failed",
      permanent: err instanceof EmailProviderError && [400, 422].includes(err.status) };
  }
}
