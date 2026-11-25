// @ts-nocheck -- matches the existing Bun tests, which run without Bun types in the Worker tsconfig.
import { expect, test } from "bun:test";
import { emailConfigured, type Env } from "./env";
import { sendAlertEmail } from "./email";
import { transitionNotice } from "./notification-message";

const notice = transitionNotice({ fips: "40143", oldStatus: "none", newStatus: "ban", at: "2026-11-24T12:00:00Z" });

function env(extra: Partial<Env>): Env {
  return { SITE_URL: "https://example.test", ...extra } as Env;
}

test("Cloudflare Email is used only when the binding and EMAIL_TRANSPORT=cloudflare are both set", () => {
  const binding = { send: async () => ({ messageId: "m1" }) } as unknown as SendEmail;
  expect(emailConfigured(env({ EMAIL: binding }))).toBe(false);
  expect(emailConfigured(env({ EMAIL: binding, EMAIL_TRANSPORT: "cloudflare" }))).toBe(true);
  expect(emailConfigured(env({ RESEND_API_KEY: "k" }))).toBe(true);
  expect(emailConfigured(env({}))).toBe(false);
});

test("subscriber emails send both parts and unsubscribe headers through Cloudflare", async () => {
  const sent: unknown[] = [];
  const binding = { send: async (m: unknown) => { sent.push(m); return { messageId: "cf-123" }; } } as unknown as SendEmail;
  const out = await sendAlertEmail(env({ EMAIL: binding, EMAIL_TRANSPORT: "cloudflare" }), { email: "resident@example.test", token: "mail-token" }, [notice], "key-1");
  expect(out).toEqual({ result: "accepted", providerId: "cf-123" });
  expect(sent[0]).toMatchObject({
    from: { name: "Is There a Burn Ban?", email: "alerts@isthereaburnban.com" },
    to: "resident@example.test", subject: "Burn ban in Tulsa County, OK",
  });
  expect(sent[0].text).toContain("Unsubscribe from these alerts\nhttps://example.test/api/v1/email/unsubscribe?token=mail-token");
  expect(sent[0].html).toContain('<a href="https://example.test/api/v1/email/unsubscribe?token=mail-token"');
  expect(sent[0].headers).toEqual({
    "List-Unsubscribe": "<https://example.test/api/v1/email/unsubscribe?token=mail-token>, <mailto:alerts@isthereaburnban.com?subject=Unsubscribe%20mail-token>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "X-Entity-Ref-ID": "key-1",
  });
});

test("a Cloudflare send failure is reported as a retryable error", async () => {
  const binding = { send: async () => { throw new Error("sender domain not verified"); } } as unknown as SendEmail;
  const out = await sendAlertEmail(env({ EMAIL: binding, EMAIL_TRANSPORT: "cloudflare" }), { email: "ops@example.test", token: null }, [notice], "key-2");
  expect(out).toMatchObject({ result: "error", permanent: false });
  expect((out as { error: string }).error).toContain("sender domain not verified");
});
