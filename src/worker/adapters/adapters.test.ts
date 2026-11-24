// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseOk, classify as okClassify } from "./ok";
import { parse as parseTx, parseTxt } from "./tx";
import { parse as parseFl } from "./fl";
import { parse as parseIn } from "./in";
import { parse as parseLa } from "./la";
import { parse as parseMs, msDate, msEditionIds } from "./ms";
import { parse as parseIa } from "./ia";
import { withCurrentLinks } from "../source-links";
import type { CountyStatus } from "../../shared/types";

const fx = (name: string) => JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"));
const msIds = msEditionIds(readFileSync(join(import.meta.dir, "fixtures", "ms-edition.html"), "utf8"));
const checked = "2026-11-23T19:07:00.000Z";
const count = (rows: CountyStatus[], s: string) => rows.filter((r) => r.status === s).length;
const fips = (rows: CountyStatus[]) => new Set(rows.map((r) => r.fips));

describe("OK", () => {
  const rows = parseOk(fx("ok.json"), checked);
  test("maps all 77 counties", () => {
    expect(fips(rows).size).toBe(77);
    expect(rows.every((r) => r.fips.startsWith("40") && r.checked === checked)).toBe(true);
  });
  test("statuses", () => {
    expect(count(rows, "ban")).toBe(1);
    expect(count(rows, "none")).toBe(76);
    expect(okClassify("Ozone Alert").status).toBe("restricted");
    expect(okClassify("Governor's Burn Ban").status).toBe("ban");
    expect(okClassify("County Burn Ban and Ozone Alert").status).toBe("unknown");
    expect(okClassify("").status).toBe("unknown");
  });
});

describe("TX", () => {
  const rows = parseTx(fx("tx.json"), checked);
  test("maps 254 counties by FIPS", () => {
    expect(fips(rows).size).toBe(254);
    expect(rows.find((r) => r.fips === "48009")?.county).toBe("Archer County");
  });
  test("82 bans with start dates", () => {
    expect(count(rows, "ban")).toBe(82);
    expect(rows.filter((r) => r.status === "ban").every((r) => r.since)).toBe(true);
  });
  test("txt fallback agrees with FeatureServer", () => {
    const buf = readFileSync(join(import.meta.dir, "fixtures", "tx.txt"));
    const txt = parseTxt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), checked);
    expect(txt.length).toBe(254);
    expect(count(txt, "ban")).toBe(82);
    const fsBans = new Set(rows.filter((r) => r.status === "ban").map((r) => r.fips));
    expect(txt.filter((r) => r.status === "ban").every((r) => fsBans.has(r.fips))).toBe(true);
    expect(txt[0].sourceUpdated).toBe("2026-11-23T16:52:12.000Z");
    const { counties } = withCurrentLinks({ counties: { [txt[0].fips]: txt[0] } });
    expect(counties[txt[0].fips].officialUrl).toMatch(/\/BURNBAN\.txt$/);
    expect(counties[txt[0].fips].sourceUrl).toBe(counties[txt[0].fips].officialUrl);
  });
});

describe("FL", () => {
  const rows = parseFl(fx("fl.json"), checked);
  test("maps 67 counties incl. Dade and DeSoto", () => {
    expect(fips(rows).size).toBe(67);
    expect(fips(rows).has("12086")).toBe(true);
    expect(fips(rows).has("12027")).toBe(true);
  });
  test("yard debris is restricted, not ban", () => {
    expect(count(rows, "restricted")).toBe(4);
    expect(count(rows, "none")).toBe(63);
  });
});

describe("IN", () => {
  const rows = parseIn(fx("in.json"), checked);
  test("maps 92 counties and skips Pokagon Band", () => {
    expect(fips(rows).size).toBe(92);
    expect(count(rows, "ban")).toBe(1);
    expect(count(rows, "none")).toBe(91);
  });
});

describe("LA", () => {
  const rows = parseLa(fx("la.json"), checked);
  test("maps 64 parishes", () => {
    expect(fips(rows).size).toBe(64);
    expect(count(rows, "ban")).toBe(27);
    expect(count(rows, "none")).toBe(35);
    expect(count(rows, "unknown")).toBe(2); // null field never becomes "none"
  });
});

describe("MS", () => {
  test("dates", () => {
    expect(msDate("9/16/26")).toBe("2026-09-16");
    expect(msDate("1214/26")).toBeNull();
    expect(msDate("2/29/26")).toBeNull();
  });
  test("listed counties are bans, rest none, expired dropped", () => {
    const rows = parseMs(fx("ms.json"), checked, msIds);
    expect(rows.length).toBe(82);
    expect(count(rows, "ban")).toBe(49);
    const harrison = rows.find((r) => r.county === "Harrison County");
    expect(harrison?.status).toBe("ban"); // expires today: still active
    expect(harrison?.expires).toBe("2026-11-23");
    expect(harrison?.validUntil).toBe("2026-11-24T06:00:00.000Z");
    const later = parseMs(fx("ms.json"), "2026-11-24T06:00:00.000Z", msIds);
    expect(later.find((r) => r.county === "Harrison County")?.status).toBe("none");
    expect(rows.find((r) => r.county === "Humphreys County")?.note).toContain("1-5");
  });
});

