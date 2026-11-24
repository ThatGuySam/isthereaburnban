import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { atLocalTime, US_ZONES } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml } from "../lib/html";
import { pacedSourceReader } from "../lib/http";
import { manualPdf } from "../lib/pdf";
import type { ActiveSource } from "../types";

const PAGE = "https://www.blm.gov/programs/fire/regional-info/south-dakota/fire-restrictions";
const ORDER = "https://www.blm.gov/sites/default/files/docs/2026-10/FPO-SD-Stage1-Oct01-2026.pdf";
const META = {
  id: "sd-blm-fire-restrictions", state: "SD", scope: "part",
  stack: "Drupal / HTML and signed PDF", sourceName: "BLM South Dakota Field Office",
  sourceUrl: PAGE, officialUrl: PAGE,
} as const;

// Order LLMTC040-26-02 names the covered counties and remains effective until rescinded.
const COUNTIES = ["Butte", "Custer", "Fall River", "Haakon", "Lawrence", "Meade", "Pennington", "Perkins", "Stanley", "Ziebach"];
const START = "2026-10-01";
const NOTICE_HASH = "4fe1c370b6858230046f66364340813d7517a0ee9adb6131cbf47cd848736635";
const ORDER_HASH = "9f0baf4657fd4824aeb08397afc7266d5d5a9d1a02e3b113c4d4d9548e4375b7";
const validFrom = atLocalTime(START, 1, US_ZONES.Mountain);

export async function parseSdBlmRestrictions(
  input: Response | string, now: Date, readOrder: (url: string) => Promise<Response>,
): Promise<CountyStatus[]> {
  const { blocks } = await extractHtml(input, { blockLinks: true });
  const section = blockAfterHeading(blocks, /^South Dakota Fire Restrictions$/, { requireUnique: true });
  const sidebar = section.findIndex(({ tag, text }) => tag === "h2" && text === "Montana-Dakotas");
  const notice = sidebar < 0 ? section : section.slice(0, sidebar);
  const href = notice.at(-1)?.links?.[0]?.href;
  if (!href || URL.parse(href, PAGE)?.href !== ORDER ||
      await sha256(notice.map(({ text }) => text).join("\n")) !== NOTICE_HASH) {
    throw new Error("South Dakota BLM: current notice or order link changed. Review the latest signed order.");
  }
  const checked = now.toISOString();
  if (!validFrom || checked < validFrom) return [];
  if ((await manualPdf(await readOrder(ORDER))).sha256 !== ORDER_HASH) {
    throw new Error("South Dakota BLM: signed order changed. Review its scope and effective dates.");
  }

  return COUNTIES.map((name) => {
    const county = countyByName(META.state, name);
    if (!county) throw new Error(`Unknown South Dakota county in BLM order: ${name}`);
    return {
      fips: county.fips, county: county.name, state: META.state, sourceId: META.id, scope: META.scope,
      scopeNote: "BLM lands named in South Dakota Field Office order LLMTC040-26-02",
      status: "restricted", label: "BLM Stage 1 fire restrictions",
      note: "The order limits fires and campfires to developed recreation sites on covered BLM lands. Check the signed order for permits, fuel-device exceptions and smoking limits.",
      checked, since: START, expires: null, sourceUpdated: null, validFrom,
      sourceName: META.sourceName, sourceUrl: ORDER, officialUrl: META.officialUrl,
    };
  });
}

export const sdBlmFireRestrictions: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: US_ZONES.Mountain, hours: [9] },
  staleMs: 26 * 3_600_000,
  async fetch({ now }) {
    const read = pacedSourceReader({
      headers: { accept: "text/html, application/pdf" }, maxBytes: 600_000, maxResponseAgeMs: 24 * 3_600_000,
    });
    const page = await read(PAGE);
    if (page.notModified) throw new Error("Unexpected South Dakota BLM 304");
    return { rows: await parseSdBlmRestrictions(page.response, now, async (url) => {
      const order = await read(url);
      if (order.notModified) throw new Error("Unexpected South Dakota BLM order 304");
      return order.response;
    }) };
  },
};
