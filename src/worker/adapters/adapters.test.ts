// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseOk, classify as okClassify } from "./ok";
import { parse as parseTx, parseTxt } from "./tx";
import { parse as parseFl } from "./fl";
import { parse as parseIn } from "./in";
import { parse as parseLa } from "./la";
import { parse as parseMs, msDate } from "./ms";
import { parse as parseIa } from "./ia";
import type { CountyStatus } from "../../shared/types";

const fx = (name: string) => JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"));
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
    expect(okClassify("County Burn Ban and Ozone Alert").status).toBe("ban");
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
  });
  test("listed counties are bans, rest none, expired dropped", () => {
    const rows = parseMs(fx("ms.json"), checked, "2026-11-23");
    expect(rows.length).toBe(82);
    expect(count(rows, "ban")).toBe(49);
    const harrison = rows.find((r) => r.county === "Harrison County");
    expect(harrison?.status).toBe("ban"); // expires today: still active
    expect(harrison?.expires).toBe("2026-11-23");
    const later = parseMs(fx("ms.json"), checked, "2026-11-24");
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
