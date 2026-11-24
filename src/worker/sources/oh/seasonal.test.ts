// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { parseHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { ohSeasonal, parseOhioSeasonal } from "./seasonal";

const fixture = readFileSync(new URL("./fixtures/section-1503.18-2026-11-24.html", import.meta.url), "utf8");
const captured = new Date("2026-11-24T05:45:33Z");
const parse = (now = captured, html = fixture) => parseOhioSeasonal(parseHtml(html), now);

test("the official Ohio statute maps only the covered areas of all 88 counties", async () => {
  const rows = await parse();
  expect(rows).toHaveLength(88);
  expect(rows.map(({ fips }) => fips).sort()).toEqual(countiesInState("OH").map(({ fips }) => fips).sort());
  for (const row of rows) {
    expect(row).toMatchObject({
      status: "restricted", scope: "part", scopeNote: "Unincorporated areas outside railroad-controlled land",
      validFrom: "2026-11-24T11:00:00.000Z", validUntil: "2026-11-24T23:00:00.000Z",
      checked: captured.toISOString(), sourceUpdated: null, since: null, expires: null,
    });
  }

  const at = (time: string) => {
    const source = { source: ohSeasonal, rows, checked: captured.toISOString() };
    return mergeSources(null, [source], new Date(time)).snapshot;
  };
  expect(at("2026-11-24T10:59:59Z").counties["39049"]).toMatchObject({
    status: "unknown", note: expect.stringContaining("Upcoming"), orders: [{ status: "restricted", scope: "part" }],
  });
  const daytime = at("2026-11-24T11:00:00Z");
  expect(Object.values(daytime.counties).filter(({ status }) => status === "restricted")).toHaveLength(88);
  expect(daytime.sources[0]).toMatchObject({ mode: "positive-only", scope: "part", counties: 88, bans: 0 });
  expect(Object.keys(at("2026-11-24T23:00:00Z").counties)).toHaveLength(0);
});

test("Ohio uses Eastern daylight time when applicable and omits inactive dates and elapsed windows", async () => {
  const rows = await parse(new Date("2026-05-31T12:00:00Z"));
  expect(rows).toHaveLength(88);
  for (const row of rows) {
    expect(row).toMatchObject({ validFrom: "2026-05-31T10:00:00.000Z", validUntil: "2026-05-31T22:00:00.000Z" });
  }
  for (const time of ["2026-06-01T04:00:00Z", "2026-09-30T12:00:00Z", "2026-11-24T23:00:00Z", "2026-12-01T05:00:00Z"]) {
    expect(await parse(new Date(time))).toEqual([]);
  }
});

test("an unrecognized text, an altered emergency authority or a missing section fails closed", async () => {
  const changed = [
    fixture.replace("six a.m. and six p.m.", "dawn and dusk"),
    fixture.replace("executive order of the governor", "order of the county"),
    fixture.replace("Kindled fires.", "Different section."),
  ];
  for (const html of changed) await expect(parse(captured, html)).rejects.toThrow("expected (C) and (D) text changed or missing");
});

test("Ohio parses its real statute fixture well within the Worker CPU budget", async () => {
  for (let i = 0; i < 20; i++) await parse();
  const samples: number[] = [];
  for (let i = 0; i < 120; i++) {
    const start = performance.now();
    await parse();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  expect(samples[113]).toBeLessThan(5);
});
