// @ts-nocheck -- bun test types aren't installed.
import { expect, test } from "bun:test";
import { countyByName, resolveCountyName } from "./counties";

test("county equivalents preserve independent city jurisdictions", () => {
  for (const [state, city, cityFips, countyFips] of [
    ["VA", "Fairfax", "51600", "51059"], ["VA", "Richmond", "51760", "51159"],
    ["VA", "Roanoke", "51770", "51161"], ["MO", "St. Louis", "29510", "29189"], ["MD", "Baltimore", "24510", "24005"],
  ]) {
    expect(countyByName(state, `${city} city`)?.fips).toBe(cityFips);
    expect(countyByName(state, `City of ${city}`)?.fips).toBe(cityFips);
    expect(countyByName(state, `${city} County`)?.fips).toBe(countyFips);
    const ambiguous = resolveCountyName(state, city);
    expect(ambiguous.kind).toBe("ambiguous");
    expect(new Set(ambiguous.counties.map(({ fips }) => fips))).toEqual(new Set([cityFips, countyFips]));
    expect(countyByName(state, city)).toBeUndefined();
  }
  expect(countyByName("VA", "City of Loudoun")).toBeUndefined();
  expect(countyByName("VA", "Williamsburg County")).toBeUndefined();
  expect(countyByName("NV", "Carson City")?.fips).toBe("32510");
});
