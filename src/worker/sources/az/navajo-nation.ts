import { scopedStatusBulletin } from "../lib/county-bulletin";
import { atLocalTime, localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";

const index = "https://opvp.navajo-nsn.gov/executive-orders/";
const order = "https://opvp.navajo-nsn.gov/executive-order-no-05-2026/";
const counties = ["Apache", "Coconino", "Navajo"] as const;
const zone = US_ZONES.Mountain;

export const azNavajoNationStage = scopedStatusBulletin({
  id: "az-navajo-nation-stage", state: "AZ", counties, stack: "WordPress / executive order index",
  sourceName: "Navajo Nation Office of the President",
  sourceUrl: index, officialUrl: index,
  cadence: { kind: "daily", zone, hours: [8] }, staleMs: 36 * 3_600_000,
  async read(input, now) {
    const cards = await extractHtmlGrid(input, {
      row: "article.et_pb_post.category-executive-orders",
      cell: "h2.entry-title a, span.published, div.post-content",
    });
    const today = localClock(now, zone).date;
    let latest: { date: string; href: string; title: string; summary: string } | undefined;
    for (const [link, stamp, excerpt, ...extra] of cards) {
      const date = stamp && parseUsDate(stamp.text);
      if (!link?.href || !link.text || !date || date > today || !excerpt?.text || extra.length) {
        throw new Error("Missing or changed Navajo Nation executive order record");
      }
      const href = new URL(link.href, index).href;
      if (!/\b(?:fire|burn(?:ing)?|wildfire|rescind\w*)\b/i.test(link.text + " " + excerpt.text)) continue;
      if (date === latest?.date) throw new Error("Ambiguous latest Navajo Nation fire order");
      if (!latest || date > latest.date) latest = { date, href, title: link.text, summary: excerpt.text };
    }
    if (!latest) throw new Error("No Navajo Nation fire order on the current index page");
    if (latest.href !== order || latest.date !== "2026-07-24" ||
      !/Lifting Stage 2 Fire Restrictions$/.test(latest.title) || !/Stage 1 restrictions remain in effect\./.test(latest.summary)) {
      // A later order may replace the reviewed Stage 1 terms. Withdraw this report until it is reviewed.
      return [];
    }
    return counties.map((county) => ({
      county, status: "restricted" as const, label: "Stage 1 fire restrictions",
      since: latest.date, sourceUpdated: latest.date, validFrom: atLocalTime(latest.date, 0, zone) ?? undefined,
      scopeNote: `Navajo Nation lands in ${county} County`,
      note: "Executive Order 05-2026 lifted Stage 2 and retained Stage 1 under Order 02-2026. Covered open fires and fireworks are restricted on Navajo Nation lands. The signed orders explain exceptions.",
      officialUrl: order,
    }));
  },
});
