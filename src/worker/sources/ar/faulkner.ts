import type { CountyStatus } from "../../../shared/types";
import { localClock, parseLocalDateTime, reportWindow, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import { monitorPdf } from "../lib/pdf";
import type { ActiveSource } from "../types";

const HOME = "https://www.faulknercountyar.gov/";
const META = {
  id: "ar-faulkner-county-orders", state: "AR", scope: "part", stack: "WordPress / Elementor HTML and signed PDFs",
  sourceName: "Faulkner County Judge", sourceUrl: HOME, officialUrl: HOME,
} as const;
const ZONE = US_ZONES.Central;
const HOUR = 3_600_000;
const MAX_ORDER_AGE = 30 * 24 * HOUR;
const WIDGET = '[data-id="689f6be"] > .elementor-widget-container';
const BANNER = { row: WIDGET, cell: `${WIDGET} > p:first-child, ${WIDGET} > p a` };

// The banner omits boundaries. Verify each scan's scope and order number before accepting it.
const ISSUE = {
  id: "26-204", effective: "2026-11-18T15:00:00.000Z",
  url: `${HOME}wp-content/uploads/2026/11/Faulkner-County-Court-Order-26-204.pdf`,
  sha256: "134f5211a35d1009b59469b2e4f59637acd2ae3478ddfba1f6d6915fdba6c075",
};
const LIFT = {
  id: "26-202", effectiveDay: "2026-11-03", rescinds: "26-170",
  url: `${HOME}wp-content/uploads/2026/11/Burn-Ban-Rescind-26-202.pdf`,
  sha256: "d9dc49bc427429701782efee2a23cf05389706e5aaf03ffff8735fe61595366e",
};

type ReadOrder = (url: string) => Promise<{ sha256: string }>;

export async function parseFaulknerBan(input: Response | string, now: Date, readOrder: ReadOrder): Promise<CountyStatus[]> {
  const [banner, ...others] = await extractHtmlGrid(input, BANNER);
  if (!banner || others.length || banner.length !== 2) throw new Error("Faulkner: expected one current decision with an order link");
  const [decision, link] = banner;
  const id = /^Court Order (\d{2}-\d+)$/i.exec(link.text)?.[1];
  const issue = /^Faulkner County is under a Burn Ban effective (\d{1,2}:\d{2} [ap]\.m\.) (\d{1,2}\/\d{1,2}\/\d{4})\. until further notice\.$/i.exec(decision.text);
  if (!issue) {
    const lift = /^(?:The )?(?:Faulkner County burn ban|burn ban (?:in|for) Faulkner County) (?:has been|is) (?:lifted|rescinded)\.?$/i.test(decision.text);
    if (!lift) throw new Error("Faulkner: unrecognized burn-ban decision");
    if (id !== LIFT.id || link.href !== LIFT.url) throw new Error("Faulkner: unverified rescission");
    if (localClock(now, ZONE).date < LIFT.effectiveDay || (LIFT.rescinds !== ISSUE.id && now.toISOString() >= ISSUE.effective)) {
      throw new Error("Faulkner: rescission does not apply to the current order");
    }
    if ((await readOrder(LIFT.url)).sha256 !== LIFT.sha256) throw new Error("Faulkner: rescission PDF changed");
    return [];
  }

  if (id !== ISSUE.id || link.href !== ISSUE.url) throw new Error("Faulkner: unverified burn-ban order");
  const validFrom = parseLocalDateTime(`${issue[2]} ${issue[1]}`, ZONE);
  if (validFrom !== ISSUE.effective) throw new Error("Faulkner: effective date differs from the verified order");
  const window = reportWindow(validFrom, now, MAX_ORDER_AGE);
  if (!window) throw new Error("Faulkner: future or stale order");
  if ((await readOrder(ISSUE.url)).sha256 !== ISSUE.sha256) throw new Error("Faulkner: burn-ban PDF changed");

  return [{
    fips: "05045", county: "Faulkner County", state: META.state, sourceId: META.id, scope: META.scope,
    scopeNote: "Unincorporated Faulkner County", status: "ban", label: "Outdoor burn ban",
    note: `County Court Order ${id} bans outdoor burning until lifted. The county judge may issue written permits in special circumstances. Check with your city for rules inside city limits.`,
    since: localClock(new Date(validFrom), ZONE).date, expires: null, sourceUpdated: null, checked: now.toISOString(),
    validFrom, validUntil: window.validUntil, sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: ISSUE.url,
  }];
}

export const arFaulknerCountyOrders: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", keepRowLinks: true,
  cadence: { kind: "daily", zone: ZONE, hours: [4, 10, 16, 22] }, staleMs: 18 * HOUR,
  async fetch({ now }) {
    const reply = await fetchSource(HOME, { attempts: 1, headers: { accept: "text/html" }, maxBytes: 600_000 });
    if (reply.notModified) throw new Error("Unexpected Faulkner homepage 304");
    if (Number(reply.response.headers.get("age")) > 1800) {
      await reply.response.body?.cancel();
      throw new Error("Faulkner: cached homepage is over 30 minutes old");
    }
    return { rows: await parseFaulknerBan(reply.response, now, async (url) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const pdf = await monitorPdf(url);
      if (pdf.notModified) throw new Error("Unexpected Faulkner order 304");
      return pdf.document;
    }) };
  },
};
