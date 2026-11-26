// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { manualPdf } from "../lib/pdf";
import { mergeSources } from "../merge";
import { arFaulknerCountyOrders, parseFaulknerBan } from "./faulkner";

const captured = new Date("2026-11-24T10:31:53Z");
const fixture = await Bun.file(new URL("./fixtures/faulkner-banner-2026-11-24.html", import.meta.url)).text();
const order = await Bun.file(new URL("./fixtures/faulkner-order-26-204-2026-11-24.pdf", import.meta.url)).arrayBuffer();
const rescission = await Bun.file(new URL("../lib/fixtures/faulkner-rescind.pdf", import.meta.url)).arrayBuffer();
const readOrder = (url: string) => {
  expect(url).toBe("https://www.faulknercountyar.gov/wp-content/uploads/2026/11/Faulkner-County-Court-Order-26-204.pdf");
  return manualPdf(new Response(order));
};

test("the current signed order maps only to unincorporated Faulkner County", async () => {
  const rows = await parseFaulknerBan(fixture, captured, readOrder);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "05045", status: "ban", scope: "part", scopeNote: "Unincorporated Faulkner County",
    since: "2026-11-18", expires: null, sourceUpdated: null,
    validFrom: "2026-11-18T15:00:00.000Z", validUntil: "2026-12-18T15:00:00.000Z",
  });
  const { snapshot } = mergeSources(null, [
    { source: arFaulknerCountyOrders, rows, checked: captured.toISOString() },
  ], captured);
  expect(Object.keys(snapshot.counties)).toEqual(["05045"]);
  expect(snapshot.counties["05045"]).toMatchObject({
    status: "restricted", orders: [{ status: "ban", scope: "part", officialUrl: rows[0].officialUrl }],
  });
});

test("banner wording, location, order identity and scope all require verification", async () => {
  const parse = (html: string) => parseFaulknerBan(html, captured, readOrder);
  await expect(parse(fixture.replace("is under", "may be under"))).rejects.toThrow("unrecognized");
  await expect(parse(fixture.replace('data-id="689f6be"', 'data-id="archive"'))).rejects.toThrow("current decision");
  await expect(parse(fixture + fixture)).rejects.toThrow("current decision");
  await expect(parse(fixture.replaceAll("26-204", "26-299"))).rejects.toThrow("unverified");
  await expect(parse(fixture.replace("9:00 a.m.", "9:00 p.m."))).rejects.toThrow("effective date");
  await expect(parse(fixture.replace("www.faulknercountyar.gov/wp-content/", "example.test/wp-content/"))).rejects.toThrow("unverified");
  await expect(parseFaulknerBan(fixture, captured, () => manualPdf(new Response(rescission)))).rejects.toThrow("PDF changed");
});

test("a current banner cannot establish an order outside its verification window", async () => {
  const parse = (time: string) => parseFaulknerBan(fixture, new Date(time), readOrder);
  await expect(parse("2026-11-18T14:59:59Z")).rejects.toThrow("future or stale");
  await expect(parse("2026-12-18T14:59:59Z")).resolves.toHaveLength(1);
  await expect(parse("2026-12-18T15:00:00Z")).rejects.toThrow("future or stale");
});

test("the November 3 lift applies to the earlier order only and yields no all-clear", async () => {
  const liftBanner = fixture
    .replace(/<p style="text-align: left;">.*?<\/p>/s, "<p>The Faulkner County burn ban has been lifted.</p>")
    .replace("Faulkner-County-Court-Order-26-204.pdf", "Burn-Ban-Rescind-26-202.pdf")
    .replace("Court Order 26-204", "Court Order 26-202");
  const readLift = () => manualPdf(new Response(rescission));
  await expect(parseFaulknerBan(liftBanner, new Date("2026-11-04T16:00:00Z"), readLift)).resolves.toEqual([]);
  await expect(parseFaulknerBan(liftBanner, captured, readLift)).rejects.toThrow("does not apply");
});

test("Faulkner banner parsing and signed PDF hashing stay under 4 ms p95", async () => {
  const run = () => parseFaulknerBan(fixture, captured, readOrder);
  for (let i = 0; i < 10; i++) await run();
  const timings: number[] = [];
  for (let i = 0; i < 60; i++) {
    const start = process.threadCpuUsage();
    await run();
    const { user, system } = process.threadCpuUsage(start);
    timings.push((user + system) / 1_000);
  }
  timings.sort((a, b) => a - b);
  expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(4);
});
