// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { manualPdf } from "../lib/pdf";
import { countyDecision } from "../../county-decision";
import { mergeSources } from "../merge";
import { arGarlandAlerts, arHotSpringsAlerts, arNashvilleAlerts, parseGarlandAlerts, parseHotSpringsAlerts, parseNashvilleAlerts } from "./county-alerts";
import {
  arBaxterStatus, arConwayStatus, arLittleRiverStatus, arLonokeStatus, arMillerStatus, arPulaskiStatus,
  arSalemStatus, arUnionStatus, arVanBurenStatus, parseBaxterStatus, parseConwayStatus, parseLittleRiverStatus,
  parseLonokeStatus, parseMillerStatus, parsePulaskiStatus, parseSalemStatus, parseUnionStatus, parseVanBurenStatus,
} from "./county-status";
import { arLocalRules } from "./local-rules";

const captured = new Date("2026-11-25T05:45:00Z");
const modified = "Wed, 25 Nov 2026 00:03:48 GMT";
const file = (name: string, extension: string) => Bun.file(new URL(`./fixtures/${name}-2026-11-24.${extension}`, import.meta.url));
const html = (name: string) => file(name, "html").text();
const json = (name: string) => file(name, "json").json();
const [baxter, pulaski, lonoke, miller, union, littleRiver, littleRiverPdf, garland, garlandOrder, nashville,
  salem, conway, hotSprings, hotSpringsOrder, vanBuren] = await Promise.all([
  html("baxter-status"), html("pulaski-status"), json("lonoke-burn"), json("miller-status"),
  html("union-status"), html("little-river-status"), file("little-river-order", "pdf").arrayBuffer(),
  html("garland-active-alerts"), html("garland-order"), json("nashville-alerts"),
  html("salem-status"), html("conway-permits"), html("hot-springs-alerts"), html("hot-springs-order"), json("van-buren-status"),
]);
const readLittleRiverOrder = () => manualPdf(new Response(littleRiverPdf));
const readGarlandOrder = async () => garlandOrder;

const pollers = [
  [arBaxterStatus, () => parseBaxterStatus(baxter, captured)],
  [arPulaskiStatus, () => parsePulaskiStatus(pulaski, captured, modified)],
  [arLonokeStatus, () => parseLonokeStatus(lonoke, captured)],
  [arMillerStatus, () => parseMillerStatus(miller, captured)],
  [arUnionStatus, () => parseUnionStatus(union, captured)],
  [arLittleRiverStatus, () => parseLittleRiverStatus(littleRiver, captured, readLittleRiverOrder)],
  [arGarlandAlerts, () => parseGarlandAlerts(garland, captured, readGarlandOrder)],
  [arNashvilleAlerts, () => parseNashvilleAlerts(nashville, captured)],
  [arSalemStatus, () => parseSalemStatus(salem, captured)],
  [arConwayStatus, () => parseConwayStatus(conway, captured)],
  [arHotSpringsAlerts, () => parseHotSpringsAlerts(hotSprings, captured, async () => hotSpringsOrder)],
  [arVanBurenStatus, () => parseVanBurenStatus(vanBuren, captured)],
] as const;

const ruleFixtures = await Promise.all(arLocalRules.map(async ({ source, parse }) => {
  const content = await html(source.id.slice(3));
  return [source, () => parse(new Response(content), captured)] as const;
}));

test("Arkansas county decisions retain county and city scope on the map", async () => {
  const checked = captured.toISOString();
  const inputs = await Promise.all(pollers.map(async ([source, parse]) => ({ source, rows: await parse(), checked })));
  const { snapshot } = mergeSources(null, inputs, captured);
  const answers = Object.fromEntries(Object.entries(snapshot.counties).map(([fips, row]) => [fips, countyDecision(row, +captured)]));
  expect(Object.fromEntries(Object.entries(answers).map(([fips, row]) => [fips, row.status]))).toEqual({
    "05005": "none", "05045": "restricted", "05051": "restricted", "05061": "restricted", "05081": "ban",
    "05085": "ban", "05091": "ban", "05119": "restricted", "05125": "restricted", "05139": "ban", "05141": "ban",
  });
  expect(answers["05051"].orders[0]).toMatchObject({ scopeNote: "Unincorporated Garland County", since: "2026-08-14" });
  expect(answers["05051"].orders[1]).toMatchObject({ scopeNote: "City of Hot Springs", validFrom: "2026-08-04T18:30:00.000Z" });
  expect(answers["05061"].orders[0]).toMatchObject({ scopeNote: "City of Nashville", officialUrl: "https://www.nashar.org/live_feeds/13727209" });
  expect(answers["05081"]).toMatchObject({ since: "2026-11-16", officialUrl: "https://lrcounty.org/news/" });
  expect(answers["05085"]).toMatchObject({ since: null, sourceUpdated: "2026-11-24T13:31:00.000Z" });
  expect(answers["05139"]).toMatchObject({ since: null, sourceUpdated: "2026-11-20T06:00:00.000Z" });
});

test("Van Buren uses the live sitewide announcement and ignores an unpublished banner", () => {
  expect(parseVanBurenStatus({ ...vanBuren, websiteSettings: {} }, captured)).toEqual([]);
  expect(() => parseVanBurenStatus({ ...vanBuren, website: { siteTitle: "Another county" } }, captured)).toThrow();
});

test("the Salem and Conway notices apply to their own service areas", async () => {
  await expect(parseSalemStatus(salem.replace(/<p [^>]+>.*?<\/p>/, ""), captured)).resolves.toEqual([]);
  await expect(parseConwayStatus(conway, captured)).resolves.toMatchObject([{
    scopeNote: "City of Conway", validUntil: "2026-11-25T06:00:00.000Z",
  }]);
  await expect(parseConwayStatus(conway.replace(/<font [^>]+>.*?<\/font>/, ""), captured)).resolves.toEqual([]);
});

