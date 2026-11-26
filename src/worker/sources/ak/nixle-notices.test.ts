// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { nixleNotice, nixleWire } from "../lib/nixle";
import { akNixleNotices, parseAkNixleNotice } from "./nixle-notices";

const fixture = (name: string) => Bun.file(new URL(`./fixtures/county-pass/nixle-${name}.html`, import.meta.url)).text();
const haines = {
  wire: await fixture("haines-issue-wire"), detail: await fixture("haines-issue-notice"), url: "https://nixle.us/HJESZ",
  current: await fixture("haines-current-wire"),
};
const skagway = {
  wire: await fixture("skagway-issue-wire"), detail: await fixture("skagway-issue-notice"), url: "https://nixle.us/HJKY3",
  current: await fixture("skagway-current-wire"),
};

// The captures are historical. In-window tests remove only the publisher's expired-message badge.
const active = (html: string) => html.replace(' <img src="/static/Citizen-master/img/public/msg_expiration.png" />', "");
const at = (stamp: string) => new Date(stamp);

function follow(expected: string, detail: string) {
  return async (url: string) => {
    expect(url).toBe(expected);
    return detail;
  };
}

test("current Haines and Skagway Nixle Wires give no new decision", async () => {
  const noDetail = async () => { throw new Error("Unexpected Nixle detail request"); };
  const captured = at("2026-11-26T10:38:00Z");
  expect(await parseAkNixleNotice("haines", haines.current, noDetail, captured)).toEqual([]);
  expect(await parseAkNixleNotice("skagway", skagway.current, noDetail, captured)).toEqual([]);
  expect(akNixleNotices.map(({ reportingFips, mode }) => [reportingFips, mode])).toEqual([
    [["02100"], "positive-only"], [["02230"], "positive-only"],
  ]);
});

test("Nixle distinguishes an unexpired notice from an expired republication", async () => {
  const slug = "skagway-police-department";
  const agency = "Skagway Police Department";
  const road = await nixleNotice(await fixture("skagway-unexpired-road-notice"), agency, slug, "Dyea Flats Road Closure - NPS KLGO");
  const [ban] = (await nixleWire(skagway.wire, agency)).filter(({ url }) => url === skagway.url);
  const expired = await nixleNotice(skagway.detail, agency, slug, ban.title);
  expect(road).toMatchObject({ expired: false, published: "Wednesday November 25th, 2026 :: 02:46 p.m. AKST" });
  expect(expired.expired).toBe(true);
  expect(await parseAkNixleNotice("skagway", skagway.wire, follow(skagway.url, skagway.detail), at("2026-08-13T19:00:00Z"))).toEqual([]);
});

test("Haines permit suspension starts at the effective time and covers the local permit area", async () => {
  const parse = (stamp: string) => parseAkNixleNotice("haines", haines.wire, follow(haines.url, active(haines.detail)), at(stamp));
  expect(await parse("2026-08-12T15:59:00Z")).toEqual([]);
  const rows = await parse("2026-08-12T16:30:00Z");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "02100", county: "Haines Borough", status: "restricted", scope: "part", scopeNote: "Haines Borough fire service areas",
    officialUrl: haines.url, since: "2026-08-12", expires: null, sourceUpdated: "2026-08-12T00:31:00.000Z",
    validFrom: "2026-08-12T16:00:00.000Z", validUntil: "2026-08-12T18:30:00.000Z",
  });
  expect(await parse("2026-08-13T00:31:00Z")).toEqual([]);
});

test("Skagway's confirmed total ban covers the municipality, with a separate freshness window", async () => {
  const rows = await parseAkNixleNotice("skagway", skagway.wire, follow(skagway.url, active(skagway.detail)), at("2026-08-14T18:00:00Z"));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "02230", status: "ban", scope: "county", officialUrl: skagway.url, expires: null,
    since: "2026-08-13", validFrom: "2026-08-13T18:46:00.000Z", validUntil: "2026-08-14T18:46:00.000Z",
    sourceUpdated: "2026-08-13T18:46:00.000Z",
  });
});

