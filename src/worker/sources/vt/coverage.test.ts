// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { parseFprSituation, vtFprRestrictions } from "./fpr";
import { parseFranklinBurning, vtFranklinBurning } from "./franklin";
import { parseVermontPermits, vtOpenBurningPermits } from "./permits";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const situation = fixture("fpr-situation-2026-11-24");
const franklin = fixture("franklin-home-2026-11-24");
const statute = fixture("statute-2645-2026-11-24");
const statewide = fixture("fpr-statewide-order-2025-09-22");
const extension = fixture("fpr-county-extension-2024-11-11");
const captured = new Date("2026-11-24T13:40:27Z");
const closed = new Date("2025-09-22T16:01:00Z");
const extended = new Date("2024-11-12T12:00:00Z");
const fprAt = async (html = situation, now = captured, read = () => { throw new Error("unexpected order request"); }) =>
  parseFprSituation(await extractHtml(html, { blockLinks: true }), now, read);
const townAt = async (html = franklin) => parseFranklinBurning(await extractHtml(html), captured);
const lawAt = async (html = statute) => parseVermontPermits(await extractHtml(html), captured);

const statewidePath = "/news/vermont-issues-statewide-ban-debris-burning-no-burning-permits-shall-be-issued";
const countyPath = "/press-release/vermont-extends-ban-debris-burning-four-southern-counties";
const statewideTitle = "Vermont Issues Statewide Ban on Debris Burning";
const countyTitle = "Vermont Extends Ban on Debris Burning for Four Southern Counties";
const notice = (path: string, title: string) => `<h3>Burning Restrictions</h3><p><a href="${path}">${title}</a></p>`;

test("the current FPR section returns zero orders without making countywide all-clears", async () => {
  expect(await fprAt()).toEqual([]);
  expect(await fprAt(situation.replace("11/12/2026", "01/01/2024"))).toEqual([]);
  for (const html of [
    situation.replace("Burning Restrictions", "Fire Danger"),
    situation.replace("No State issued burning restrictions at this time.", "Conditions are moderate."),
    `${situation}${situation}`,
    situation.replace("No State issued burning restrictions", "State issued burning restrictions"),
  ]) await expect(fprAt(html)).rejects.toThrow("Burning Restrictions section");
});

test("FPR reads a dated statewide permit suspension from official order language", async () => {
  const articleUrl = new URL(statewidePath, vtFprRestrictions.sourceUrl).href;
  const html = notice(statewidePath, statewideTitle);
  const read = (url: string) => {
    expect(url).toBe(articleUrl);
    return extractHtml(statewide);
  };
  const rows = await fprAt(html, closed, read);
  expect(rows.map(({ fips }) => fips)).toEqual(countiesInState("VT").map(({ fips }) => fips));
  for (const row of rows) expect(row).toMatchObject({
    status: "ban", scope: "part", scopeNote: "Statewide debris burning that requires a permit",
    validFrom: "2025-09-22T16:00:00.000Z", since: "2025-09-22", expires: null,
    sourceUpdated: null, officialUrl: articleUrl,
  });
  await expect(fprAt(html, captured, read)).rejects.toThrow("unconfirmed effective date");
  await expect(fprAt(notice("https://example.com" + statewidePath, statewideTitle), closed))
    .rejects.toThrow("unrecognized order link");
  const archived = `<h3>Burning Restrictions</h3><p>Conditions are moderate.</p><h3>Old orders</h3>${html.split("</h3>")[1]}`;
  await expect(fprAt(archived, closed)).rejects.toThrow("unrecognized Burning Restrictions section");
});

test("FPR applies a county extension only to the named counties and respects the Eastern end time", async () => {
  const html = notice(countyPath, countyTitle);
  const read = () => extractHtml(extension);
  const rows = await fprAt(html, extended, read);
  expect(rows.map(({ fips }) => fips)).toEqual(["50003", "50021", "50025", "50027"]);
  for (const row of rows) expect(row).toMatchObject({
    status: "ban", scope: "part", expires: "2024-11-18", validUntil: "2024-11-18T20:00:00.000Z",
  });
  await expect(fprAt(html, new Date("2024-11-18T20:00:00Z"), read)).rejects.toThrow("unconfirmed expiration");
  await expect(fprAt(html, extended, () => extractHtml(extension.replaceAll("Bennington", "Springfield"))))
    .rejects.toThrow("unknown county");
});

test("Franklin's banner applies only in town and current absence conveys no all-clear", async () => {
  expect(await townAt()).toEqual([expect.objectContaining({
    fips: "50011", county: "Franklin County", status: "ban", scope: "part",
    scopeNote: "Town of Franklin, outdoor burning covered by the town order",
    note: expect.stringContaining("campfires up to three feet"), sourceUpdated: null, since: null, expires: null,
  })]);
  const active = "A burn ban is in effect for the town of Franklin until further notice.";
  expect(await townAt(franklin.replace(active, "Town notice"))).toEqual([]);
  expect(await townAt(franklin.replace(active, "The burn ban has been lifted."))).toEqual([]);
  await expect(townAt(franklin.replace(active, "The burn ban will be lifted Monday."))).rejects.toThrow("unrecognized");
  await expect(townAt(franklin.replace("no more than 3 feet", "no more than 2 feet"))).rejects.toThrow("campfire exception");
});

test("the enacted permit rule covers all counties and preserves Franklin's local order", async () => {
  const rows = await lawAt();
  expect(rows.map(({ fips }) => fips)).toEqual(countiesInState("VT").map(({ fips }) => fips));
  for (const row of rows) expect(row).toMatchObject({
    status: "restricted", scope: "part", validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-26T05:00:00.000Z",
    note: expect.stringContaining("sites surrounded by snow"),
  });
  expect(vtOpenBurningPermits.recurring).toBe(true);
  const input = [
    { source: vtOpenBurningPermits, rows, checked: captured.toISOString() },
    { source: vtFranklinBurning, rows: await townAt(), checked: captured.toISOString() },
  ];
  const { snapshot } = mergeSources(null, input, captured);
  expect(Object.values(snapshot.counties).map(({ status }) => status)).toEqual(Array(14).fill("restricted"));
  expect(snapshot.counties["50011"]).toMatchObject({
    sourceId: vtFranklinBurning.id, orders: expect.arrayContaining([expect.objectContaining({ status: "ban", scope: "part" })]),
  });
  expect(snapshot.counties["50013"].orders).toHaveLength(1);
  await expect(lawAt(statute.replace("where there is snow surrounding", "where there is snow within sight of")))
    .rejects.toThrow("statute changed or is missing");
});

test("Vermont's three current fixture parses use less than 4 ms combined p95 thread CPU", async () => {
  const parse = async () => {
    await fprAt();
    await townAt();
    await lawAt();
  };
  for (let index = 0; index < 15; index++) await parse();
  const samples = [];
  for (let index = 0; index < 60; index++) {
    const start = process.threadCpuUsage();
    await parse();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(0.95 * samples.length) - 1]).toBeLessThan(4);
});
