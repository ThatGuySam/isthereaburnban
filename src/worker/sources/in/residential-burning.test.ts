// @ts-nocheck -- bun test types aren't installed.
import { expect, test } from "bun:test";
import { parseMiamiDadeResidentialBurning } from "../fl/miami-dade-burning";
import { parseIdemResidentialBurning } from "./residential-burning";

const at = new Date("2026-11-24T15:00:00Z");

test("IDEM lists a standing residential restriction in exactly four counties", async () => {
  const html = `<h3>Residential Open Burning</h3>
    <p>Residential open burning is the burning of leaves, brush, paper, and other clean wood waste in a burn barrel at a private residence.</p>
    <ul><li>In Clark, Floyd, Lake, or Porter counties due to federal requirements for controlling ground-level ozone pollution.</li></ul>`;
  const rows = await parseIdemResidentialBurning(html, at);
  expect(rows.map(({ fips }) => fips)).toEqual(["18019", "18043", "18089", "18127"]);
  for (const row of rows) expect(row).toMatchObject({ scope: "county", status: "restricted", standing: true, since: null });
  await expect(parseIdemResidentialBurning(html.replace("Floyd, ", ""), at)).rejects.toThrow("guidance changed");
});

test("Miami-Dade Fire Rescue guidance covers residential yard debris", async () => {
  const html = "<p>Residential property owners are prohibited from burning residential trash, garbage, construction debris, leaves, cuttings, yard trimmings, tree stumps, plastic, and pallets.</p>";
  const [row] = await parseMiamiDadeResidentialBurning(html, at);
  expect(row).toMatchObject({ fips: "12086", status: "restricted", standing: true, scopeNote: "Residential yard debris burning" });
  await expect(parseMiamiDadeResidentialBurning("<h1>Open Burn Permit</h1>", at)).rejects.toThrow("guidance changed");
});
