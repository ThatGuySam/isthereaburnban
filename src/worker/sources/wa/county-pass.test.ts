// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { COUNTIES } from "../../counties";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { parseBentonDaily, waBentonDaily } from "./benton-daily";
import {
  waCountyStatus, waIslandFire, waIslandPermitStatuses, waKitsapFire, waKlickitatZones, waOkanoganFire, waPierceFire, waSnohomishFire,
} from "./county-status";
import { waCountyRules } from "./local-rules";
import { waKittitasStatus, waNorthwestAir, waOrcaaStatus, waRegionalStatus, waSpokaneStatus, waSwcaaStatuses, waYakimaAir } from "./regional-status";

const now = new Date("2026-11-26T10:00:00Z");
const summer = new Date("2026-07-23T19:00:00Z");
const waCounties = COUNTIES.filter(({ state }) => state === "WA").map(({ fips }) => fips);
const root = new URL("./fixtures/", import.meta.url);
const statusFile = (id: string) => Bun.file(new URL(`county-status/${id.slice(3)}.${id === waIslandFire.source.id ? "xml" : "html"}`, root));
const statusHtml = (id: string) => statusFile(id).text();
const response = (id: string) => new Response(statusFile(id));

const live = [...waRegionalStatus, ...waCountyStatus, { source: waBentonDaily, parse: parseBentonDaily }];

for (const { source, parse } of live) {
  test(`${source.id} reads its current published panel and leaves the all-clear scoped`, async () => {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ scope: "part", mode: "positive-only" });
    expect(source.reportingFips?.every((fips) => waCounties.includes(fips))).toBe(true);
    expect(await parse(response(source.id), now)).toEqual([]);
  });
}

test("ORCAA reads each activity, validates the roster, and rejects unclear decisions", async () => {
  const original = await statusHtml(waOrcaaStatus.source.id);
  const closed = original.replace(">Allowed<", ">Prohibited<");
  expect(await waOrcaaStatus.parse(new Response(closed), now)).toEqual([expect.objectContaining({
    fips: "53009", status: "restricted", scope: "part", note: expect.stringContaining("recreational fires"),
    sourceUpdated: "2026-10-15T14:30:00.000Z",
  })]);
  await expect(waOrcaaStatus.parse(new Response(original.replace(">Allowed<", ">Consult official<")), now))
    .rejects.toThrow("unrecognized status");
  await expect(waOrcaaStatus.parse(new Response(original.replace(">Clallam<", ">Mason<")), now)).rejects.toThrow("Unexpected status row");
  await expect(waOrcaaStatus.parse(new Response(original.replace("10/15/2026", "10/15/2027")), now)).rejects.toThrow("future-dated");
});

test("SWCAA requires the named county and a recognized decision in its dated status section", async () => {
  const clark = waSwcaaStatuses[0];
  const original = await statusHtml(clark.source.id);
  expect(await clark.parse(new Response(original.replace("No Burn Ban is in Effect", "Stage 1 Fire Safety Burn Ban in Effect")), now))
    .toEqual([expect.objectContaining({ fips: "53011", status: "restricted", since: "2026-10-02", officialUrl: clark.source.officialUrl })]);
  await expect(clark.parse(response(waSwcaaStatuses[1].source.id), now)).rejects.toThrow("Clark status section");
  await expect(clark.parse(new Response(original.replace("No Burn Ban is in Effect", "Status unavailable")), now)).rejects.toThrow("unrecognized Clark burn status");
  await expect(clark.parse(new Response(original.replace("October 2, 2026", "January 2, 2027")), now)).rejects.toThrow("effective date");
});

