import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import type { Snapshot } from "../shared/types";
import { activeBans, coverage } from "./api";
import { countyPath } from "./counties";
import { subscribeEmail } from "./email";
import type { Env } from "./env";
import { lookup, resultSentence } from "./lookup";
import { getSnapshot } from "./snapshot";

function json(value: unknown, summary?: string) {
  const content: { type: "text"; text: string }[] = [];
  if (summary) content.push({ type: "text", text: summary });
  content.push({ type: "text", text: JSON.stringify(value, null, 2) });
  return { content };
}

/** subscribe_email_alerts: same double opt-in as the site form (POST /api/v1/email/subscribe). */
export async function subscribeAlertsTool(env: Env, args: { email: string; fips: string[] }) {
  const r = await subscribeEmail(env, { email: args.email, fips: args.fips });
  if (!r.ok) return { content: [{ type: "text" as const, text: r.error ?? "subscription failed" }], isError: true };
  const pages = args.fips.map((f) => `${new URL(countyPath(f), env.SITE_URL).href}`).join(", ");
  const text = r.emailEnabled
    ? `Almost done: we sent a confirmation email to ${args.email.trim().toLowerCase()}. No alerts go out until they click the link in it. Pages: ${pages}`
    : `Saved, but email alerts are not switched on yet, so no confirmation was sent. Suggest the user turn on push alerts on the county page instead: ${pages}`;
  return { content: [{ type: "text" as const, text }] };
}

/** Shown to clients in `initialize`. Version tracks server.json. */
export const SERVER_INFO = {
  name: "isthereaburnban",
  title: "Is There a Burn Ban?",
  version: "1.1.0",
  description: "US county burn ban status from official state sources, plus NWS fire-weather alerts.",
  websiteUrl: "https://isthereaburnban.com/developers/",
  icons: [{ src: "https://isthereaburnban.com/icons/icon-512.png", mimeType: "image/png", sizes: ["512x512"] }],
};

export const SERVER_INSTRUCTIONS =
  "Answers whether a US county has a burn ban right now, from official state and local sources, refreshed hourly. " +
  "Start with check_burn_ban for a ZIP, city and state, coordinates or county FIPS. " +
  "Status is ban, restricted, none or unknown; unknown never means burning is allowed. " +
  "Always show the officialUrl so the person can confirm with the official source before burning. " +
  "Only call subscribe_email_alerts when the person asks for alerts and gives their own email.";

export function createServer(env: Env) {
  let snap: Promise<Snapshot> | undefined;
  const snapshot = () => (snap ??= getSnapshot(env));
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });

  server.registerTool(
    "check_burn_ban",
    {
      title: "Check burn ban",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      description:
        "Check whether a US county has an active burn ban. Give a 5-digit ZIP, or lat and lon, or a 5-digit county FIPS code, or a city or town with its state. Returns one result per county. Status is ban, restricted, none, or unknown. Unknown means the legal status is unconfirmed. County results may include NWS fire-weather alerts. Cite alerts[].url for the weather and officialUrl or orders[].officialUrl for applicable burn rules. County bans usually cover unincorporated areas and cities can have their own rules.",
      inputSchema: z.object({
        zip: z.string().regex(/^\d{5}$/).optional().describe("5-digit US ZIP code"),
        lat: z.number().min(-90).max(90).optional(),
        lon: z.number().min(-180).max(180).optional(),
        fips: z.string().regex(/^\d{5}$/).optional().describe("5-digit county FIPS, e.g. 40143 for Tulsa County, OK"),
        city: z.string().max(80).optional().describe("Incorporated city or town name, e.g. Tulsa. Pass state too."),
        state: z.string().length(2).optional().describe("2-letter state code for city, e.g. OK"),
      }),
    },
    async (args) => {
      try {
        const r = await lookup(env, await snapshot(), args);
        return json(r, r.results.map(resultSentence).join("\n"));
      } catch (err) {
        return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
      }
    },
  );

  server.registerTool(
    "list_active_bans",
    {
      title: "List active burn bans",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      description: "List counties with a reported active burn ban or burning restriction, optionally for one state (2-letter code). Use the coverage tool for source availability.",
      inputSchema: z.object({ state: z.string().length(2).optional().describe("2-letter state code, e.g. TX") }),
    },
    async ({ state }) => {
      const r = activeBans(await snapshot(), state);
      return json(r, `${r.counties.length} counties with a ban or restriction${state ? ` in ${state.toUpperCase()}` : ""} as of ${r.generated}.`);
    },
  );

  server.registerTool(
    "subscribe_email_alerts",
    {
      title: "Subscribe to email alerts",
      // Writes a pending signup and sends a confirmation email; repeating it never removes anything.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description:
        "Sign a person up for email alerts when the burn ban status changes for one or more counties. Only call this when the user asks for alerts and gives their own email. It is double opt-in: we email a confirmation link and send nothing until they click it, so tell them to check their inbox. Get FIPS codes from check_burn_ban first.",
      inputSchema: z.object({
        email: z.string().email().max(254).describe("The user's own email address"),
        fips: z.array(z.string().regex(/^\d{5}$/)).min(1).max(20).describe("County FIPS codes from check_burn_ban results"),
      }),
    },
    async (args) => subscribeAlertsTool(env, args),
  );

  server.registerTool(
    "coverage",
    {
      title: "Data coverage",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      description: "Which states have live burn ban data, which only have official links, and the health of each data source.",
    },
    async () => json(coverage(await snapshot())),
  );

  return server;
}

export function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const site = new URL(env.SITE_URL).hostname;
  const host = new URL(request.url).hostname;
  const hosts = [site, "isthereaburnban.com", "www.isthereaburnban.com", "localhost", "127.0.0.1"];
  if (host.endsWith(".workers.dev")) hosts.push(host);
  return createMcpHandler(() => createServer(env), { route: "/mcp", allowedHostnames: hosts })(request, env, ctx);
}
