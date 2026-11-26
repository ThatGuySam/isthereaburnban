// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { htmlStatusBulletin, namedStatusRows, scopedStatusBulletin } from "./county-bulletin";

const now = new Date("2026-11-26T16:00:00Z");
const publisher = {
  id: "test-local-bulletin", state: "WA", stack: "HTML", sourceName: "Local fire office",
  sourceUrl: "https://example.org/status", officialUrl: "https://example.org/burning",
  cadence: { kind: "hourly" }, staleMs: 7_200_000,
} as const;

test("a named status roster requires every publisher area and the expected value columns", () => {
  const roster = ["South", "North"];
  const open = ["North", "Open"];
  const closed = ["South", "Closed"];
  expect([...namedStatusRows([open, closed], roster, 2)]).toEqual([["North", ["Open"]], ["South", ["Closed"]]]);
  expect(() => namedStatusRows([open], roster, 2)).toThrow("Incomplete");
  expect(() => namedStatusRows([open, open], roster, 2)).toThrow("Unexpected status row");
  expect(() => namedStatusRows([open, ["East", "Closed"]], roster, 2)).toThrow("Unexpected status row");
  expect(() => namedStatusRows([open, ["South", ""]], roster, 2)).toThrow("Unexpected status row");
  expect(() => namedStatusRows([open, ["South", "Closed", "Open"]], roster, 2)).toThrow("Unexpected status row");
});

test("a scoped bulletin reports only its mapped counties and preserves per-area human links", async () => {
  const bulletin = scopedStatusBulletin({
    ...publisher, counties: ["Pierce", "Kitsap"],
    async read(input) {
      return [{
        county: await input.text(), scopeNote: "District 1", officialUrl: "https://example.org/district/1",
        status: "restricted", label: "Burn permits suspended", note: "Check the district notice.",
      }];
    },
  });
  expect(bulletin.source).toMatchObject({
    mode: "positive-only", scope: "part", reportingFips: ["53053", "53035"], keepRowLinks: true,
  });
  expect(await bulletin.parse(new Response("Kitsap"), now)).toEqual([expect.objectContaining({
    fips: "53035", county: "Kitsap County", checked: now.toISOString(), scope: "part", scopeNote: "District 1",
    officialUrl: "https://example.org/district/1", status: "restricted",
  })]);
  await expect(bulletin.parse(new Response("King"), now)).rejects.toThrow("unexpected county");
});

test("an HTML bulletin resolves one explicit decision from its scoped panel", async () => {
  const bulletin = htmlStatusBulletin({
    ...publisher, county: "Pierce", scopeNote: "District 1", section: "#status", blocks: "p",
    decisions: [
      [/^No current ban$/m],
      [/^Outdoor fires prohibited$/m, { status: "ban", label: "Outdoor fires prohibited", note: "Check the district." }],
    ],
  });
  const parse = (text: string) => bulletin.parse(new Response(`<main><p>Outdoor fires prohibited</p><div id="status">${text}</div></main>`), now);
  expect(await parse("<p>No current ban</p>")).toEqual([]);
  expect(await parse("<p>Outdoor fires prohibited</p>")).toEqual([expect.objectContaining({ status: "ban", scope: "part" })]);
  await expect(parse("<p>Could close later</p>")).rejects.toThrow("Unrecognized");
  await expect(parse("<p>No current ban</p><p>Outdoor fires prohibited</p>")).rejects.toThrow("Ambiguous");
});
