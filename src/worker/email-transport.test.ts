import { expect, test } from "bun:test";
import { emailConfigured, type Env } from "./env";
import { sendAlertEmail } from "./email";

const notice = { title: "Burn ban in Tulsa County, OK", body: "A county burn ban is now reported.", url: "/us/ok/tulsa-county/" };

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

test("alert email goes through the Cloudflare binding with a parsed sender", async () => {
  const sent: unknown[] = [];
  const binding = { send: async (m: unknown) => { sent.push(m); return { messageId: "cf-123" }; } } as unknown as SendEmail;
  const out = await sendAlertEmail(env({ EMAIL: binding, EMAIL_TRANSPORT: "cloudflare" }), { email: "ops@example.test", token: null }, [notice], "key-1");
  expect(out).toEqual({ result: "accepted", providerId: "cf-123" });
  expect(sent[0]).toMatchObject({
    from: { name: "Is There a Burn Ban?", email: "alerts@isthereaburnban.com" },
    to: "ops@example.test", subject: notice.title,
  });
});

test("a Cloudflare send failure is reported as a retryable error", async () => {
  const binding = { send: async () => { throw new Error("sender domain not verified"); } } as unknown as SendEmail;
  const out = await sendAlertEmail(env({ EMAIL: binding, EMAIL_TRANSPORT: "cloudflare" }), { email: "ops@example.test", token: null }, [notice], "key-2");
  expect(out).toMatchObject({ result: "error", permanent: false });
  expect((out as { error: string }).error).toContain("sender domain not verified");
});
