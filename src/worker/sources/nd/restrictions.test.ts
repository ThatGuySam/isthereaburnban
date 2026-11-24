// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { ndDesRestrictions, parseNdRestrictions } from "./restrictions";

const read = (name) => Bun.file(new URL(`./fixtures/${name}-2026-11-24.json`, import.meta.url)).text();
const [declarationsBody, ratingsBody] = await Promise.all([read("restrictions"), read("fire-danger")]);
const declarations = JSON.parse(declarationsBody);
const ratings = JSON.parse(ratingsBody);
const captured = new Date("2026-11-24T10:06:16Z");
const query = (...rows) => ({ features: rows.map((attributes) => ({ attributes })) });
const lookup = (county, ratingCounty = county.replace(/ County$/, "")) =>
  declarations.features.find(({ attributes }) => attributes.county === county && attributes.FDR_COUNTY === ratingCounty).attributes;
const rating = (county, FireIndex, DatePublished = Date.parse("2026-11-24T03:30:00Z")) => {
  const { fips } = countiesInState("ND").find(({ name }) => name === county);
  return { CNTY_FIPS: fips.slice(2), DatePublished, FireIndex };
};
const parse = (rows, ...daily) => parseNdRestrictions(query(...rows), query(...daily), captured);
const cass = lookup("Cass County");
const eddy = lookup("Eddy County");

test("today's DES map supports scoped restrictions and keeps the remaining counties unknown", () => {
  const rows = parseNdRestrictions(declarations, ratings, captured);
  expect(rows.map(({ county }) => county).sort()).toEqual([
    "Adams", "Billings", "Burke", "Dickey", "Divide", "Dunn", "Golden Valley", "Grant", "Hettinger", "Kidder", "McIntosh",
    "McKenzie", "Mercer", "Mountrail", "Nelson", "Oliver", "Ramsey", "Sheridan", "Sioux", "Slope", "Stark", "Ward",
  ].map((name) => `${name} County`));
  expect(rows.every(({ status, scope }) => status === "restricted" && scope === "part")).toBe(true);
  const { snapshot } = mergeSources(null, [{ source: ndDesRestrictions, rows, checked: captured.toISOString() }], captured);
  expect(countiesInState("ND").filter(({ fips }) => statusFor(snapshot, fips).status === "unknown")).toHaveLength(31);
  expect(statusFor(snapshot, "38017").status).toBe("unknown");
  expect(rows.find(({ county }) => county === "McKenzie County")).toMatchObject({
    label: "Open burning ban", note: expect.stringContaining("propane, gas and electric grills"),
  });
  expect(rows.find(({ county }) => county === "Mercer County").note).toContain("contacting the local jurisdiction before large burns");
  expect(rows.find(({ county }) => county === "Mercer County").note).not.toContain("agricultural burning");
  expect(rows.find(({ county }) => county === "Sioux County").note).toContain("local fire authority approval");
  expect(rows.some(({ county }) => county === "McLean County")).toBe(false);
});

test("an activity triggers only at its threshold and the rating must be today's issued decision", () => {
  expect(parse([cass], rating("Cass County", 2))).toEqual([]);
  expect(parse([cass], rating("Cass County", 6))).toEqual([]);
  expect(parse([cass], rating("Cass County", 3, Date.parse("2026-11-23T04:16:00Z")))).toEqual([]);
  expect(parse([cass], rating("Cass County", 3, Date.parse("2026-11-24T05:00:00Z")))).toEqual([]);
  expect(parse([cass], rating("Cass County", 3))[0]).toMatchObject({
    status: "restricted", note: expect.stringContaining("campfires, controlled burns, agricultural burning"),
    sourceUpdated: expect.stringMatching(/^2026-11-24T09:45:/),
  });
  expect(parse([{ ...cass, campfires_conditions: "Unsafe" }], rating("Cass County", 3))[0].note).not.toContain("campfires");
});

test("expired, future, lifted and unrecognized declarations cannot activate a condition", () => {
  const current = rating("Cass County", 3);
  const changes = [
    { declaration_status: "No" }, { declaration_status: "Unknown" }, { declaration_rescinded: "Yes,No" },
    { declaration_date_new: Date.parse("2026-11-24T05:00:00Z") },
    { rescinded_date_new: Date.parse("2026-11-24T03:00:00Z") },
    { burn_expiration_date: Date.parse("2026-11-24T10:00:00Z") }, { burn_expiration_date: "bad date" },
  ];
  for (const change of changes) expect(parse([{ ...cass, ...change }], current)).toEqual([]);
  const expires = Date.parse("2026-11-24T10:20:00Z");
  expect(parse([{ ...cass, burn_expiration_date: expires }], current)[0]).toMatchObject({
    expires: "2026-11-24T10:20:00.000Z", validUntil: "2026-11-24T10:20:00.000Z",
  });
});