test("each standing rule is recurring and produces only a scoped restriction", async () => {
  const checked = captured.toISOString();
  const inputs = await Promise.all(ruleFixtures.map(async ([source, parse]) => {
    expect(source).toMatchObject({ mode: "positive-only", recurring: true, scope: "part" });
    return { source, rows: await parse(), checked };
  }));
  const { snapshot } = mergeSources(null, inputs, captured);
  expect(Object.keys(snapshot.counties).sort()).toEqual(["05007", "05009", "05033", "05055", "05069", "05115", "05143"]);
  for (const county of Object.values(snapshot.counties)) {
    expect(countyDecision(county, +captured)).toMatchObject({ status: "restricted", scope: "part" });
  }
  const { parse } = arLocalRules.find(({ source }) => source.id === "ar-harrison-permit");
  const harrison = await html("harrison-permit");
  await expect(parse(new Response(harrison.replace("1538", "9999")), captured)).rejects.toThrow("rule changed");
  await expect(parse(new Response(harrison.replace("1687328", "1687329")), captured)).rejects.toThrow("identity");
});

test("the Baxter flag distinguishes no county order from an unincorporated-area ban", async () => {
  await expect(parseBaxterStatus(baxter.replace("Is Off", "Is On"), captured)).resolves.toMatchObject([
    { status: "ban", scope: "part", scopeNote: "Unincorporated Baxter County" },
  ]);
  await expect(parseBaxterStatus(baxter + baxter, captured)).rejects.toThrow("one status section");
  await expect(parseBaxterStatus(baxter.replace("Is Off", "Unavailable"), captured)).rejects.toThrow("unrecognized");
});

test("county notices reject stale timestamps, changed documents and changed scope", async () => {
  const winter = new Date("2027-01-01T18:00:00Z");
  await expect(parsePulaskiStatus(pulaski, winter, modified)).rejects.toThrow("stale");
  await expect(parsePulaskiStatus(pulaski.replace(">ON<", ">OFF<"), captured, modified)).resolves.toEqual([]);
  await expect(parsePulaskiStatus(pulaski.replace("Burn Ban", "Burn Advisory"), captured, modified)).rejects.toThrow("changed");
  await expect(parseMillerStatus(miller, winter)).rejects.toThrow("stale");
  await expect(parseUnionStatus(union, winter)).rejects.toThrow("stale");
  await expect(parseLittleRiverStatus(littleRiver, winter, readLittleRiverOrder)).rejects.toThrow("stale");
  await expect(parseLittleRiverStatus(littleRiver, captured, async () => ({ sha256: "wrong" }))).rejects.toThrow("PDF changed");
  await expect(parseGarlandAlerts(garland, winter, readGarlandOrder)).rejects.toThrow("stale");
  await expect(parseGarlandAlerts(garland, captured, async () => garlandOrder.replace("all unincorporated areas", "all areas")))
    .rejects.toThrow("scope");
  await expect(parseGarlandAlerts(garland.replace('class="alert on"', 'class="alert off"'), captured, readGarlandOrder)).resolves.toEqual([]);
  const newerLift = garland.replace(/<\/ol>/, `<li><div class="alert on"><span class="date">November 24, 2026 8:00 AM</span>
    <h3><a href="/AlertCenter.aspx?AID=228">Garland County Burn Ban Lifted</a></h3></div></li></ol>`);
  await expect(parseGarlandAlerts(newerLift, captured, async () => { throw new Error("should not read the earlier order"); })).resolves.toEqual([]);
});

test("the Lonoke mirror needs a recent official report and never derives an all-clear", () => {
  expect(parseLonokeStatus({ ...lonoke, status: "none" }, captured)).toEqual([]);
  expect(parseLonokeStatus({ ...lonoke, unknownSince: lonoke.checked }, captured)).toEqual([]);
  expect(() => parseLonokeStatus({ ...lonoke, county: "Lincoln" }, captured)).toThrow();
  expect(() => parseLonokeStatus(lonoke, new Date("2026-11-26T18:00:00Z"))).toThrow("stale");
});

test("a newer city lift displaces the Nashville ban and an old reminder expires", () => {
  const lift = { ...nashville.live_feeds[0], status: "The City of Nashville burn ban has been lifted." };
  const updated = { ...nashville, live_feeds: [lift, ...nashville.live_feeds.slice(1)] };
  expect(parseNashvilleAlerts(updated, captured)).toEqual([]);
  expect(parseNashvilleAlerts(nashville, new Date("2026-12-06T18:00:00Z"))).toEqual([]);
  expect(() => parseNashvilleAlerts({ ...nashville, live_feeds: [...nashville.live_feeds].reverse() }, captured)).toThrow("chronology");
  expect(() => parseNashvilleAlerts({ ...nashville, meta: { sections: [{ id: 42 }] } }, captured)).toThrow("section");
});

test("each Arkansas county status and rule fixture parses under 4 ms p95 thread CPU", async () => {
  for (const [source, read] of [...pollers, ...ruleFixtures]) {
    for (let i = 0; i < 8; i++) await read();
    const times: number[] = [];
    for (let i = 0; i < 32; i++) {
      const start = process.threadCpuUsage();
      await read();
      const { user, system } = process.threadCpuUsage(start);
      times.push((user + system) / 1_000);
    }
    times.sort((left, right) => left - right);
    const p95 = times[Math.ceil(times.length * 0.95) - 1];
    if (p95 >= 4) throw new Error(`${source.id} used ${p95.toFixed(2)} ms CPU p95`);
  }
});
