import type { HtmlParts } from "./html";

// Inventory: CivicPlus/CivicEngage, including AlertCenter, CivicAlerts and mobile News Flash
// in Pima, Angel Fire, Greenwich, Placer, and Puget Sound Clean Air's embedded status table.
export function civicPlusUrl(site: string, channel: "alerts" | "news" | "mobile"): string {
  return new URL({ alerts: "/AlertCenter.aspx", news: "/CivicAlerts.aspx", mobile: "/m/newsflash" }[channel], site).href;
}

export function civicPlusNotices(parts: HtmlParts, pageUrl: string): { title: string; url: string }[] {
  const home = new URL(pageUrl);
  const found = new Map<string, { title: string; url: string }>();
  for (const { href, text } of parts.links) {
    if (!text) continue;
    let url: URL;
    try { url = new URL(href, home); } catch { continue; }
    if (url.origin !== home.origin) continue;
    const item = /^\/(?:AlertCenter\.aspx|CivicAlerts\.aspx)$/i.test(url.pathname)
      ? url.searchParams.get("AID") ?? url.searchParams.get("aid")
      : /^\/(?:AlertCenter|CivicAlerts\/showalert|m\/newsflash\/(?:home\/detail|archive\/item))\/(?:[^/]+-)?(\d+)\/?$/i.exec(url.pathname)?.[1];
    if (!item || !/^\d+$/.test(item)) continue;
    url.hash = "";
    found.set(url.href, { title: text, url: url.href });
  }
  return [...found.values()];
}
