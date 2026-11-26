// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { countiesInState } from "../../counties";
import { idBonnevilleOrders, readBonnevilleOrders } from "./bonneville-orders";
import {
  idBannockStatus, idCoeurDAleneStatus, idCountyBulletins, idElmoreOrders,
  idGemFire2Orders, idNorthernLakesStatus,
} from "./county-status";
import { idKootenaiAir, parseKootenaiAir } from "./kootenai-air";
import { idCountyCalendars } from "./local-rules";
import { datedLocalOrder } from "../lib/county-bulletin";
import { US_ZONES } from "../lib/dates";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";

const reviewDay = new Date("2026-11-24T18:00:00Z");
const summer = new Date("2026-07-15T18:00:00Z");
const entries = [...idCountyBulletins, ...idCountyCalendars].map((entry) => {
  const bytes = readFileSync(new URL(`./fixtures/${entry.fixture}`, import.meta.url));
  return { ...entry, bytes: entry.fixture.endsWith(".gz") ? gunzipSync(bytes) : bytes };
});
const read = (entry) => entries.find(({ source }) => source.id === entry.source.id).bytes.toString();
const restricted = [
  "Ada", "Bannock", "Benewah", "Bingham", "Blaine", "Boise", "Bonner", "Bonneville", "Butte", "Canyon", "Caribou",
  "Clearwater", "Elmore", "Gooding", "Idaho", "Jefferson", "Jerome", "Kootenai", "Latah", "Lewis", "Madison",
  "Minidoka", "Nez Perce", "Payette", "Power", "Teton", "Twin Falls", "Valley", "Washington",
];

test("Idaho county publisher fixtures add only scoped restrictions to the November 24 replay", async () => {
  const checked = reviewDay.toISOString();
  const previous = readFileSync(new URL("./fixtures/deq-coeur-dalene-2026-11-24.html", import.meta.url), "utf8");
  const baseline = { source: idKootenaiAir, rows: await parseKootenaiAir(previous, reviewDay), checked };
  const requests = new Map(entries.map((entry) => [entry.source.sourceUrl, entry]));
  const fetch = globalThis.fetch;
  const result = [];
  globalThis.fetch = async (url) => {
    const entry = requests.get(url);
    if (!entry) throw new Error(`Unexpected Idaho fixture request ${url}`);
    return new Response(entry.bytes, { headers: {
      date: new Date().toUTCString(),
      "content-type": entry.fixture.endsWith(".pdf") ? "application/pdf" : "text/html",
    } });
  };
  try {
    for (const { source } of entries) {
      expect(SOURCES.find(({ id }) => id === source.id)).toBe(source);
      expect(source.mode).toBe("positive-only");
      expect(source.scope).toBe("part");
      const { rows } = await source.fetch({ now: reviewDay });
      for (const row of rows) {
        expect(source.reportingFips).toContain(row.fips);
        expect(row).toMatchObject({ scope: "part", officialUrl: source.officialUrl, status: "restricted" });
      }
      result.push({ source, rows, checked });
    }
  } finally {
    globalThis.fetch = fetch;
  }
  const { snapshot, transitions } = mergeSources(null, [baseline, ...result], reviewDay);
  expect(transitions).toEqual([]);
  const counties = countiesInState("ID");
  expect(counties.filter(({ fips }) => snapshot.counties[fips]?.status === "restricted").map(({ name }) => name))
    .toEqual(restricted.map((name) => `${name} County`));
  expect(counties.filter(({ fips }) => !snapshot.counties[fips])).toHaveLength(44 - restricted.length);
  const reservation = result.find(({ source }) => source.id === "id-nez-perce-reservation-permits");
  expect(reservation.rows.map(({ fips }) => fips)).toEqual(["16035", "16049", "16061", "16069"]);
  expect(snapshot.counties["16077"].orders).toEqual([expect.objectContaining({ scopeNote: "Fort Hall Reservation" })]);
});

