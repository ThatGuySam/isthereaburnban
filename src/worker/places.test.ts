// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { LookupError } from "./lookup";
import { matchPlace, placeKey, shardKey, type PlaceRow } from "./places";

const shard = (k: string) => JSON.parse(readFileSync(`public/data/places/${k}.json`, "utf8")) as PlaceRow[];

describe("city resolver", () => {
  test("Tulsa, OK resolves to its page and every county, Tulsa County first", () => {
    const m = matchPlace(shard(shardKey("Tulsa")), "Tulsa", "OK");
    expect(m.url).toBe("/us/ok/city/tulsa/");
    expect(m.counties[0]).toBe("40143");
    expect(m.counties.length).toBeGreaterThan(1);
  });

  test("case, punctuation, hyphens and Saint/St. all match", () => {
    expect(matchPlace(shard("o"), "oklahoma-city", "ok").name).toBe("Oklahoma City");
    expect(matchPlace(shard("s"), "Saint Louis", "MO").name).toBe("St. Louis");
    expect(placeKey("St. Louis")).toBe(placeKey("saint louis"));
  });

  test("a small town without a page points at its county page", () => {
    const m = matchPlace(shard("s"), "Sperry", "OK");
    expect(m.url).toBe("/us/ok/tulsa-county/");
    expect(m.counties[0]).toBe("40143");
  });

  test("a name shared by several states needs state=", () => {
    expect(() => matchPlace(shard("s"), "Springfield")).toThrow(LookupError);
    expect(matchPlace(shard("s"), "Springfield", "IL").counties).toEqual(["17167"]);
  });

  test("a name unique in the country works without state", () => {
    expect(matchPlace(shard("b"), "Broken Arrow", "OK").url).toBe("/us/ok/city/broken-arrow/");
  });

  test("unknown places and bad states are errors with a status code", () => {
    try {
      matchPlace(shard("x"), "Xyzzyville", "OK");
      throw new Error("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(LookupError);
      expect((e as LookupError).status).toBe(404);
    }
    expect(() => matchPlace(shard("t"), "Tulsa", "ZZ")).toThrow("2-letter");
  });
});

test("Shreveport shows both parish answers before the rest of the page and in text and JSON", async () => {
  const { default: worker } = await import("./index");
  const { SNAPSHOT_KEY } = await import("./env");
  const generated = new Date().toISOString();
  const county = (fips, status) => ({
    fips, state: "LA", county: fips === "22017" ? "Caddo Parish" : "Bossier Parish",
    status, label: status === "ban" ? "Parish burn ban" : "No parish burn ban reported",
    since: null, expires: null, sourceUpdated: null, checked: generated,
    sourceId: "la", sourceName: "Louisiana Department of Agriculture and Forestry",
    sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/",
  });
  const counties = { "22017": county("22017", "none"), "22015": county("22015", "ban") };
  const page = `<html data-city="Shreveport, LA" data-answer-fips="22017,22015" data-q="Is there a burn ban in Shreveport?">
    <head><title>Is there a burn ban in Shreveport?</title></head>
    <body><main data-hero><div data-status-slot data-fips="22017"></div></main><section>Other content</section></body></html>`;
  const env = {
    SITE_URL: "https://burn.example",
    KV: { get: async (key) => key === SNAPSHOT_KEY ? { version: 1, generated, changed: {}, sources: [], counties } : null },
    DB: { prepare: () => ({ first: async () => null }) },
    ASSETS: { fetch: async (request) => new URL(request.url).pathname.includes("/places/")
      ? Response.json(shard("s")) : new Response(page, { headers: { "content-type": "text/html" } }) },
  };
  const get = (path) => worker.fetch(new Request(`https://burn.example${path}`), env, {});
  const html = await (await get("/us/la/city/shreveport/")).text();
  const hero = html.split("</main>")[0];
  expect(hero).toContain(">Depends</p>");
  expect(hero).toContain("Depends on your county");
  for (const name of ["Caddo Parish", "Bossier Parish"]) expect(hero).toContain(name);
  expect(hero).toContain("https://www.shreveportla.gov/1100/Burn-Permit");
  const url = "/api/v1/status?city=Shreveport&state=LA";
  const json = await (await get(url)).json();
  expect(json.answer).toBe("depends");
  expect(json.results.map(({ status }) => status)).toEqual(["none", "ban"]);
  const text = await (await get(url + "&format=text")).text();
  expect(text.split("\n")[0]).toBe("Depends on your county.");
  expect(text).toContain("Nope: No parish burn ban reported");
  expect(text).toContain("Yes: Burn ban reported for Bossier Parish");
  const mcp = await worker.fetch(new Request("https://burn.example/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "burn.example" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "check_burn_ban", arguments: { city: "Shreveport", state: "LA" } } }),
  }), env, { waitUntil() {}, passThroughOnException() {} });
  const payload = await mcp.text();
  const data = payload.split("\n").find((line) => line.startsWith("data: "));
  const [summary, detail] = JSON.parse(data ? data.slice(6) : payload).result.content;
  expect(summary.text).toContain("Depends on your county.");
  expect(JSON.parse(detail.text)).toEqual(json);
});
