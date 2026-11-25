import { statusSentence } from "../shared/render";
import type { BanStatus, CountyStatus } from "../shared/types";
import { isScopedBan } from "./county-decision";
import { countyPath, COUNTY_BY_FIPS } from "./counties";

export type Transition = { fips: string; oldStatus: BanStatus; newStatus: BanStatus; at: string; notice?: Notice };

export type Notice = {
  kind: "live" | "test" | "canary" | "ops";
  fips: string;
  title: string;
  body: string;
  url: string;
  emailStatus?: "ban" | "restricted" | "lifted" | "updated" | "bulletin" | "order-lifted" | "order-extended";
  incident?: { sourceIds: string[]; state: string; openedAt: number; nextStep: string };
};

export function countyLabel(fips: string): string {
  const county = COUNTY_BY_FIPS.get(fips);
  return county ? `${county.name}, ${county.state}` : fips;
}

export function transitionNotice(t: Transition, county?: CountyStatus): Notice {
  const where = county ? `${county.county}, ${county.state}` : countyLabel(t.fips);
  const title =
    county && isScopedBan(county) ? county.label
    : t.newStatus === "ban" ? `Burn ban: ${where}`
    : t.newStatus === "restricted" ? `Burning restricted: ${where}`
    : t.oldStatus === "ban" ? `Burn ban lifted: ${where}`
    : `Burn status changed: ${where}`;
  const body = county
    ? `${statusSentence(county)}. Source: ${county.sourceName}. Check the official page before burning.`
    : "Check the official source before burning.";
  const emailStatus = county?.conflict ? "updated"
    : t.newStatus === "ban" ? (county && isScopedBan(county) ? "restricted" : "ban")
    : t.newStatus === "restricted" ? "restricted"
    : t.oldStatus === "ban" && t.newStatus === "none" ? "lifted" : "updated";
  return { kind: "live", fips: t.fips, title, body, url: countyPath(t.fips), emailStatus };
}

export function countyBulletin(county: CountyStatus): Notice {
  const checked = county.checked?.slice(0, 16).replace("T", " ");
  return {
    kind: "live",
    fips: county.fips,
    title: `Burn status update: ${county.county}, ${county.state}`,
    body: `${statusSentence(county)}. Source: ${county.sourceName}${checked ? `, checked ${checked} UTC` : ""}. Check the official page before burning.`,
    url: countyPath(county.fips),
    emailStatus: "bulletin",
  };
}

export function testNotice(fips: string, kind: "test" | "canary", transition?: Transition): Notice {
  const title = transition ? `Test: ${transitionNotice(transition).title}`
    : kind === "canary" ? "Daily burn ban push check" : "Test burn ban notification";
  return {
    kind,
    fips,
    title,
    body: `Delivery test for ${countyLabel(fips)}. This message does not report the current burn status.`,
    url: countyPath(fips),
  };
}