test("dated local orders use local time and a whole-day end is inclusive", () => {
  const dates = { kind: "dates", from: "November 1, 2026", through: "November 1, 2026" };
  const zone = US_ZONES.Pacific;
  expect(datedLocalOrder(dates, zone, new Date("2026-11-02T07:59:59Z"))).toEqual({
    since: "2026-11-01", expires: "2026-11-01", validFrom: "2026-11-01T07:00:00.000Z", validUntil: "2026-11-02T08:00:00.000Z",
  });
  expect(datedLocalOrder(dates, zone, new Date("2026-11-02T08:00:00Z"))).toBeUndefined();
  expect(() => datedLocalOrder({ ...dates, from: "February 31, 2026" }, zone, reviewDay)).toThrow("Invalid local order dates");
  expect(() => datedLocalOrder({ ...dates, through: "October 1, 2026" }, zone, reviewDay)).toThrow("Invalid local order dates");
});

test("actual Elmore and Gem orders go dark at their published end", async () => {
  for (const [entry, fips, validFrom, validUntil] of [
    [idElmoreOrders, "16039", "2026-06-05T18:00:00.000Z", "2026-10-01T06:00:00.000Z"],
    [idGemFire2Orders, "16045", "2026-05-10T06:00:00.000Z", "2026-10-21T06:00:00.000Z"],
  ]) {
    const html = read(entry);
    expect(await entry.parse(new Response(html), summer)).toEqual([
      expect.objectContaining({ fips, status: "ban", scope: "part", validFrom, validUntil }),
    ]);
    expect(await entry.parse(new Response(html), new Date(Date.parse(validFrom) - 1))).toEqual([]);
    expect(await entry.parse(new Response(html), new Date(validUntil))).toEqual([]);
  }
  await expect(idElmoreOrders.parse(new Response(read(idElmoreOrders).replace("Outside Fire Protection Districts", "Including All Fire Protection Districts")), summer))
    .rejects.toThrow("Unrecognized status");
});

test("Bonneville requires a matching in-force resolution and ignores the superseded July announcement", async () => {
  const index = read(idBonnevilleOrders);
  const announcement = gunzipSync(readFileSync(new URL("./fixtures/id-bonneville-announcement-2026-11-26.html.gz", import.meta.url))).toString();
  const historical = index.replace("Rescinding of Burning Ban", "County Fee Resolution");
  expect(await readBonnevilleOrders(new Response(index), reviewDay, () => {
    throw new Error("Superseded announcement should not be read");
  })).toBeUndefined();
  expect(await readBonnevilleOrders(new Response(historical), summer, async () => announcement)).toMatchObject({
    status: "ban", since: "2026-07-09", validUntil: "2026-09-30T06:00:00.000Z",
  });
  await expect(readBonnevilleOrders(new Response(historical), summer,
    async () => announcement.replace("Resolution #26-06", "Resolution #26-09")))
    .rejects.toThrow("does not match");
  await expect(readBonnevilleOrders(new Response(index.replace(">26-12<", ">26-06<")), reviewDay, async () => announcement))
    .rejects.toThrow("incomplete resolution register");
});

test("current permissive panels and local rescissions yield no all-clear", async () => {
  for (const entry of [idBannockStatus, idNorthernLakesStatus]) {
    expect(await entry.parse(new Response(read(entry)), reviewDay)).toEqual([]);
  }
  await expect(idBannockStatus.parse(new Response(read(idBannockStatus)), new Date("2027-07-15T18:00Z")))
    .rejects.toThrow("stale lift notice");
  const active = read(idBannockStatus).replace("Burn Ban no longer in effect", "Burn Ban in effect")
    .replace(/Bannock County.+?cooler temperatures\./,
      "From June 1, 2026 through September 30, 2026, open burning is prohibited in the wildland–urban interface areas of Bannock County.");
  expect(await idBannockStatus.parse(new Response(active), summer)).toEqual([
    expect.objectContaining({ fips: "16005", status: "ban", scope: "part", validUntil: "2026-10-01T06:00:00.000Z" }),
  ]);
});

