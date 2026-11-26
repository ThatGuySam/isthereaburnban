import { z } from "zod";
import { countyStatusBulletin } from "../lib/county-bulletin";
import { parseLocalDateTime, reportWindow, US_ZONES } from "../lib/dates";
import { wpRestEndpoint } from "../lib/wordpress";

const maxAge = 2 * 3_600_000;
const page = "https://stdavidfire.com/resident-resources/burn-permits/";
const decisionSchema = z.object({
  state: z.enum(["allowed", "blocked", "unknown"]),
  title: z.string(),
  reason: z.string().trim().min(1).max(300),
  checked: z.string().max(100),
  url: z.literal(page),
});

export const azSaintDavidPermitStatus = countyStatusBulletin({
  id: "az-saint-david-permit-status", state: "AZ", county: "Cochise", stack: "WordPress / public REST plugin",
  sourceName: "Saint David Fire District",
  sourceUrl: wpRestEndpoint("https://stdavidfire.com/", "sdfd-burn/v1/status"),
  officialUrl: page, scopeNote: "Saint David Fire District permit-burning program",
  cadence: { kind: "hourly" }, pollGroup: "hourly-fire-status", staleMs: maxAge, maxBytes: 8_192, accept: "application/json",
  async read(input, now) {
    const decision = decisionSchema.safeParse(await input.json());
    if (!decision.success) throw new Error("Unexpected Saint David burn status");
    const { state, title, reason, checked } = decision.data;
    const timestamp = checked.match(/^Sources last successfully checked through: (.+) MST$/)?.[1];
    const updated = timestamp ? parseLocalDateTime(timestamp, US_ZONES.Arizona) : null;
    const window = reportWindow(updated, now, maxAge);
    if (!window) throw new Error("Saint David burn status has no recent verification time");
    if (state === "allowed" && title === "BURNING ALLOWED") return;
    if (state !== "blocked" || title !== "BURNING NOT ALLOWED") throw new Error("Unconfirmed Saint David burn status");
    return {
      ...window, status: "restricted", label: "District permit burning suspended",
      note: reason + " See the district permit page for current conditions and applicable rules.",
    };
  },
});
