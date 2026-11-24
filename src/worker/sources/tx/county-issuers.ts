import type { CountyStatus } from "../../../shared/types";
import { atLocalTime, localClock, parseIsoTimestamp, parseUsDate, parseWeekdayDate, US_ZONES } from "../lib/dates";
import { attributes, extractHtml, htmlText } from "../lib/html";
import { getText, pacedTextReader } from "../lib/http";
import { monitorPdf } from "../lib/pdf";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Central;
const BASE = { state: "TX", scope: "county", keepRowLinks: true, mode: "positive-only", coverage: "live",
  staleMs: 36 * 3_600_000 } as const;
const ARCHER_PAGE = "https://www.co.archer.tx.us/page/archer.BurnBanStatus";
const ARCHER_ORDER = "https://www.co.archer.tx.us/upload/page/1317/2026/20261006_BURN_BAN_LIFTED.pdf";
const ARCHER_ORDER_HASH = "7a10da76ef59b3a673312f79b46c2487e0809cfe8870a329bc0bc113e653c3dc";
const ARCHER = {
  ...BASE, id: "tx-archer-county-issuer", sourceName: "Archer County Judge",
  sourceUrl: ARCHER_PAGE, officialUrl: ARCHER_PAGE, stack: "Texas County Web Services / signed PDF",
} as const;
const BEXAR_MARSHAL = "https://www.bexar.org/630/Fire-Marshal";
const BEXAR_NOTICE = "https://nextdoor.com/agency-post/tx/san-antonio/bexar-county-commissioners/burn-ban-lifted-in-unincorporated-bexar-county-523172242/";
const BEXAR = {
  ...BASE, id: "tx-bexar-county-issuer", sourceName: "Bexar County Commissioners",
  sourceUrl: BEXAR_NOTICE, officialUrl: BEXAR_MARSHAL, stack: "Nextdoor agency notice / CivicEngage",
} as const;

export async function parseArcherRescission(html: string, now: Date, readDigest: (url: string) => Promise<string>): Promise<CountyStatus[]> {
  const headlines = [...html.matchAll(/<div\b[^>]*class="headline"[^>]*>([\s\S]*?)<\/div>/g)].map((match) => htmlText(match[1])).filter(Boolean);
  const { blocks, links } = await extractHtml(html, { links: true });
  const dates = blocks.filter(({ text }) => text.startsWith("Effective Date: "));
  const signed = links.filter(({ text }) => text === "Burn Ban Lifted Order");
  const day = dates.length === 1 ? parseUsDate(dates[0].text.slice("Effective Date: ".length)) : null;
  const validFrom = day && atLocalTime(day, 0, ZONE);
  if (headlines.length !== 2 || headlines[0] !== "Burn Ban Lifted" || headlines[1] !== "Current Burn Ban Status for Archer County" ||
      day !== "2026-10-06" || !validFrom || Date.parse(validFrom) > now.getTime() || signed.length !== 1 ||
      new URL(signed[0].href, ARCHER_PAGE).href !== ARCHER_ORDER || await readDigest(ARCHER_ORDER) !== ARCHER_ORDER_HASH) {
    throw new Error("Archer County: current status or signed rescission requires review");
  }
  return [{
    state: "TX", scope: "county", sourceId: ARCHER.id, sourceName: ARCHER.sourceName, sourceUrl: ARCHER.sourceUrl,
    fips: "48009", county: "Archer County", status: "none",
    issuerFor: "tx", documentId: ARCHER_ORDER, label: "County judge signed a rescission",
    scopeNote: "Unincorporated areas", note: "The signed order rescinds the burn ban the county says was authorized August 11, 2026.",
    since: day, sourceUpdated: day, validFrom, expires: null, checked: now.toISOString(), officialUrl: ARCHER_ORDER,
  }];
}

export async function parseBexarRescission(notice: string, advisory: string, now: Date): Promise<CountyStatus[]> {
  const meta = [...notice.matchAll(/<meta\b([^>]*)>/gi)].map((match) => attributes(match[1]));
  const value = (key: string, name: string) => {
    const found = meta.filter((item) => item[key] === name);
    return found.length === 1 ? found[0].content : undefined;
  };
  const canonical = [...notice.matchAll(/<link\b([^>]*)>/gi)].map((match) => attributes(match[1])).filter((item) => item.rel === "canonical");
  const validFrom = parseIsoTimestamp(value("itemprop", "datePublished"));
  const day = validFrom && localClock(new Date(validFrom), ZONE).date;
  if (canonical.length !== 1 || canonical[0].href !== BEXAR_NOTICE || day !== "2026-11-03" || !validFrom ||
      Date.parse(validFrom) > now.getTime() || value("property", "og:image:alt") !== "Cover image for Bexar County Commissioners" ||
      !/BURN BAN LIFTED IN UNINCORPORATED BEXAR COUNTY/.test(value("itemprop", "headline") ?? "") ||
      !/the burn ban for unincorporated areas of Bexar County has been officially lifted, effective immediately\./i.test(value("name", "description") ?? "")) {
    throw new Error("Bexar County: could not verify the November 3 county announcement");
  }
  const { blocks, links } = await extractHtml(advisory, { links: true });
  const statements = blocks.flatMap(({ tag, text }) => {
    const match = tag === "p" && /^Burning is (?:NOT )?recommended today, (.+)\.$/i.exec(text);
    return match ? [parseWeekdayDate(match[1])] : [];
  });
  if (!blocks.some(({ tag, text }) => tag === "h1" && text === "Fire Marshal") ||
      statements.length !== 1 || statements[0] !== localClock(now, ZONE).date ||
      [...blocks, ...links].some(({ text }) => /^(?:Order Restricting Outdoor Burning|Burn Ban (?:Order|in Effect))\b/i.test(text))) {
    throw new Error("Bexar County: current Fire Marshal advisory or a newer order needs review");
  }
  return [{
    state: "TX", scope: "county", sourceId: BEXAR.id, sourceName: BEXAR.sourceName, sourceUrl: BEXAR.sourceUrl,
    fips: "48029", county: "Bexar County", status: "none",
    issuerFor: "tx", documentId: "523172242", label: "County commissioners announced a lift",
    scopeNote: "Unincorporated areas", note: "The county announced that its prior ban was lifted immediately. The Fire Marshal's current advisory addresses burning conditions.",
    since: day, sourceUpdated: validFrom, validFrom, expires: null, checked: now.toISOString(), officialUrl: BEXAR_NOTICE,
  }];
}

export const txArcherCountyIssuer: ActiveSource = {
  ...ARCHER, cadence: { kind: "daily", zone: ZONE, hours: [10, 16] },
  async fetch({ now }) {
    const html = await getText(ARCHER_PAGE, { headers: { accept: "text/html" }, maxBytes: 96_000, attempts: 1 });
    return { rows: await parseArcherRescission(html, now, async (url) => {
      const pdf = await monitorPdf(url);
      if (pdf.notModified) throw new Error("Archer County: unexpected PDF 304");
      return pdf.document.sha256;
    }) };
  },
};

export const txBexarCountyIssuer: ActiveSource = {
  ...BEXAR, cadence: { kind: "daily", zone: ZONE, hours: [11, 16] },
  async fetch({ now }) {
    const read = pacedTextReader({ headers: { accept: "text/html" }, maxBytes: 400_000, attempts: 1 });
    return { rows: await parseBexarRescission(await read(BEXAR_NOTICE), await read(BEXAR_MARSHAL), now) };
  },
};
