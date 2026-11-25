// @ts-nocheck -- bun test types are not installed.
import { expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseTullahomaForm, parseTullahomaPermitPage, tnTullahomaDailyBurning, tullahomaRows } from "./tullahoma";

const fixture = (name) => readFileSync(new URL(`./fixtures/tullahoma-${name}-2026-11-24.html`, import.meta.url), "utf8");
const page = fixture("permit-page");
const closedForm = fixture("closed-form");
const captured = new Date("2026-11-25T04:16:19Z");

test("Tullahoma's embedded form gives the weather closure for both parts of the city", async () => {
  const fetch = spyOn(globalThis, "fetch");
  const requests = [];
  try {
    fetch.mockImplementation(async (url) => {
      requests.push(new URL(url));
      return new Response(requests.length === 1 ? page : closedForm, { headers: { date: new Date().toUTCString() } });
    });
    const { rows } = await tnTullahomaDailyBurning.fetch({ now: captured });
    expect(requests.map(({ hostname }) => hostname)).toEqual(["www.tullahomatn.gov", "docs.google.com"]);
    expect(rows.map(({ fips, status, scope }) => ({ fips, status, scope }))).toEqual([
      { fips: "47031", status: "restricted", scope: "part" },
      { fips: "47051", status: "restricted", scope: "part" },
    ]);
    expect(rows[0]).toMatchObject({
      label: "Tullahoma burn permit requests suspended",
      validFrom: "2026-11-24T06:00:00.000Z", validUntil: "2026-11-25T06:00:00.000Z",
      officialUrl: tnTullahomaDailyBurning.officialUrl,
    });
    expect(rows[0].note).toContain("weather makes open burning unsafe");
  } finally {
    fetch.mockRestore();
  }
});

test("the city explicitly defines an absent embed as closed and unexpected pages fail validation", async () => {
  const hidden = page.replace(/<iframe[\s\S]*?<\/iframe>/i, "");
  expect(await parseTullahomaPermitPage(hidden)).toBe("closed");
  await expect(parseTullahomaPermitPage(hidden.slice(0, hidden.lastIndexOf("</div>")))).rejects.toThrow("unrecognized permit page");
  await expect(parseTullahomaPermitPage(hidden.replace("burning is not allowed for the day", "call to check")))
    .rejects.toThrow("unrecognized permit page");
  await expect(parseTullahomaPermitPage(page.replace("docs.google.com", "example.org"))).rejects.toThrow("embedded form");
  await expect(parseTullahomaForm(closedForm.replace("The City of Tullahoma", "Another city"))).rejects.toThrow("unrecognized permit form closure");
  await expect(parseTullahomaForm('<body><div role="heading" aria-level="1">Burn Permit</div></body>'))
    .rejects.toThrow("missing active permit request form");
  const available = '<body><form action="/forms/d/e/example/formResponse"><div role="heading" aria-level="1">Burn Permit</div></form></body>';
  const [row] = tullahomaRows(await parseTullahomaForm(available), captured);
  expect(row.status).toBe("restricted");
  expect(row.note).toContain("must be out by 4 p.m. Central");
});

test("Tullahoma's city page and closure fixture parse below 4 ms p95 thread CPU", async () => {
  const parse = async () => {
    await parseTullahomaPermitPage(page);
    return tullahomaRows(await parseTullahomaForm(closedForm), captured);
  };
  for (let i = 0; i < 10; i++) await parse();
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const start = process.threadCpuUsage();
    await parse();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