test("two air agencies and the Kittitas district grid retain the issuing subarea", async () => {
  const yakima = await statusHtml(waYakimaAir.source.id);
  const nw = await statusHtml(waNorthwestAir.source.id);
  const kittitas = await statusHtml(waKittitasStatus.source.id);
  expect(await waYakimaAir.parse(new Response(yakima.replace("<h5>No air pollution burn ban in effect", "<h5>Stage 1 Burn Ban in effect")), now))
    .toEqual([expect.objectContaining({ fips: "53077", scopeNote: "Upper Yakima County air-quality area", status: "ban" })]);
  const stages = nw.replace(/(Whatcom County<\/h3>[\s\S]*?\.?(?:uagb-ifb-desc">))No Burn Ban in Rural Areas/,
    "$1Stage 2 Air Quality Burn Ban in the Columbia Valley Urban Growth Area");
  expect(await waNorthwestAir.parse(new Response(stages), now))
    .toEqual([expect.objectContaining({ fips: "53073", scopeNote: "Columbia Valley urban growth area", status: "ban" })]);
  expect(await waKittitasStatus.parse(new Response(kittitas.replace("There is no fire safety burn ban.", "There is a fire safety burn ban.")), now))
    .toEqual([expect.objectContaining({ fips: "53037", scopeNote: "Fire District 1 (Rural Thorp)", status: "restricted" })]);
  await expect(waKittitasStatus.parse(new Response(kittitas.replace("(Rural Thorp)", "(Changed)")), now)).rejects.toThrow("Unexpected status row");
});

test("CivicPlus and SharePoint issuer panels distinguish positive status and missing evidence", async () => {
  const examples = [
    [waKitsapFire, "No Burn Ban", "Stage 1 Burn Ban", "restricted"],
    [waSnohomishFire, "No Burn Ban", "Stage 2 Burn Ban", "ban"],
    [waPierceFire, "There are no burn bans in Pierce County at this time.", "Stage 1 Burn Ban in effect", "restricted"],
    [waOkanoganFire, "<strong>Currently No</strong> Burn Restrictions in place.", "Currently Burn Restrictions in place.", "restricted"],
    [waSpokaneStatus, "There are currently no restrictions in place on outdoor burning or wood heating in Spokane County (incorporated and unincorporated).",
      "Outdoor burning is restricted throughout Spokane County.", "restricted"],
  ] as const;
  for (const [{ source, parse }, clear, positive, status] of examples) {
    const html = await statusHtml(source.id);
    expect(await parse(new Response(html.replaceAll(clear, positive)), now)).toEqual([expect.objectContaining({ status, scope: "part" })]);
    await expect(parse(new Response(html.replaceAll(clear, "The status could not be determined.")), now)).rejects.toThrow();
  }
});

test("Klickitat zone orders respect their own effective dates", async () => {
  const original = await statusHtml(waKlickitatZones.source.id);
  const active = original.replace("Rescinded October 16, 2026", "Effective October 12, 2026 at 12:01 a.m.");
  expect(await waKlickitatZones.parse(new Response(active), now)).toEqual([expect.objectContaining({
    fips: "53039", scopeNote: "Klickitat County burn ban zone One", since: "2026-10-12",
    validFrom: "2026-10-12T07:01:00.000Z", status: "restricted",
  })]);
  expect(await waKlickitatZones.parse(new Response(active.replace("October 12", "December 12")), now)).toEqual([]);
  await expect(waKlickitatZones.parse(new Response(original.replace("Zone Two", "Zone Four")), now)).rejects.toThrow("Unexpected status row");
});

test("Island County RSS uses the named stage and effective date from the latest current notice", async () => {
  const original = await statusHtml(waIslandFire.source.id);
  const notice = original.replace("Burn Ban Lift - October 20, 2026", "Type 1 Burn Ban")
    .replace("<description> </description>", "<description>Effective November 26, 2026 at 8 a.m.</description>");
  expect(await waIslandFire.parse(new Response(notice), now)).toEqual([]);
  expect(await waIslandFire.parse(new Response(notice), new Date("2026-11-26T16:01:00Z"))).toEqual([expect.objectContaining({
    fips: "53029", since: "2026-11-26", validFrom: "2026-11-26T16:00:00.000Z", status: "restricted",
  })]);
  await expect(waIslandFire.parse(new Response(notice.replace("Type 1", "Type 3")), now)).rejects.toThrow("unrecognized");
});

test("the fire district permit boards require the correct issuer and read only the current permit card", async () => {
  for (const { source, parse } of waIslandPermitStatuses) {
    const html = await statusHtml(source.id);
    const hold = html.replace("> Yes</span>", "> No</span>").replace(">With a permit.</span>", ">Permitted burns are closed.</span>");
    expect(await parse(new Response(hold), now)).toEqual([expect.objectContaining({
      fips: "53055", status: "restricted", officialUrl: source.officialUrl,
    })]);
    const replaced = html.replace(source.sourceName.replace("&", "&amp;"), "Other Fire District");
    await expect(parse(new Response(replaced), now)).rejects.toThrow("missing or changed permit status");
  }
});

test("Benton requires a current Pacific date and publishes only the activity on a no-burn day", async () => {
  const pending = await statusHtml(waBentonDaily.id);
  const closed = pending.replace(/<p>Unfortunately[\s\S]*?<\/p>/,
    "<h3>Residential: No Burn Day</h3><h3>Agricultural: Burn Day</h3>");
  expect(await parseBentonDaily(new Response(closed), now)).toEqual([expect.objectContaining({
    fips: "53005", status: "restricted", label: "Residential no-burn day", expires: "2026-11-26",
    validFrom: "2026-11-26T08:00:00.000Z", validUntil: "2026-11-27T08:00:00.000Z",
  })]);
  await expect(parseBentonDaily(new Response(closed), new Date("2026-11-27T08:00:00Z"))).rejects.toThrow("stale");
  await expect(parseBentonDaily(new Response(closed.replace("Agricultural: Burn Day", "Agricultural: Pending")), now)).rejects.toThrow("unknown agricultural");
});

test("verified recurring Washington rules give every county a correctly scoped restriction", async () => {
  const inputs = [];
  for (const { fixture, source, parse } of waCountyRules) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ recurring: true, scope: "part", mode: "positive-only" });
    const file = Bun.file(new URL(`local-rules/${fixture}`, root));
    const rows = await parse(new Response(file), now);
    expect(await parse(new Response(file), summer)).not.toHaveLength(0);
    expect(rows.every((row) => row.status === "restricted" && row.scope === "part" && row.standing && row.officialUrl === source.officialUrl)).toBe(true);
    inputs.push({ source, rows, checked: now.toISOString() });
  }
  const { counties } = mergeSources(null, inputs, now).snapshot;
  expect(waCounties.map((fips) => counties[fips].status)).toEqual(waCounties.map(() => "restricted"));
  expect(counties["53019"].orders).toEqual([expect.objectContaining({
    scope: "part", scopeNote: "Republic and its urban growth area", label: expect.stringContaining("listed areas"),
  })]);
  const seasonal = inputs.find(({ source }) => source.id === "wa-yakima-summer");
  expect(seasonal?.rows).toEqual([]);
});

