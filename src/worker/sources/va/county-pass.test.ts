// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { parseBrunswickNotices, vaBrunswickBurnBan } from "./brunswick";
import { vaLocalCalendars } from "./local-rules";
import { parseNottowayNews, vaNottowayBurnBan } from "./nottoway";
import { parseRapidanAlerts, vaRapidanAlerts } from "./rapidan";
import { parseShenandoahAlerts, vaShenandoahAlerts } from "./shenandoah";

const now = new Date("2026-11-24T21:45:00Z");
const checked = now.toISOString();
const read = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const brunswick = read("brunswick-public-notices-2026-11-24.html").toString();
const nottoway = read("nottoway-news-2026-11-24.html").toString();
const local = vaLocalCalendars.map(({ id, fips, kind, parse, source }) => {
  const fixture = read(`rule-${id}-2026-11-24.${kind}`);
  return { id, fips, fixture, source, parse: (at = now) => parse(new Response(fixture), at) };
});

test("Brunswick confirms the countywide order with its actual effective time", async () => {
  const rows = await parseBrunswickNotices(brunswick, now);
  expect(vaBrunswickBurnBan.mode).toBe("positive-only");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "51025", status: "ban", scope: "county", since: "2026-10-29", expires: null,
    validFrom: "2026-10-29T16:00:00.000Z", officialUrl: vaBrunswickBurnBan.officialUrl,
  });
  const noNotice = brunswick.replace(/<h3[^>]*>🔥 COUNTY-WIDE BURN BAN[^<]*<\/h3>/, "");
  expect(await parseBrunswickNotices(noNotice, now)).toEqual([]);
  expect(await parseBrunswickNotices(brunswick +
    "<h2>Brunswick County Burn Ban Lifted</h2>", now)).toEqual([]);
  await expect(parseBrunswickNotices(brunswick.replace("Thursday, October 29", "Monday, October 29"), now))
    .rejects.toThrow("unrecognized burn ban terms");
  await expect(parseBrunswickNotices(brunswick.replace("will be in effect for Brunswick County.", "will be in effect through October 30."), now))
    .rejects.toThrow("unrecognized burn ban terms");
  await expect(parseBrunswickNotices("<h1>Unavailable</h1>", now)).rejects.toThrow("public notices panel");
});

test("Nottoway reports the notice's publication date and keeps its unconfirmed boundaries scoped", async () => {
  const rows = await parseNottowayNews(nottoway, now);
  expect(vaNottowayBurnBan.mode).toBe("positive-only");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "51135", status: "ban", scope: "part", sourceUpdated: "2026-11-20",
    since: null, expires: null, officialUrl: vaNottowayBurnBan.officialUrl,
  });
  const replace = (title) => nottoway.replace("BURN BAN IN EFFECT UNTIL FURTHER NOTICE", title);
  expect(await parseNottowayNews(replace("County office hours"), now)).toEqual([]);
  expect(await parseNottowayNews(replace("Burn Ban Rescinded"), now)).toEqual([]);
  const notice = nottoway.replace("November 17 2026", "November 24 2026")
    .replace("November 17, 2026 Planning Commission Packet", "Burn Ban Lifted");
  expect(await parseNottowayNews(notice, now)).toEqual([]);
  await expect(parseNottowayNews(replace("Burn Ban Applies Only on County Park Land"), now))
    .rejects.toThrow("unrecognized burn ban headline");
  await expect(parseNottowayNews(nottoway.replace("November 20 2026", "November 31 2026"), now))
    .rejects.toThrow("malformed news card");
});

test("Virginia local rules preserve jurisdiction and official links in the source registry", async () => {
  for (const { fips, source, parse } of local) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", recurring: true, coverage: "restrictions" });
    const rows = await parse();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toMatchObject({ status: "restricted", fips, scope: source.scope, officialUrl: source.officialUrl });
      expect(row.scopeNote).toBeTruthy();
    }
  }
  const hanover = local.find(({ id }) => id === "hanover-fall").parse;
  expect((await hanover(new Date("2026-10-15T19:59:59Z")))[0]).toMatchObject({
    fips: "51085", scope: "part", since: "2026-10-15", expires: "2026-12-15",
    validUntil: "2026-10-15T20:00:00.000Z",
  });
  expect(await hanover(new Date("2026-12-15T21:00:00Z"))).toEqual([]);
});

test("the local calendar verifier rejects changed or missing HTML and changed PDFs", async () => {
  const fairfax = local.find(({ id }) => id === "fairfax");
  const source = vaLocalCalendars.find(({ id }) => id === "fairfax");
  const changed = fairfax.fixture.toString().replace("Permit Required.", "Permit optional.");
  expect(changed).not.toBe(fairfax.fixture.toString());
  await expect(source.parse(new Response(changed), now)).rejects.toThrow("reviewed local burning rule changed");
  await expect(source.parse(new Response("<p>Permit Required.</p>"), now)).rejects.toThrow("Expected one reviewed HTML rule region");
  const stafford = vaLocalCalendars.find(({ id }) => id === "stafford");
  await expect(stafford.parse(new Response("%PDF-1.7\nother text"), now)).rejects.toThrow("reviewed local burning rule changed");
});

test("the county pass adds only verified bans and scoped or activity-specific restrictions", async () => {
  const baseline = [
    { source: vaShenandoahAlerts, rows: parseShenandoahAlerts(JSON.parse(read("shen-park-alerts-2026-11-24.json")), now), checked },
    { source: vaRapidanAlerts, rows: parseRapidanAlerts(await extractHtml(read("rapidan-wma-2026-11-24.html").toString()), now), checked },
  ];
  const previous = mergeSources(null, baseline, now).snapshot;
  const inputs = [
    ...baseline,
    { source: vaBrunswickBurnBan, rows: await parseBrunswickNotices(brunswick, now), checked },
    { source: vaNottowayBurnBan, rows: await parseNottowayNews(nottoway, now), checked },
  ];
  for (const { source, parse } of local) inputs.push({ source, rows: await parse(), checked });
  const { snapshot } = mergeSources(previous, inputs, now);
  const added = countiesInState("VA").map(({ fips }) => snapshot.counties[fips])
    .filter((row) => row && !previous.counties[row.fips]);
  expect(added.filter(({ status }) => status === "ban").map(({ county }) => county)).toEqual(["Brunswick County"]);
  expect(added.filter(({ status }) => status === "restricted")).toHaveLength(52);
  expect(added).toHaveLength(53);
  expect(snapshot.counties["51135"].status).toBe("restricted");
  expect(snapshot.counties["51135"].orders[0].status).toBe("ban");
  expect(snapshot.counties["51121"]).toMatchObject({ status: "restricted", scope: "part" });
  expect(snapshot.counties["51121"].orders[0].scopeNote).toBe("Town of Blacksburg");
  expect(snapshot.counties["51063"]).toBeUndefined();
});

test("each Virginia county fixture takes under 4 ms p95 thread CPU", async () => {
  const parsers = [
    ...local,
    { id: "brunswick", parse: () => parseBrunswickNotices(brunswick, now) },
    { id: "nottoway", parse: () => parseNottowayNews(nottoway, now) },
  ];
  for (const { id, parse } of parsers) {
    for (let index = 0; index < 10; index++) await parse();
    const samples = [];
    for (let index = 0; index < 40; index++) {
      const start = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    expect(samples.sort((left, right) => left - right)[37], id).toBeLessThan(4);
  }
});
