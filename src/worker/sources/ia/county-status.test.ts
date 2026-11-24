// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ia, parse as parseState } from "../../adapters/ia";
import { civicPlusActiveAlerts } from "../lib/civicplus";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { cedar, decatur, iaCountyBulletins, mills, pottawattamie } from "./county-status";

const now = new Date("2026-11-24T22:56:00Z");
const checked = now.toISOString();
const fixture = (county: string) => readFileSync(new URL(`./fixtures/${county}-2026-11-24.html`, import.meta.url), "utf8");
const evidence = new Map([
  [cedar, fixture("cedar")], [decatur, fixture("decatur")],
  [mills, fixture("mills")], [pottawattamie, fixture("pottawattamie")],
]);

test("Iowa's state layer requires a positive flag and never supplies an all-clear for null or missing counties", () => {
  const sample = JSON.parse(readFileSync(new URL("../../adapters/fixtures/ia.json", import.meta.url), "utf8"));
  sample.features.shift();
  const rows = parseState(sample, checked);
  const { snapshot } = mergeSources(null, [{ source: ia, rows, checked }], now);
  expect(ia.mode).toBe("positive-only");
  expect(snapshot.counties["19001"]).toBeUndefined();
  expect(snapshot.counties["19003"]?.status).toBe("unknown");
  expect(rows.every(({ status }) => status === "unknown")).toBe(true);
});

test("the four current county bulletins report explicit countywide negatives", async () => {
  for (const bulletin of iaCountyBulletins) {
    expect(SOURCES).toContain(bulletin.source);
    expect(bulletin.source.mode).toBe("full");
    expect(await bulletin.parse(evidence.get(bulletin), now)).toEqual([expect.objectContaining({
      state: "IA", scope: "county", status: "none", label: "No countywide burn ban reported", since: null,
      officialUrl: expect.stringContaining(new URL(bulletin.source.officialUrl).hostname),
    })]);
  }
});

test("Cedar requires a matching banner and an effective decision naming the county", async () => {
  const html = evidence.get(cedar);
  const order = html.replaceAll("No Burn Ban in Effect", "Burn Ban in Effect")
    .replace("there is no burn ban in place", "there is a burn ban in place");
  expect((await cedar.parse(order, now))[0]).toMatchObject({ status: "ban", since: "2026-03-06" });
  expect((await cedar.parse(order.replace("3/6/26", "12/6/26"), now))[0].status).toBe("unknown");
  expect((await cedar.parse(html.replace("there is no burn ban in place for Cedar County", "see your fire district"), now))[0].status).toBe("unknown");
  await expect(cedar.parse(html.replace('id="burnBanNotes"', 'id="rules"'), now)).rejects.toThrow("banner");
});

test("Decatur requires a countywide issuance or an explicit lift with valid chronology", async () => {
  const html = evidence.get(decatur);
  const withoutLift = html.replace("LIFTED:", "REMINDER:");
  expect((await decatur.parse(withoutLift, now))[0].status).toBe("unknown");
  expect((await decatur.parse(html.replace("3/3/2026", "1/3/2026"), now))[0].status).toBe("unknown");
  const issued = html.replace(/REQUESTED:.*?LIFTED: 3\/3\/2026(?:&nbsp;|\s)*2PM/s,
    "EFFECTIVE: 3/3/2026 2PM FOR ALL OF DECATUR COUNTY");
  expect((await decatur.parse(issued, now))[0]).toMatchObject({ status: "ban", since: "2026-03-03" });
});

test("CivicEngage reads the displayed posting time and archives leave Mills unconfirmed", async () => {
  const html = evidence.get(mills);
  expect(await civicPlusActiveAlerts(html, mills.source.sourceUrl)).toEqual([expect.objectContaining({
    title: "***Burn Ban Lifted***", published: "April 2, 2026 3:37 PM",
  })]);
  expect((await mills.parse(html, now))[0]).toMatchObject({
    fips: "19129", sourceUpdated: "2026-04-02T20:37:00.000Z",
    officialUrl: "https://www.millscountyiowa.gov/AlertCenter.aspx?AID=Burn-Ban-Lifted-49",
  });
  expect((await mills.parse(html.replace("alert on noBorder", "alert off noBorder"), now))[0].status).toBe("unknown");
  expect((await mills.parse(html.replace("April 2, 2026 3:37 PM", "April 2, 2027 3:37 PM"), now))[0].status).toBe("unknown");
});

test("Pottawattamie explicitly distinguishes countywide and partial coverage", async () => {
  const html = evidence.get(pottawattamie);
  const active = html.replace("There are currently no fire restrictions at this time.",
    "An open burning ban is in effect throughout Pottawattamie County.");
  expect((await pottawattamie.parse(active, now))[0].status).toBe("ban");
  expect((await pottawattamie.parse(active.replace("throughout Pottawattamie County", "for the Walnut Fire District"), now))[0].status).toBe("unknown");
  await expect(pottawattamie.parse(html + html, now)).rejects.toThrow("panel");
});

test("Iowa county bulletin fixture parsers are well below the Worker CPU budget", async () => {
  for (const [bulletin, html] of evidence) {
    await bulletin.parse(html, now);
    const samples: number[] = [];
    for (let i = 0; i < 40; i++) {
      const start = process.cpuUsage();
      await bulletin.parse(html, now);
      const { user, system } = process.cpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[37]).toBeLessThan(5);
  }
});
