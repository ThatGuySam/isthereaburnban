// @ts-nocheck -- bun test types are not installed; this file runs under Bun.
import { expect, test } from "bun:test";
import { countyDecision } from "../../county-decision";
import { fluentBurnDecision } from "../lib/fluent-burn-permits";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { nhMunicipalStatus } from "./municipal-status";

const now = new Date("2026-11-26T13:08:00Z");
const load = (fixture) => Bun.file(new URL(`./fixtures/${fixture}`, import.meta.url)).text();
const banFixture = await Bun.file(new URL("../lib/fixtures/fluent-burn-permits-ban-2026-11-26.html", import.meta.url)).text();

test("the shared Fluent reader recognizes the vendor's public ban banner", async () => {
  const config = { title: "Yavapai County Burn Permits", openMessage: /Burning is permitted/ };
  expect(await fluentBurnDecision(banFixture, config)).toBe("ban");
  await expect(fluentBurnDecision(banFixture, { ...config, title: "Other town" })).rejects.toThrow("unexpected publisher");
});

for (const { source, parse, fixture } of nhMunicipalStatus) {
  test(`${source.id} uses a municipal report and leaves the county unconfirmed on a permissive day`, async () => {
    const html = await load(fixture);
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", reportingFips: ["33011"], scope: "part" });
    expect(await parse(html, now)).toEqual([]);
    const closed = html.replace(/(<h4[^>]*>)[^<]+/, "$1No open burning allowed.");
    const rows = await parse(closed, now);
    const [row] = rows;
    expect(row).toMatchObject({ status: "ban", fips: "33011", scope: "part", officialUrl: source.officialUrl, sourceUpdated: null });
    const { snapshot } = mergeSources(null, [{ source, rows, checked: now.toISOString() }], now);
    const stored = snapshot.counties[row.fips];
    expect(countyDecision(stored, now.getTime())).toMatchObject({ status: "restricted", scopedBan: true, orders: [expect.objectContaining({ status: "ban" })] });
    expect(countyDecision(stored, now.getTime() + source.staleMs).status).toBe("unknown");
    await expect(parse(html.replace(/<h4[^>]*>[^<]+/, "<h4>Burning could resume shortly"), now))
      .rejects.toThrow("unrecognized decision");
    await expect(parse(html.replace("</body>", '<div id="RiskLevelGauge"></div><h4>No open burning allowed.</h4></body>'), now))
      .rejects.toThrow("ambiguous decision");
  });
}