describe("IA (positive-only)", () => {
  test("null rows are unknown, never none", () => {
    const rows = parseIa(fx("ia.json"), checked);
    expect(fips(rows).size).toBe(99);
    expect(count(rows, "none")).toBe(0);
    expect(count(rows, "unknown")).toBe(99);
  });
  test("yes rows are bans and link the proclamation", () => {
    const j = fx("ia.json");
    j.features[0].attributes.Active_Burn_Ban = "yes";
    j.features[0].attributes.proc_url = "https://example.gov/proc.pdf";
    j.features[1].attributes.Active_Burn_Ban = "lift";
    const rows = parseIa(j, checked);
    expect(rows[0]).toMatchObject({ fips: "19001", status: "ban", officialUrl: "https://example.gov/proc.pdf" });
    expect(rows[1].status).toBe("unknown");
  });
});

test("Indiana local orders retain their limited scope and do not use a report timestamp as an effective date", () => {
  const j = fx("in.json");
  const record = j.features.find(({ attributes }) => attributes.orginating_county === "Sullivan");
  record.attributes.countyburnbanstatus = "Local Burn Ban";
  const rows = parseIn(j, checked);
  expect(rows.find((r) => r.fips === "18153")).toMatchObject({ status: "restricted", scope: "part", scopedBan: true,
    scopeNote: expect.stringContaining("part of"), since: null, sourceUpdated: expect.any(String) });
  record.attributes.countyburnbanstatus = "No open burning allowed";
  expect(() => parseIn(j, checked)).toThrow(/unrecognized/);
});

test("unrecognized publisher codes remain unknown", () => {
  expect(okClassify("No Burn Ban").status).toBe("unknown");
  expect(okClassify("County Burn Ban Lifted").status).toBe("unknown");
});

for (const [key, parse] of [["tx", parseTx], ["ok", parseOk], ["fl", parseFl], ["la", parseLa], ["in", parseIn]]) {
  test(`${key} rejects incomplete, truncated, or duplicate editions`, () => {
    const complete = fx(`${key}.json`);
    const [, ...features] = complete.features;
    expect(() => parse({ ...complete, features }, checked)).toThrow(/missing/i);
    expect(() => parse({ ...complete, exceededTransferLimit: true }, checked)).toThrow(/Incomplete ArcGIS/);
    expect(() => parse({ ...complete, features: [...complete.features, complete.features[0]] }, checked)).toThrow(/duplicate/i);
  });
}

test("TX rejects a name paired with the wrong FIPS", () => {
  const data = fx("tx.json");
  data.features[0].attributes.County = "Travis";
  expect(() => parseTx(data, checked)).toThrow(/does not match/);
});

test("TX text rejects stale bulletins and duplicate entries", () => {
  const encode = (value) => Buffer.from(value, "utf16le");
  expect(() => parseTxt(encode("0 Texas Burn Bans - 11/23/2020 10:52:12 AM"), checked)).toThrow(/stale/);
  expect(() => parseTxt(encode("1 Texas Burn Bans - 11/23/2026 10:52:12 AM\nArcher\nArcher"), checked)).toThrow(/duplicate/);
});

test("MS rejects an empty, renamed, or duplicate list", () => {
  const rows = fx("ms.json");
  expect(() => parseMs([], checked, msIds)).toThrow(/empty/i);
  expect(() => parseMs([{ value: { county: "Hinds" } }], checked, msIds)).toThrow(/schema/i);
  expect(() => parseMs([...rows, rows[0]], checked, msIds)).toThrow(/duplicate/i);
  expect(() => parseMs(rows.slice(1), checked, msIds)).toThrow(/incomplete/i);
  expect(() => msEditionIds('<table id="footable_1776"></table>')).toThrow(/identity/i);
  expect(() => msEditionIds('<table id="footable_1775"></table><style id="ninja_table_custom_css_1775"></style>')).toThrow(/empty/i);
});

test("MS gates future orders and flags malformed publisher dates", () => {
  const rows = fx("ms.json");
  const hinds = rows.find((row) => row.value.counties === "Hinds");
  hinds.value.issued = "11/25/26";
  const reports = parseMs(rows, checked, msIds);
  expect(reports.find((row) => row.fips === "28049")).toMatchObject({ validFrom: "2026-11-25T06:00:00.000Z" });
  expect(reports.find((row) => row.fips === "28077")).toMatchObject({ expires: null, note: expect.stringContaining("1214/26") });
});