test("a changed standing rule or ordinance needs review before it can be published", async () => {
  const rule = waCountyRules.find(({ source }) => source.id === "wa-clark-outdoor-permits");
  if (!rule) throw new Error("Missing Clark County standing rule");
  const file = Bun.file(new URL(`local-rules/${rule.fixture}`, root));
  await expect(rule.parse(new Response((await file.text()).replace("land clearing", "forest clearing")), now))
    .rejects.toThrow();
});

test("Washington county fixture parsing stays below 5 ms p95 thread CPU per publisher", async () => {
  const entries = [
    ...live.map(({ source, parse }) => ({ source, parse, file: statusFile(source.id) })),
    ...waCountyRules.map(({ fixture, source, parse }) => ({ source, parse, file: Bun.file(new URL(`local-rules/${fixture}`, root)) })),
  ];
  let max = { id: "", ms: 0 };
  for (const { source, parse, file } of entries) {
    const body = await file.arrayBuffer();
    for (let i = 0; i < 8; i++) await parse(new Response(body), now);
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const start = process.threadCpuUsage();
      await parse(new Response(body), now);
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    samples.sort((a, b) => a - b);
    if (samples[37] > max.ms) max = { id: source.id, ms: samples[37] };
    expect(samples[37]).toBeLessThan(5);
  }
  console.info(`WA county fixture parse p95 max ${max.ms.toFixed(3)} ms thread CPU (${max.id})`);
});
