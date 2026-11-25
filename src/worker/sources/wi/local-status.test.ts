// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { wiLocalStatuses } from "./local-status";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const captured = new Date("2026-11-25T06:00:00Z");
const checked = captured.toISOString();
const burlington = fixture("burlington-fire");
const somerset = fixture("somerset-permits");
const [town, district] = wiLocalStatuses;
const burlingtonBan = burlington.replace('<span style="text-decoration: underline;">no</span>', "a");
const somersetBan = somerset.replace("ae-visibility-hidden ", "")
  .replace('class="has_ae_slider elementor-section elementor-inner-section elementor-element elementor-element-db31733',
    'class="ae-visibility-hidden has_ae_slider elementor-section elementor-inner-section elementor-element elementor-element-db31733');

test("local status panels report no county decision when the explicit town or district flag is clear", async () => {
  for (const [adapter, html] of [[town, burlington], [district, somerset]]) {
    expect(adapter.source.mode).toBe("positive-only");
    const rows = await adapter.parse(new Response(html), captured);
    expect(rows).toEqual([]);
    const { snapshot } = mergeSources(null, [{ source: adapter.source, rows, checked }], captured);
    expect(statusFor(snapshot, adapter.source.reportingFips[0], captured.getTime()).status).toBe("unknown");
  }
});

test("local bans reach the map as scoped restrictions and expire after missed checks", async () => {
  for (const [adapter, html, fips, scopeNote] of [
    [town, burlingtonBan, "55101", "Town of Burlington"],
    [district, somersetBan, "55109", "Town and Village of Somerset"],
  ]) {
    const rows = await adapter.parse(html, captured);
    expect(rows).toMatchObject([{ fips, status: "ban", scope: "part", scopeNote, sourceUpdated: null }]);
    const { snapshot } = mergeSources(null, [{ source: adapter.source, rows, checked }], captured);
    expect(statusFor(snapshot, fips, captured.getTime())).toMatchObject({
      status: "restricted", scopedBan: true, orders: [{ status: "ban", scopeNote, officialUrl: adapter.source.officialUrl }],
    });
    expect(statusFor(snapshot, fips, captured.getTime() + adapter.source.staleMs).status).toBe("unknown");
  }
});

test("a changed, missing or ambiguous status panel fails closed", async () => {
  await expect(town.parse(burlington.replace("There is currently", "There was once"), captured)).rejects.toThrow("Unrecognized");
  await expect(town.parse("<h2>Burn Ban</h2>", captured)).rejects.toThrow("one status section");
  await expect(district.parse(somerset.replace("ae-visibility-hidden ", ""), captured)).rejects.toThrow("one status section");
  await expect(district.parse(somersetBan.replace("Commercial agricultural burning", "All campfires"), captured)).rejects.toThrow("Unrecognized");
});

test("local status fixture parsers stay below 5 ms p95", async () => {
  for (const [adapter, html] of [[town, burlington], [district, somerset]]) {
    for (let i = 0; i < 15; i++) await adapter.parse(html, captured);
    const samples = [];
    for (let i = 0; i < 75; i++) {
      const start = performance.now();
      await adapter.parse(html, captured);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    expect(samples[71]).toBeLessThan(5);
  }
});
