// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { dcOpenBurning, parseDcOpenBurning } from "./open-burning";
import { dcRockCreekFireRules, parseRockCreekFireRules } from "./rock-creek";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const chapter = fixture("dcregs-chapter-6-2026-11-24.html").toString();
const document = fixture("dcregs-section-604-2026-11-24.doc");
const park = fixture("rock-creek-compendium-2026-11-24.html").toString();
const now = new Date("2026-11-24T17:31:00Z");
const readDocument = async () => new Response(document);
const parseDistrict = (html = chapter, at = now) => parseDcOpenBurning(html, at, readDocument);
const parsePark = () => parseRockCreekFireRules(park, now);

test("DCRegs maps the reviewed § 604 rule to the District across Eastern midnight", async () => {
  const rows = await parseDcOpenBurning(chapter, now, async (url) => {
    expect(url).toBe("https://dcregs.dc.gov/Common/DCMR/RuleList.aspx?DownloadFile=00C7545F-0000-C7AF-B33F-1DE74AD122DF");
    return readDocument();
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "11001", county: "District of Columbia", state: "DC", scope: "state", status: "restricted",
    since: null, expires: null, sourceUpdated: null,
    validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-26T05:00:00.000Z",
  });
  const nextDay = await parseDistrict(chapter, new Date("2026-11-25T05:00:00Z"));
  expect(nextDay[0]).toMatchObject({
    validFrom: "2026-11-25T05:00:00.000Z", validUntil: "2026-11-27T05:00:00.000Z",
  });
});

test("DCRegs rejects a changed listing, unknown publication value or revised document", async () => {
  const row = chapter.match(/<tr>[\s\S]*?<\/tr>/g).find((entry) => entry.includes(">20-604<"));
  for (const changed of [
    chapter.replace("Latest Version", "Archive"),
    chapter.replace("20-604</a>", "20-644</a>"),
    chapter.replace("OPEN BURNING", "BRUSH BURNING"),
    chapter.replace("00C7545F-0000-C7AF-B33F-1DE74AD122DF", "updated"),
    chapter.replace(row, row + row),
  ]) {
    await expect(parseDcOpenBurning(changed, now, async () => {
      throw new Error("The document must not be read from an unverified listing");
    })).rejects.toThrow("current § 604 listing changed");
  }
  await expect(parseDcOpenBurning(chapter, now, async () => new Response("Unrecognized document")))
    .rejects.toThrow("reviewed § 604 document changed");
});

test("Rock Creek preserves park-only geography and requires the approved compendium terms", async () => {
  expect(await parsePark()).toEqual([expect.objectContaining({
    fips: "11001", scope: "part", status: "restricted",
    scopeNote: "National Park Service land administered by Rock Creek Park in the District",
  })]);
  expect(await parseRockCreekFireRules(park, new Date("2026-08-28T03:59:59Z"))).toEqual([]);
  for (const [old, update] of [
    ["August 28, 2026", "August 28, 2027"],
    ["all lands and waters", "all waters"],
    ["Fires are allowed within fire", "Fires are prohibited within fire"],
  ]) {
    expect(park).toContain(old);
    await expect(parseRockCreekFireRules(park.replace(old, update), now)).rejects.toThrow("reviewed fire rules");
  }
});

test("DC calendar rules retain the park order and suppress scheduled transitions", async () => {
  const checked = now.toISOString();
  const inputs = [
    { source: dcOpenBurning, rows: await parseDistrict(), checked },
    { source: dcRockCreekFireRules, rows: await parsePark(), checked },
  ];
  expect(inputs.every(({ source }) => source.recurring && source.mode === "positive-only")).toBe(true);
  const previous = mergeSources(null, [{
    ...inputs[0], rows: [{ ...inputs[0].rows[0], status: "unknown" }],
  }], now).snapshot;
  const { snapshot, transitions } = mergeSources(previous, inputs, now);
  expect(snapshot.counties["11001"]).toMatchObject({
    scope: "state", status: "restricted", sourceId: dcOpenBurning.id,
    orders: [expect.objectContaining({ scope: "part", status: "restricted", sourceId: dcRockCreekFireRules.id })],
  });
  expect(transitions).toEqual([]);
  const expired = mergeSources(snapshot, inputs, new Date("2026-11-26T05:00:00Z")).snapshot;
  expect(statusFor(expired, "11001", Date.parse(expired.generated)).status).toBe("unknown");
});

test("DC fixtures stay below 4 ms p95 thread CPU", async () => {
  for (const parse of [parseDistrict, parsePark]) {
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
  }
});