test("Haines and Skagway lift notices do not publish all-clears", async () => {
  const hainesLift = await fixture("haines-lift-wire");
  const skagwayLift = await fixture("skagway-lift-wire");
  const cases = await Promise.all([
    parseAkNixleNotice("haines", hainesLift, follow("https://nixle.us/HJXMM", active(await fixture("haines-lift-notice"))), at("2026-08-17T18:00:00Z")),
    parseAkNixleNotice("skagway", skagwayLift, follow("https://nixle.us/HK237", active(await fixture("skagway-lift-notice"))), at("2026-08-18T18:00:00Z")),
  ]);
  expect(cases).toEqual([[], []]);
});

test("Haines recognizes the publisher's separate campfire and permit suspension messages", async () => {
  const cases = [
    { slug: "HJNPR", wire: await fixture("haines-lift-wire"), name: "campfires", stamp: "2026-08-14T21:00:00Z", label: "Haines campfires prohibited" },
    { slug: "HHJF5", wire: haines.wire, name: "correction", stamp: "2026-08-02T06:00:00Z", label: "Haines permitted burning suspended" },
    { slug: "HHJE3", wire: haines.wire, name: "contextual-correction", stamp: "2026-08-02T06:00:00Z", label: "Haines permitted burning suspended" },
  ];
  for (const { slug, wire, name, stamp, label } of cases) {
    const url = `https://nixle.us/${slug}`;
    const singleNoticeWire = wire.replace(/<li\b.*?<\/li>/gs, (entry) => entry.includes(`href="${url}"`) ? entry : "");
    const rows = await parseAkNixleNotice("haines", singleNoticeWire, follow(url, active(await fixture(`haines-${name}-notice`))), at(stamp));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ scope: "part", status: "restricted", label });
  }
});

test("Nixle fails closed on changed markup, dates, issuer links and scope", async () => {
  const now = at("2026-08-13T19:00:00Z");
  const read = follow(skagway.url, active(skagway.detail));
  await expect(parseAkNixleNotice("skagway", skagway.wire.replace('class="headline_agency"', 'class="headline"'), read, now))
    .rejects.toThrow("Missing or changed Nixle Wire page");
  await expect(parseAkNixleNotice("skagway", haines.wire, read, now)).rejects.toThrow("Missing or changed Nixle Wire page");
  await expect(parseAkNixleNotice("skagway", skagway.wire, follow(skagway.url, active(skagway.detail).replace("AKDT", "AKST")), now))
    .rejects.toThrow("inconsistent Alaska publication time zone");
  await expect(parseAkNixleNotice("skagway", skagway.wire, follow(skagway.url, active(skagway.detail).replace("Municipality boundaries", "municipal parks")), now))
    .rejects.toThrow("unrecognized burn notice");
  await expect(parseAkNixleNotice("skagway", skagway.wire, follow(skagway.url, active(skagway.detail).replace('href="/skagway-police-department/"', 'href="/other-department/"')), now))
    .rejects.toThrow("Missing or changed Nixle notice");
});

test("Nixle fixture parsing stays under 5 ms p95 thread CPU for each local source", async () => {
  const runs = [
    ["haines", haines, "2026-08-12T16:30:00Z"],
    ["skagway", skagway, "2026-08-13T19:00:00Z"],
  ] as const;
  for (const [name, { wire, url, detail }, stamp] of runs) {
    const now = at(stamp);
    const read = follow(url, active(detail));
    for (let i = 0; i < 5; i++) await parseAkNixleNotice(name, wire, read, now);
    const samples: number[] = [];
    for (let i = 0; i < 40; i++) {
      const start = process.threadCpuUsage();
      await parseAkNixleNotice(name, wire, read, now);
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    console.log(`AK ${name} Nixle fixture p95 ${p95.toFixed(3)} ms thread CPU`);
    expect(p95).toBeLessThan(5);
  }
});
