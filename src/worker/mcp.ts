import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { coverage } from "./api";
import { countyPath } from "./counties";
import { subscribeEmail } from "./email";
import type { Env } from "./env";
import { lookup, lookupText } from "./lookup";
import { snapshotReader } from "./snapshot";
import { peekMcp, type McpCall } from "./usage";

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
  description: "US county burn-ban reports, standing restrictions and selected NWS fire-weather signals.",
};

export const SERVER_INSTRUCTIONS =
  "Summarizes published US county reports and restrictions. Source schedules and coverage vary. " +
  "Start with check_burn_ban for a ZIP, city and state, coordinates or county FIPS. " +
  "Check location matches, scope, activity, source checks and deadlines. Confirm the county for approximate results. " +
  "Report differing counties separately. Cite the issuing order when available and use officialUrl for confirmation. " +
  "Only call subscribe_email_alerts when the person asks for alerts and gives their own email.";

export function createServer(env: Env, banText: (wireText: string[]) => string = (value) => JSON.parse(value.join(""))) {
  let reader: ReturnType<typeof snapshotReader> | undefined;
  const snapshots = () => (reader ??= snapshotReader(env));
  const { origin } = new URL(env.SITE_URL);
  const server = new McpServer({
    ...SERVER_INFO,
    websiteUrl: `${origin}/developers/`,
    icons: [{ src: `${origin}/icons/icon-512.png`, mimeType: "image/png", sizes: ["512x512"] }],
  }, { instructions: SERVER_INSTRUCTIONS });

  server.registerTool(
    "check_burn_ban",
    {
      title: "Check burn ban",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      description:
        "Read reported county status by ZIP, coordinates, FIPS, or incorporated place and state. Confirm county candidates if approximate is true. For split places, describe the differing reports. Inspect scope, activity, reported orders and check times. Cite the issuing order when available and cite alerts[].url for any fire-weather signal. Cities can have separate rules.",
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
        const r = await lookup(env, snapshots(), args);
        return json(r, lookupText(r));
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
      description: "List published active reports, including scoped restrictions. Pass a two-letter state code to narrow the list. Use coverage to check which reports the sources can establish.",
      inputSchema: z.object({ state: z.string().length(2).optional().describe("2-letter state code, e.g. TX") }),
    },
    async ({ state }) => {
      const { count, body, generated } = await snapshots().bans(state, "pretty");
      return { content: [
        { type: "text" as const, text: `${count ? `${count} counties with published active reports` : "No published active reports"}${state ? ` in ${state.toUpperCase()}` : ""}. Published ${generated}.` },
        { type: "text" as const, text: banText(body) },
      ] };
    },
  );

  server.registerTool(
    "subscribe_email_alerts",
    {
      title: "Subscribe to email alerts",
      // Writes a pending signup and sends a confirmation email; repeating it never removes anything.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      description:
        "Request email alerts for eligible changes in selected counties. Use only when the person asks for alerts and provides their own email. When email delivery is enabled, the signup sends a confirmation link. Alerts start after confirmation. Use confirmed county FIPS codes.",
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
      description: "Show source coverage and health, including full county-reporting feeds, positive-only sources and manual references.",
    },
    async () => json(coverage(await snapshots().coverage())),
  );

  return server;
}

export async function handleMcp(request: Request, env: Env, ctx: ExecutionContext, hint?: McpCall): Promise<Response> {
  const site = new URL(env.SITE_URL).hostname;
  const hosts = [site, "isthereaburnban.com", "www.isthereaburnban.com", "beta.isthereaburnban.com", "localhost", "127.0.0.1"];
  const call = hint ?? await peekMcp(request);
  const banCall = request.method === "POST" && call?.method === "tools/call" && call.tool === "list_active_bans";
  const deferred = new Map<string, string[]>();
  const deferBanText = (wireText: string[]) => {
    const marker = crypto.randomUUID();
    deferred.set(JSON.stringify(marker), wireText);
    return marker;
  };
  const response = await createMcpHandler(() => createServer(env, banCall ? deferBanText : undefined),
    { route: "/mcp", allowedHostnames: hosts })(request, env, ctx);
  if (!banCall || !response.ok || !response.body) return response;

  // The SDK validates the exchange and serializes the envelope. Insert our escaped text after that,
  // so it does not escape multi-megabyte county lists again. This tool emits no progress events.
  const envelope = await response.text();
  const parts: BlobPart[] = [];
  let cursor = 0;
  const slots = [...deferred].map(([marker, body]) => ({ marker, body, at: envelope.indexOf(marker) }))
    .filter(({ at }) => at >= 0).sort((a, b) => a.at - b.at);
  for (const { marker, body, at } of slots) {
    parts.push(envelope.slice(cursor, at), ...body);
    cursor = at + marker.length;
  }
  parts.push(envelope.slice(cursor));
  const headers = new Headers(response.headers);
  if (slots.length) headers.delete("content-length");
  return new Response(new Blob(parts), { status: response.status, statusText: response.statusText, headers });
}