test("North Idaho status panels verify the page and distinguish permit limits from a ban", async () => {
  const northern = read(idNorthernLakesStatus);
  await expect(idNorthernLakesStatus.parse(new Response(northern.replace("BURNING IS OPEN</h2>", "BURNING IS CLOSED</h2>")), reviewDay))
    .rejects.toThrow("conflicting desktop/mobile");
  expect(await idNorthernLakesStatus.parse(new Response(northern.replaceAll("BURNING IS OPEN", "BURNING IS CLOSED")), reviewDay))
    .toEqual([expect.objectContaining({ fips: "16055", status: "restricted", scope: "part" })]);
  const city = read(idCoeurDAleneStatus);
  expect(await idCoeurDAleneStatus.parse(new Response(city), reviewDay))
    .toEqual([expect.objectContaining({ label: "City burn permits limited to smaller piles", status: "restricted", scope: "part" })]);
  await expect(idCoeurDAleneStatus.parse(new Response(city.replaceAll("5' x 5'","4' x 4'")), reviewDay))
    .rejects.toThrow("Unrecognized status");
});

test("Idaho permit rules are recurring, check changed evidence, and honor local seasons", async () => {
  for (const { source } of idCountyCalendars) expect(source.recurring).toBe(true);
  const washington = entries.find(({ source }) => source.id === "id-washington-season");
  expect(await washington.parse(new Response(washington.bytes), reviewDay)).toEqual([]);
  expect(await washington.parse(new Response(washington.bytes), summer)).toEqual([
    expect.objectContaining({ status: "restricted", since: "2026-06-01", expires: "2026-10-20", fips: "16087" }),
  ]);
  const franklin = entries.find(({ source }) => source.id === "id-franklin-permit-season");
  expect(await franklin.parse(new Response(franklin.bytes), reviewDay)).toEqual([]);
  expect(await franklin.parse(new Response(franklin.bytes), summer)).toEqual([
    expect.objectContaining({ since: "2026-06-01", expires: "2026-09-30", fips: "16041" }),
  ]);
  const district = entries.find(({ source }) => source.id === "id-cascade-winter-permits");
  expect(await district.parse(new Response(district.bytes), summer)).toEqual([]);
  expect(await district.parse(new Response(district.bytes), reviewDay)).toEqual([
    expect.objectContaining({ since: "2026-10-21", expires: "2027-05-09", fips: "16085" }),
  ]);
  const tribe = entries.find(({ source }) => source.id === "id-nez-perce-reservation-permits");
  await expect(tribe.parse(new Response(tribe.bytes.toString().replace("year-round", "in July")), reviewDay))
    .rejects.toThrow("reviewed local burning rule changed");
});

test("Idaho county fixture parsing stays below 5 ms p95 thread CPU per publisher", async () => {
  const sampleTime = new Map([
    ["id-elmore-county-orders", summer], ["id-gem-fire-2-orders", summer],
    ["id-washington-season", summer], ["id-franklin-permit-season", summer],
  ]);
  let slowest = { id: "", ms: 0 };
  for (const { source, bytes, parse } of entries) {
    const now = sampleTime.get(source.id) ?? reviewDay;
    for (let i = 0; i < 10; i++) await parse(new Response(bytes), now);
    const samples = [];
    for (let i = 0; i < 60; i++) {
      const start = process.threadCpuUsage();
      await parse(new Response(bytes), now);
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    const ms = samples.sort((a, b) => a - b)[56];
    if (ms > slowest.ms) slowest = { id: source.id, ms };
    expect(ms).toBeLessThan(5);
  }
  console.log(`ID county fixture parse p95 max ${slowest.ms.toFixed(3)} ms thread CPU (${slowest.id})`);
});
