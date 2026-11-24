// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { extractHtml } from "../lib/html";
import { parseSpringMountainsOrder } from "./usfs";

const fixture = await Bun.file(new URL("./fixtures/usfs-current-fire-restrictions-2026-11-24.html", import.meta.url)).text();
const captured = new Date("2026-11-24T10:21:34Z");
const parse = async (html = fixture, now = captured) =>
  parseSpringMountainsOrder(await extractHtml(html, { links: true }), now);

test("the Forest Service current order applies only to mapped forest lands near Spring Mountains homes", async () => {
  const rows = await parse();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    state: "NV", fips: "32003", county: "Clark County", status: "restricted", scope: "part",
    scopeNote: "Mapped National Forest lands near homes in the Spring Mountains National Recreation Area",
    since: "2024-01-08", expires: "2027-09-30",
  });
  expect(rows[0].note).toContain("developed recreation sites");
});

test("removal of the reviewed order leaves status unknown", async () => {
  const withoutOrder = fixture.replace(/<tbody>.*?<\/tbody>/s, "<tbody></tbody>");
  await expect(parse(withoutOrder)).resolves.toEqual([]);
  await expect(parse(fixture.replace("04-17-24-01", "04-17-26-99"))).resolves.toEqual([]);
});

test("the adapter rejects changed source structure, terms, or order links", async () => {
  await expect(parse(fixture.replace("Current Fire Restrictions", "Past Fire Restrictions"))).rejects.toThrow("current order table");
  await expect(parse(fixture.replace("Until Rescinded", "Unknown"))).rejects.toThrow("reviewed order");
  await expect(parse(fixture.replace("/media/115923", "/media/110000"))).rejects.toThrow("reviewed order");
  await expect(parse(fixture.replace("/media/115807", "/media/110000"))).rejects.toThrow("reviewed order");
});

test("the adapter rejects a stale or future list and stops at the signed cutoff", async () => {
  await expect(parse(fixture.replace("November 2, 2026", "July 24, 2026"))).rejects.toThrow("last update");
  await expect(parse(fixture.replace("November 2, 2026", "November 25, 2026"))).rejects.toThrow("last update");
  const currentList = fixture.replace("November 2, 2026", "September 29, 2027");
  const beforeEnd = new Date("2027-09-30T06:59:59Z");
  expect((await parse(currentList, beforeEnd))[0].validUntil).toBe("2027-09-30T07:00:00.000Z");
  await expect(parse(currentList, new Date("2027-09-30T07:00:00Z"))).resolves.toEqual([]);
});

test("Spring Mountains HTML parsing stays under 4 ms p95 on the current-list fixture", async () => {
  for (let i = 0; i < 10; i++) await parse();
  const timings: number[] = [];
  for (let i = 0; i < 60; i++) {
    const start = performance.now();
    await parse();
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(4);
});
