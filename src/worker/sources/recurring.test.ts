// @ts-nocheck
import { expect, test } from "bun:test";
import { mergeSources } from "./merge";

const row = (status: "restricted" | "unknown") => ({
  fips: "39049", state: "OH", county: "Franklin County", status, label: "Daytime burning limits", since: null, expires: null,
  sourceUpdated: null, sourceName: "Ohio", sourceUrl: "x", officialUrl: "x", scope: "part" as const, sourceId: "oh-cal",
});

test("recurring calendar windows never create transitions or lastmod churn", () => {
  const src = (recurring: boolean) => ({ id: "oh-cal", state: "OH", mode: "positive-only" as const, scope: "part" as const, recurring });
  const t0 = new Date("2026-11-24T05:00:00Z"), t1 = new Date("2026-11-24T11:30:00Z");
  const first = mergeSources(null, [{ source: src(true), rows: [row("unknown")], checked: t0.toISOString() }], t0);
  const second = mergeSources(first.snapshot, [{ source: src(true), rows: [row("restricted")], checked: t1.toISOString() }], t1);
  expect(second.transitions).toHaveLength(0);
  expect(second.snapshot.changed["39049"]).toBe(first.snapshot.changed["39049"]);
  const control = mergeSources(first.snapshot, [{ source: src(false), rows: [row("restricted")], checked: t1.toISOString() }], t1);
  expect(control.transitions.length + Object.keys(control.snapshot.changed).length).toBeGreaterThan(0);
});
