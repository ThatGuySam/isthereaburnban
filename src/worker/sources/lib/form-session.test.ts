// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { publicFormSession } from "./form-session";

const action = "https://publisher.test/select";
const destination = new URL("https://publisher.test/select?mode=menu");
const fields = new URLSearchParams({ county: "7" });
const headers = () => {
  const result = new Headers({ location: "/select?mode=menu" });
  result.append("set-cookie", "affinity=first|second; Path=/; Secure; HttpOnly");
  result.append("set-cookie", "selection=county7; Path=/; Secure; HttpOnly");
  result.append("set-cookie", "unrelated=ignored; Path=/");
  return result;
};
const open = (fetchImpl) => publicFormSession({
  action, destination, cookies: ["affinity", "selection"], maxBytes: 1000,
  maxResponseAgeMs: 60_000, fetchImpl,
}, 0)(fields);

test("a public form selection sends only first-party session cookies to the exact result URL", async () => {
  const calls = [];
  const reply = await open(async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1
      ? new Response(null, { status: 302, headers: headers() })
      : new Response("<h1>County status</h1>", { headers: { date: new Date().toUTCString() } });
  });
  expect(await reply.text()).toBe("<h1>County status</h1>");
  expect(calls[0]).toMatchObject({ url: action, init: { method: "POST", body: fields, redirect: "manual" } });
  expect(calls[0].init.headers.get("cookie")).toBeNull();
  expect(calls[1]).toMatchObject({ url: destination.href, init: { redirect: "manual" } });
  expect(calls[1].init.headers.get("cookie")).toBe("affinity=first|second; selection=county7");
});

test("unexpected redirects, missing cookies and stale forms cannot leak or salvage session state", async () => {
  for (const location of ["https://other.test/select?mode=menu", "/select?mode=activate"]) {
    const changed = headers();
    changed.set("location", location);
    let count = 0;
    await expect(open(async () => {
      count++;
      return new Response(null, { status: 302, headers: changed });
    })).rejects.toThrow("unexpected form redirect");
    expect(count).toBe(1);
  }
  await expect(open(async () => new Response(null, {
    status: 302, headers: { location: destination.toString(), "set-cookie": "affinity=first; Path=/" },
  }))).rejects.toThrow("missing form session cookie");
  await expect(open(async (url) => url === action
    ? new Response(null, { status: 302, headers: headers() })
    : new Response("county status", { headers: { date: "Wed, 01 Jan 2025 00:00:00 GMT" } }),
  )).rejects.toThrow("stale or undated");
});
