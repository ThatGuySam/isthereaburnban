// @ts-nocheck -- bun test types aren't installed.
import { expect, test } from "bun:test";
import { initHero } from "./hero";

test("a remembered home place checks again without presenting an expired negative as current", async () => {
  const storage = new Map();
  const result = {
    fips: "40143", county: "Tulsa County", state: "OK", status: "none", label: "No ban reported",
    checked: "2020-01-01T19:07:00Z", since: null, expires: null, sourceUpdated: null,
    sourceName: "Oklahoma Forestry Services", sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/",
  };
  storage.set("itabb:place", JSON.stringify({ fips: result.fips, label: "Tulsa County, OK", html: "<p>Nope</p>", status: "none" }));
  storage.set("itabb:answer", JSON.stringify({ result, savedAt: 1, expiresAt: 2 }));
  const slot = { innerHTML: "<p>Nope</p>", dataset: {}, querySelectorAll: () => [] };
  const hero = {
    dataset: { mode: "home", state: "answer", status: "none" }, style: {},
    querySelector: (s) => s === "[data-status-slot]" ? slot : null, querySelectorAll: () => [],
  };
  const doc = Object.assign(new EventTarget(), {
    querySelector: (s) => s === "[data-hero]" ? hero : null,
    documentElement: { style: {} }, visibilityState: "visible",
  });
  const fetches = [];
  let recheck;
  const stubs = {
    document: doc, location: { search: "" },
    localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    fetch: (url) => new Promise((resolve, reject) => fetches.push({ url, resolve, reject })),
    setInterval: () => 1, setTimeout: (callback, delay) => { recheck = { callback, delay }; return 1; }, clearTimeout: () => {},
    addEventListener: () => {},
  };
  const previous = Object.fromEntries(Object.keys(stubs).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [key, value] of Object.entries(stubs)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    initHero();
    expect(fetches[0].url).toBe("/api/v1/status?fips=40143");
    expect(slot.innerHTML).toContain("Checking");
    expect(slot.innerHTML).not.toContain("Nope");

    fetches[0].reject(new Error("network down"));
    await Bun.sleep(1);
    expect(slot.innerHTML).toContain("Last known");
    expect(slot.innerHTML).toContain("Jan 1, 2020");
    expect(hero.dataset.status).toBe("unknown");

    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(fetches).toHaveLength(1);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(fetches).toHaveLength(2);
    expect(slot.innerHTML).toContain("Checking");
    fetches[1].resolve(Response.json({ results: [{ ...result, status: "ban", label: "County burn ban", checked: new Date().toISOString() }] }));
    await Bun.sleep(1);
    expect(hero.dataset.status).toBe("ban");
    const answer = JSON.parse(storage.get("itabb:answer"));
    expect(answer.expiresAt - answer.savedAt).toBeLessThanOrEqual(5 * 60_000);
    expect(JSON.parse(storage.get("itabb:place"))).toEqual({ fips: "40143", label: "Tulsa County, OK" });
    expect(recheck.delay).toBeLessThanOrEqual(2 * 60_000);
    recheck.callback();
    expect(fetches).toHaveLength(3);
    expect(hero.dataset.status).toBe("checking");
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
