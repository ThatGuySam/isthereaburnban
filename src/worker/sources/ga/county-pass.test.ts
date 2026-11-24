// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { gaEpdNonSummer, parseEpdSeasonal } from "./epd";
import { gaHinesvilleClosure, hinesvilleFormLink, parseHinesvilleClosure } from "./hinesville";
import { GA_LOCAL_RULES, gaLocalRuleKeys, gaLocalRuleSources, parseGaLocalRule } from "./local-rules";
import { gaPermitCalendars, parsePermitCalendar } from "./permit-calendar";

const read = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const html = (name) => read(`${name}-2026-11-24.html`).toString("utf8");
const query = (name) => JSON.parse(read(`permit-${name}-2026-11-24.json`).toString("utf8"));
const now = new Date("2026-11-24T21:15:00Z");
const checked = now.toISOString();
const hinesvillePage = html("hinesville-permit-page");
const hinesvilleForm = html("hinesville-closed-form");

const permits = [
  ["Barrow", query("barrow-closed"), new Date("2026-10-25T19:00:00Z"), "13013"],
  ["Habersham", query("habersham-closed"), new Date("2026-11-18T19:00:00Z"), "13137"],
  ["Ware", query("ware-closed"), new Date("2026-09-18T19:00:00Z"), "13299"],
];

const rules = gaLocalRuleKeys.map((key) => {
  const name = key === "hinesville" ? "hinesville-permit-page" : `rule-${key}`;
  const kind = GA_LOCAL_RULES[key].kind;
  const bytes = kind === "scan" ? gunzipSync(read(`${name}-2026-11-24.html.gz`)) :
    read(`${name}-2026-11-24.${kind}`);
  return { key, bytes, parse: (at = now) => parseGaLocalRule(new Response(bytes), at, key) };
});

test("the three county permit calendars report dated residential closures, limited to their permit areas", () => {
  for (const [program, body, at, fips] of permits) {
    const rows = parsePermitCalendar(body, program, at);
    const provider = gaPermitCalendars.find(({ id }) => id === `ga-${program.toLowerCase()}-permit-calendar`);
    expect(provider.mode).toBe("positive-only");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fips, status: "restricted", scope: "part", since: at.toISOString().slice(0, 10),
      officialUrl: provider.officialUrl,
    });
    expect(rows[0].sourceUpdated).toBeTruthy();
  }
  expect(parsePermitCalendar(query("ware-empty"), "Ware", now)).toEqual([]);
});

test("permit calendar rejects a wrong date, county, field type, duplicate or incomplete result", () => {
  const [program, body, at] = permits[1];
  expect(() => parsePermitCalendar(body, program, now)).toThrow("date range");
  expect(() => parsePermitCalendar(body, "Ware", at)).toThrow("document");
  expect(() => parsePermitCalendar([...body, ...body], program, at)).toThrow("duplicate");
  expect(() => parsePermitCalendar([], program, at)).toThrow();
  const changed = structuredClone(body);
  changed[0].document.fields.reason = { booleanValue: true };
  expect(() => parsePermitCalendar(changed, program, at)).toThrow();
});

test("Hinesville's linked form reports a city closure and expires it at Eastern midnight", async () => {
  const linked = await hinesvilleFormLink(hinesvillePage);
  expect(linked).toBe("https://www.cityofhinesville.org/FormCenter/Fire-Department-3/Not-Issuing-Burn-Permits-35");
  const rows = await parseHinesvilleClosure(hinesvilleForm, now, linked);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "13179", scope: "part", status: "restricted",
    scopeNote: "Residential yard-debris burning within the City of Hinesville",
    officialUrl: gaHinesvilleClosure.officialUrl,
    sourceUrl: linked,
    validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-25T05:00:00.000Z",
  });
  const input = [{ source: gaHinesvilleClosure, rows, checked }];
  expect(mergeSources(null, input, now).snapshot.counties["13179"].status).toBe("restricted");
  expect(mergeSources(null, input, new Date(rows[0].validUntil)).snapshot.counties["13179"]).toBeUndefined();
  await expect(parseHinesvilleClosure(hinesvilleForm.replace("at this time", "next Monday"), now))
    .rejects.toThrow("unrecognized");
  await expect(hinesvilleFormLink(hinesvillePage.replace("/FormCenter/", "https://example.org/FormCenter/")))
    .rejects.toThrow("current Fire Department");
});

test("reviewed local rules move previously unknown counties to a scoped restriction", async () => {
  const baseline = parseEpdSeasonal(await extractHtml(html("epd-non-summer")), now, "nonSummer");
  const original = mergeSources(null, [{ source: gaEpdNonSummer, rows: baseline, checked }], now).snapshot;
  const inputs = [{ source: gaEpdNonSummer, rows: baseline, checked }];
  for (const [index, { parse }] of rules.entries()) {
    const source = gaLocalRuleSources[index];
    const rows = await parse();
    expect(source).toMatchObject({ recurring: true, mode: "positive-only" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === "restricted" && row.officialUrl === source.officialUrl)).toBe(true);
    inputs.push({ source, rows, checked });
  }
  const { snapshot } = mergeSources(null, inputs, now);
  const added = Object.values(snapshot.counties).filter(({ fips }) => !original.counties[fips]);
  expect(added.map(({ county }) => county).sort()).toEqual([
    "Bulloch County", "Burke County", "Chatham County", "Coffee County", "Crawford County", "Crisp County",
    "Dawson County", "Effingham County", "Gilmer County", "Glynn County", "Greene County", "Habersham County",
    "Laurens County", "Liberty County", "Lowndes County", "Muscogee County", "Pickens County", "Sumter County",
    "Thomas County", "Ware County", "Wayne County", "Whitfield County",
  ]);
  expect(added.every(({ status, scope }) => status === "restricted" && scope === "part")).toBe(true);
  expect(snapshot.counties["13299"].orders.map(({ sourceId }) => sourceId)).toEqual([
    "ga-ware-local-rule", "ga-waycross-local-rule",
  ]);
});

test("changed local wording or documents fail closed and seasonal rule edges follow Eastern time", async () => {
  const statesboro = html("rule-statesboro");
  await expect(parseGaLocalRule(new Response(statesboro.replace("without a permit", "only on Mondays")), now, "statesboro"))
    .rejects.toThrow("reviewed burn rules changed");
  await expect(parseGaLocalRule(new Response("%PDF-1.6 different ordinance"), now, "chatham"))
    .rejects.toThrow("reviewed burn rules changed");

  const macon = rules.find(({ key }) => key === "macon-bibb").parse;
  expect((await macon(new Date("2027-05-01T03:59:59Z")))[0].validUntil).toBe("2027-05-01T04:00:00.000Z");
  expect(await macon(new Date("2027-05-01T04:00:00Z"))).toEqual([]);
});

test("each GA county fixture takes under 4 ms p95 thread CPU", async () => {
  const parsers = [
    ...permits.map(([program, body, at]) => [program, () => parsePermitCalendar(body, program, at)]),
    ["Hinesville form", async () => {
      await hinesvilleFormLink(hinesvillePage);
      await parseHinesvilleClosure(hinesvilleForm, now);
    }],
    ...rules.map(({ key, parse }) => [key, parse]),
  ];
  for (const [name, parse] of parsers) {
    for (let i = 0; i < 8; i++) await parse();
    const timings = [];
    for (let i = 0; i < 40; i++) {
      const start = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(start);
      timings.push((user + system) / 1000);
    }
    timings.sort((a, b) => a - b);
    expect(timings[37], name).toBeLessThan(4);
  }
});