test("a dated warning activates selected activities only while it is in force", () => {
  const warning = {
    RFW_Status: "RFW", rfw_effective_Date: "2026-11-24T04:00:00-06:00",
    rfw_expiration_date: "2026-11-24T04:30:00-06:00",
  };
  const low = rating("Eddy County", 2);
  expect(parse([{ ...eddy, ...warning }], low)[0]).toMatchObject({
    status: "restricted", label: expect.stringContaining("Red Flag Warning"),
    validUntil: "2026-11-24T10:30:00.000Z",
  });
  expect(parse([{ ...eddy, ...warning, rfw_effective_Date: "2026-11-24T04:20:00-06:00" }], low)).toEqual([]);
  expect(parse([{ ...eddy, ...warning, rfw_expiration_date: "2026-11-24T04:01:00-06:00" }], low)).toEqual([]);
  expect(parse([{ ...eddy, ...warning, rfw_expiration_date: null }], low)).toEqual([]);
  expect(parse([{ ...eddy, ...warning, declaration_status: "No" }], low)).toEqual([]);
  expect(parse([{ ...cass, ...warning }], rating("Cass County", 2))).toEqual([]); // Existing NWS rule owns this signed edition.
});

test("tribal and BLM rules remain scoped to their lands with no countywide inference", () => {
  const bowman = lookup("Bowman County");
  const blm = lookup("BLM Lands within Bowman County", "Bowman");
  const benson = lookup("Benson County");
  const spirit = lookup("Spirit Lake Sioux", "Benson");
  const rows = parse([bowman, blm, benson, spirit], rating("Bowman County", 3), rating("Benson County", 3));
  expect(rows).toEqual([
    expect.objectContaining({ county: "Bowman County", scope: "part", scopeNote: "BLM-managed lands in Bowman County" }),
    expect.objectContaining({ county: "Benson County", scope: "part", scopeNote: "Spirit Lake Sioux jurisdiction within Benson County" }),
  ]);
  expect(parse([lookup("Dunn County"), lookup("USFS Little Missouri National Grassland McKenzie Dist", "Dunn")],
    rating("Dunn County", 3))).toHaveLength(1);
});

test("state air-quality code activates only on a documented Extreme day", () => {
  const griggs = lookup("Griggs County");
  expect(parse([griggs], rating("Griggs County", 4))).toEqual([]);
  expect(parse([griggs], rating("Griggs County", 5))).toEqual([
    expect.objectContaining({ scope: "part", status: "restricted", officialUrl: expect.stringContaining("33.1-15-04") }),
  ]);
  const divide = parse([lookup("Divide County")], rating("Divide County", 5));
  expect(divide).toHaveLength(1);
  expect(divide[0].note).toContain("district fire chief approval");
  expect(divide[0].note).not.toContain("campfires");
});

test("stale, changed, duplicate or truncated feeds fail the refresh", () => {
  expect(() => parseNdRestrictions(declarations, ratings, new Date("2026-11-24T13:00:00Z"))).toThrow("stale");
  expect(() => parse([{ ...cass, Script_Update_Date: "bad date" }], rating("Cass County", 3))).toThrow("stale");
  const { campfires_conditions: _, ...changed } = cass;
  expect(() => parse([changed], rating("Cass County", 3))).toThrow("fields changed");
  expect(() => parse([cass, cass], rating("Cass County", 3))).toThrow("duplicate");
  expect(() => parseNdRestrictions({ ...declarations, exceededTransferLimit: true }, ratings, captured)).toThrow("Incomplete");
  expect(() => parseNdRestrictions(declarations, { ...ratings, exceededTransferLimit: true }, captured)).toThrow("Incomplete");
});

test("ND fixture decoding and parsing stay below 5 ms at p95", () => {
  const parseFixture = () => parseNdRestrictions(JSON.parse(declarationsBody), JSON.parse(ratingsBody), captured);
  for (let i = 0; i < 20; i++) parseFixture();
  const timings = Array.from({ length: 60 }, () => {
    const start = performance.now();
    parseFixture();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(5);
});
