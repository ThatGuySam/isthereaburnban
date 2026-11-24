// @ts-expect-error Bun's test types are absent from the Worker typecheck.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { alAdemOpenBurning, alJeffersonOpenBurning, parseAdemOpenBurning, parseJeffersonOpenBurning } from "./air-rules";
import { alCahabaBurning, parseCahabaBurning } from "./cahaba";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";

const cahaba = readFileSync(new URL("./fixtures/cahaba-valley-2026-11-24.html", import.meta.url), "utf8");
const jefferson = readFileSync(new URL("./fixtures/jefferson-health-2026-11-24.html", import.meta.url), "utf8");
const now = new Date("2026-11-24T16:03:46Z");
const responseDate = "Tue, 24 Nov 2026 16:03:45 GMT";

test("November 24 Alabama coverage has 67 restricted summaries and two scoped district permit reports", async () => {
  const inputs = [
    { source: alJeffersonOpenBurning, rows: await parseJeffersonOpenBurning(jefferson, now) },
    { source: alAdemOpenBurning, rows: await parseAdemOpenBurning(cahaba, now) },
    { source: alCahabaBurning, rows: await parseCahabaBurning(cahaba, now, responseDate) },
  ];
  const { snapshot, transitions } = mergeSources(null, inputs.map((input) => ({ ...input, checked: now.toISOString() })), now);
  expect(inputs[1].rows).toHaveLength(67);
  expect(Object.values(snapshot.counties).map(({ status }) => status)).toEqual(Array(67).fill("restricted"));
  expect(snapshot.counties["01001"]).toMatchObject({ scope: "state", sourceId: alAdemOpenBurning.id });
  expect(snapshot.counties["01073"]).toMatchObject({
    scope: "county", sourceId: alJeffersonOpenBurning.id, since: "2026-11-01", expires: "2027-03-31",
  });
  for (const fips of ["01073", "01117"]) {
    const { orders } = snapshot.counties[fips];
    expect(orders).toHaveLength(1);
    expect(orders?.[0]).toMatchObject({
      scope: "part", sourceId: alCahabaBurning.id, validUntil: "2026-11-25T06:00:00.000Z",
    });
  }
  expect(transitions).toEqual([]);
  expect(SOURCES.filter(({ state, mode }) => state === "AL" && mode !== "manual").map(({ recurring }) => recurring))
    .toEqual([true, true, true]);
});

test("ADEM's annual summer restriction maps only the 12 named counties and follows Central midnight", async () => {
  const start = new Date("2027-05-01T05:00:00Z");
  const before = new Date(start.getTime() - 1);
  const options = { source: alAdemOpenBurning, checked: before.toISOString() };
  const rows = await parseAdemOpenBurning(cahaba, before);
  expect(mergeSources(null, [{ ...options, rows }], before).snapshot.counties["01003"].scope).toBe("state");
  const { snapshot } = mergeSources(null, [{ ...options, rows }], start);
  expect(Object.values(snapshot.counties).filter(({ scope }) => scope === "county").map(({ county }) => county)).toEqual([
    "Baldwin County", "DeKalb County", "Etowah County", "Jefferson County", "Lawrence County", "Madison County",
    "Mobile County", "Montgomery County", "Morgan County", "Russell County", "Shelby County", "Talladega County",
  ]);
  expect(snapshot.counties["01003"]).toMatchObject({ status: "restricted", since: "2027-05-01", expires: "2027-10-31" });
  const end = new Date("2027-11-01T05:00:00Z");
  expect((await parseAdemOpenBurning(cahaba, end)).every(({ scope }) => scope === "state")).toBe(true);
});

test("Jefferson's seasonal rule starts one month earlier and limits only Jefferson County", async () => {
  const date = new Date("2027-03-31T23:00:00Z");
  const rows = await parseJeffersonOpenBurning(jefferson, date);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ fips: "01073", expires: "2027-03-31", validUntil: "2027-04-01T05:00:00.000Z" });
  expect(rows[1]).toMatchObject({
    fips: "01073", status: "restricted", since: "2027-04-01", expires: "2027-10-31", validFrom: rows[0].validUntil,
  });
});

test("changed standing rules fail closed", async () => {
  await expect(parseAdemOpenBurning(cahaba.replace("Talladega Counties.", "Tuscaloosa Counties."), now))
    .rejects.toThrow("reviewed open-burning rule changed");
  await expect(parseJeffersonOpenBurning(jefferson.replace("April through October", "May through October"), now))
    .rejects.toThrow("reviewed open-burning seasons changed");
});

test("Cahaba rejects outdated pages, unknown values and changed district boundaries", async () => {
  await expect(parseCahabaBurning(cahaba, now, "Tue, 24 Nov 2026 05:59:00 GMT")).rejects.toThrow("same-day HTTP response");
  await expect(parseCahabaBurning(cahaba.replace("burn-status burn-allowed", "burn-status burn-caution"), now, responseDate))
    .rejects.toThrow("unrecognized burn status");
  await expect(parseCahabaBurning(cahaba.replace("Jefferson and Shelby County", "Shelby County"), now, responseDate))
    .rejects.toThrow("district boundaries changed");
});

test("an explicit no-burn banner remains limited to the district", async () => {
  const closed = cahaba.replace("burn-status burn-allowed", "burn-status burn-banned")
    .replace("Open burning is allowed with a permit.", "Open burning is prohibited.");
  const rows = await parseCahabaBurning(closed, now, responseDate);
  expect(rows.map(({ fips, status, scope }) => ({ fips, status, scope }))).toEqual([
    { fips: "01073", status: "ban", scope: "part" }, { fips: "01117", status: "ban", scope: "part" },
  ]);
});

const parsers = [
  ["ADEM air rule", () => parseAdemOpenBurning(cahaba, new Date("2027-07-14T16:03:46Z"))],
  ["Jefferson air rule", () => parseJeffersonOpenBurning(jefferson, now)],
  ["Cahaba district status", () => parseCahabaBurning(cahaba, now, responseDate)],
] as const;
test.each(parsers)("Alabama %s fixture stays under 4 ms p95 thread CPU", async (_name: string, parse: () => ReturnType<typeof parseAdemOpenBurning>) => {
  for (let i = 0; i < 10; i++) await parse();
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const start = process.threadCpuUsage();
    await parse();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
