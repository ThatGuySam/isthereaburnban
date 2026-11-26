import { extractHtmlGrid } from "./html";

const BANNER = /^A BURN BAN IS IN EFFECT\.(?: YOU CAN STILL APPLY FOR YOUR PERMIT BUT YOU MAY NOT BURN\.)?$/i;
const CLOSED = /^(?:NO (?:OPEN )?BURNING ALLOWED|BURNING IS NOT PERMITTED)\.?$/i;

/** Read the public decision on a Fluent BurnPermits.com tenant's landing page. */
export async function fluentBurnDecision(
  input: Response | string,
  { title, openMessage }: { title: string; openMessage: RegExp },
): Promise<"ban" | "allowed"> {
  const [body, ...extra] = await extractHtmlGrid(input, {
    row: "body",
    cell: ".main-title > h1, body > .alert.alert-danger.center:not(.ie-square-alert), body > #RiskLevelGauge, body > h4",
  });
  if (!body || extra.length) throw new Error("Fluent BurnPermits: missing decision page");
  const headings = body.filter(({ tag }) => tag === "h1");
  if (headings.length !== 1 || headings[0].text !== title) {
    throw new Error("Fluent BurnPermits: unexpected publisher");
  }
  const banners = body.filter(({ className }) => className.split(/\s+/).includes("alert-danger"));
  const gauges = body.filter(({ id }) => id === "RiskLevelGauge");
  const messages = body.filter(({ tag }) => tag === "h4");
  if (gauges.length > 1 || messages.length > 1 || banners.length > 1) {
    throw new Error("Fluent BurnPermits: ambiguous decision panel");
  }
  if (banners.length && BANNER.test(banners[0].text)) return "ban";
  if (!banners.length && gauges.length === 1 && messages.length === 1 &&
      body.indexOf(messages[0]) === body.indexOf(gauges[0]) + 1) {
    const { text } = messages[0];
    if (CLOSED.test(text)) return "ban";
    if (openMessage.test(text)) return "allowed";
  }
  throw new Error("Fluent BurnPermits: unrecognized decision");
}
