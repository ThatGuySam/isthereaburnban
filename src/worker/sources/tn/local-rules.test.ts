// @ts-nocheck -- bun test types are not installed.
import { expect, spyOn, test } from "bun:test";
import { countiesInState } from "../../counties";
import { mergeSources } from "../merge";
import { tnLocalCalendars } from "./local-rules";
import { tnSeasonalBurnPermits } from "./seasonal";

const captured = new Date("2026-11-25T04:05:00Z");
const fixtureFor = (id, kind) => Bun.file(new URL(`./fixtures/rule-${id}-2026-11-24.${kind}`, import.meta.url));

for (const { id, kind, source, parse } of tnLocalCalendars) {
  test(`${id} publishes the reviewed local restriction below 4 ms p95 thread CPU`, async () => {
    const bytes = await fixtureFor(id, kind).arrayBuffer();
    const check = () => parse(new Response(bytes), captured);
    const rows = await check();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.state === "TN" && row.scope === source.scope && row.status === "restricted" &&
      row.officialUrl === source.officialUrl && row.validFrom <= captured.toISOString() && row.validUntil > captured.toISOString())).toBe(true);
    expect(source.recurring).toBe(true);
    expect(source.mode).toBe("positive-only");
    for (let warmup = 0; warmup < 5; warmup++) await check();
    const samples = [];
    for (let index = 0; index < 30; index++) {
      const start = process.threadCpuUsage();
      await check();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
  });
}

test("reviewed rules keep a stale-verification note during outages and reject changed publications", async () => {
  const { source } = tnLocalCalendars.find(({ id }) => id === "madison");
  const fetch = spyOn(globalThis, "fetch");
  try {
    fetch.mockImplementation(async () => { throw Object.assign(new Error("Connection reset"), { code: "ECONNRESET" }); });
    const { rows } = await source.fetch({ now: captured });
    expect(rows[0]).toMatchObject({ fips: "47113", scope: "part", status: "restricted" });
    expect(rows[0].note).toContain("Online verification is stale");

    const changed = (await fixtureFor("madison", "html").text()).replace("A permit will be required", "A permit will be optional");
    expect(changed).toContain("A permit will be optional");
    fetch.mockImplementation(async () => new Response(changed));
    await expect(source.fetch({ now: captured })).rejects.toThrow("reviewed local burning rule changed");
  } finally {
    fetch.mockRestore();
  }
});

test("the Williamson notification rule is seasonal and city evidence stays in its own jurisdictions", async () => {
  const williamson = tnLocalCalendars.find(({ id }) => id === "williamson");
  const markup = await fixtureFor(williamson.id, williamson.kind).text();
  expect(await williamson.parse(new Response(markup), new Date("2027-06-01T14:00:00Z"))).toEqual([]);

  const rockyTop = tnLocalCalendars.find(({ id }) => id === "rocky-top");
  const rows = await rockyTop.parse(new Response(fixtureFor(rockyTop.id, rockyTop.kind)), captured);
  expect(rows.map(({ fips, scope, scopeNote }) => ({ fips, scope, scopeNote }))).toEqual([
    { fips: "47001", scope: "part", scopeNote: "City of Rocky Top" },
    { fips: "47013", scope: "part", scopeNote: "City of Rocky Top" },
  ]);
});

test("county sources cover the local-program gaps in the statewide permit fallback", async () => {
  const checked = captured.toISOString();
  const local = await Promise.all(tnLocalCalendars.map(async ({ id, kind, source, parse }) => ({
    source, rows: await parse(new Response(fixtureFor(id, kind)), captured), checked,
  })));
  const localOnly = mergeSources(null, local, captured).snapshot.counties;
  for (const fips of ["47037", "47093", "47157"]) {
    expect(localOnly[fips]).toMatchObject({ status: "restricted", scope: "county" });
  }
  const fetch = spyOn(globalThis, "fetch");
  try {
    fetch.mockImplementation(async () => new Response("Forbidden", { status: 403 }));
    const { rows } = await tnSeasonalBurnPermits.fetch({ now: captured });
    const { snapshot } = mergeSources(null, [...local, { source: tnSeasonalBurnPermits, rows, checked }], captured);
    expect(countiesInState("TN").filter(({ fips }) => snapshot.counties[fips]?.status === "restricted")).toHaveLength(95);
    expect(snapshot.counties["47003"].note).toContain("Current guidance could not be verified");
  } finally {
    fetch.mockRestore();
  }
});
