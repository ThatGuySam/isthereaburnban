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
