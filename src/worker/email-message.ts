import { escapeHtml, shortDate } from "../shared/render";
import { countyLabel, type Notice } from "./notification-message";

export const EMAIL_UNSUBSCRIBE_PATH = "/api/v1/email/unsubscribe";
export const UNSUBSCRIBE_FIELD = "List-Unsubscribe";
export const UNSUBSCRIBE_VALUE = "One-Click";

const SENDER_NAME = "Is There a Burn Ban?";
const ALERT_REPLY = "alerts@isthereaburnban.com";
export const DEFAULT_EMAIL_FROM = `${SENDER_NAME} <${ALERT_REPLY}>`;
const SUBSCRIBER_REASON = "You signed up for burn ban alerts for the counties you selected.";

type Link = { label: string; url: string };
type Section = { heading?: string; icon?: string; paragraphs?: string[]; link?: Link };
export type EmailMessage = { subject: string; text: string; html: string; headers?: Record<string, string> };

function tokenLink(site: string, path: string, token: string): string {
  const url = new URL(path, site);
  url.searchParams.set("token", token);
  return url.href;
}

function utcTime(iso: string): string {
  return `${shortDate(iso)} at ${iso.slice(11, 16)} UTC`;
}

function render(subject: string, lead: string, sections: Section[], reason: string, unsubscribe?: { url: string; token: string }): EmailMessage {
  const footer = `Sent by ${SENDER_NAME}\n${reason}`;
  const text = [
    lead,
    ...sections.map(({ heading, icon, paragraphs, link }) => [
      heading && (icon ? `${icon} ${heading}` : heading),
      ...(paragraphs ?? []),
      link && `${link.label}\n${link.url}`,
    ].filter(Boolean).join("\n\n")),
    footer,
    unsubscribe && `Unsubscribe from these alerts\n${unsubscribe.url}`,
  ].filter(Boolean).join("\n\n") + "\n";

  const paragraph = (value: string) =>
    `<p style="margin:0 0 12px">${escapeHtml(value).replaceAll("\n", "<br>")}</p>`;
  const renderLink = ({ label, url }: Link) =>
    `<p style="margin:0 0 12px">${escapeHtml(label)}<br><a href="${escapeHtml(url)}" style="text-decoration:underline;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(url)}</a></p>`;
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(subject)}</title></head>`,
    '<body style="margin:0;color-scheme:light dark">',
    '<main style="max-width:36em;margin:0 auto;padding:20px;overflow-wrap:break-word;font:16px/1.5 system-ui,sans-serif">',
    `<h1 style="font-size:24px;line-height:1.25;margin:0 0 20px">${escapeHtml(lead)}</h1>`,
    ...sections.flatMap(({ heading, icon, paragraphs, link }) => [
      '<section style="margin:0 0 24px">',
      ...(heading ? [
        `<h2 style="font-size:19px;line-height:1.3;margin:0 0 8px">${icon ? `<span aria-hidden="true">${icon}</span> ` : ""}${escapeHtml(heading)}</h2>`,
      ] : []),
      ...(paragraphs ?? []).map(paragraph),
      ...(link ? [renderLink(link)] : []),
      '</section>',
    ]),
    '<footer style="border-top:1px solid currentColor;padding-top:12px;font-size:14px">',
    paragraph(footer),
    ...(unsubscribe ? [renderLink({ label: "Unsubscribe from these alerts", url: unsubscribe.url })] : []),
    '</footer>',
    '</main></body></html>',
  ].join("\n") + "\n";

  const headers = unsubscribe ? {
    [UNSUBSCRIBE_FIELD]: `<${unsubscribe.url}>, <mailto:${ALERT_REPLY}?subject=Unsubscribe%20${encodeURIComponent(unsubscribe.token)}>`,
    "List-Unsubscribe-Post": `${UNSUBSCRIBE_FIELD}=${UNSUBSCRIBE_VALUE}`,
  } : undefined;
  return { subject, text, html, ...(headers && { headers }) };
}

export function renderConfirmationEmail(site: string, fips: string[], token: string, expires: string): EmailMessage {
  return render("Confirm your burn ban alerts", "Confirm your email to start receiving burn ban alerts.", [
    {
      heading: "Your selected counties",
      paragraphs: [fips.map(countyLabel).join("\n"), `This link expires on ${utcTime(expires)}.`],
      link: { label: "Confirm your subscription", url: tokenLink(site, "/api/v1/email/confirm", token) },
    },
  ], "Someone entered this email address when signing up. If that wasn’t you, you can ignore this message.");
}

function liveStatus(notice: Notice): NonNullable<Notice["emailStatus"]> {
  if (notice.emailStatus) return notice.emailStatus;
  // The outbox can still have notices written before email status was stored.
  if (/^Burn(?: ban|ing restrictions) extended: /.test(notice.title)) return "order-extended";
  if (/^Burn(?: ban|ing restrictions) lifted: /.test(notice.title) && notice.body.includes(" confirmed the lift.")) return "order-lifted";
  if (notice.title.startsWith("Burn status update: ")) return "bulletin";
  if (notice.title.startsWith("Burn ban: ")) return "ban";
  if (notice.title.startsWith("Burning restricted: ")) return "restricted";
  if (notice.title.startsWith("Burn ban lifted: ")) return "lifted";
  return "updated";
}

const LIVE_COPY = {
  ban: { title: "Burn ban in", icon: "🔥" },
  restricted: { title: "Burning restrictions in", icon: "⚠️" },
  lifted: { title: "Burn ban lifted in", icon: "✅" },
  updated: { title: "Burn status update for", icon: undefined },
  bulletin: { title: "Burn status bulletin for", icon: undefined },
  "order-lifted": { title: "Burn order lifted in", icon: "✅" },
  "order-extended": { title: "Burn order extended in", icon: "⚠️" },
};

function countyLink(site: string, notice: Notice): Link {
  return { label: "View county status and official sources", url: new URL(notice.url, site).href };
}

function renderOpsEmail(site: string, notice: Notice): EmailMessage {
  const { incident } = notice;
  const subject = incident ? `Source pipeline alert for ${incident.state}` : "Source pipeline alert";
  const paragraphs = [];
  if (incident) {
    paragraphs.push([
      `Source ID${incident.sourceIds.length === 1 ? "" : "s"}: ${incident.sourceIds.join(", ")}`,
      `State: ${incident.state}`,
      `Detected: ${utcTime(new Date(incident.openedAt).toISOString())}`,
    ].join("\n"));
  }
  paragraphs.push(notice.body, `Dashboard path: /ops/\n${incident?.nextStep ??
    "Open your private dashboard bookmark and check the Source pipeline section for this incident."}`);
  return render(subject, "The burn ban source pipeline needs attention.", [{
    heading: "Source incident", icon: "⚠️", paragraphs,
    link: { label: "View public coverage data", url: new URL(notice.url, site).href },
  }], "This address is configured to receive operational alerts.");
}

export function renderAlertEmail(site: string, notices: Notice[], token: string | null): EmailMessage {
  const first = notices[0];
  if (first.kind === "ops") return renderOpsEmail(site, first);

  const unsubscribe = token ? { token, url: tokenLink(site, EMAIL_UNSUBSCRIBE_PATH, token) } : undefined;
  if (first.kind === "test" || first.kind === "canary") {
    const place = countyLabel(first.fips);
    const canary = first.kind === "canary";
    const simulation = first.title.startsWith("Test: ") ? first.title.slice("Test: ".length) : undefined;
    const lead = `${canary ? "Scheduled" : "Operator"} email delivery check for ${place}.`;
    return render(canary ? "Scheduled email delivery check" : `Delivery check for ${place}`, lead, [{
      paragraphs: simulation ? [`Simulated notice: ${simulation}`] : [],
      link: countyLink(site, first),
    }], token ? "This subscription is enrolled in delivery checks." : "This address was selected for a delivery check.", unsubscribe);
  }

  const count = new Set(notices.map(({ fips }) => fips)).size;
  const subject = notices.length === 1
    ? `${LIVE_COPY[liveStatus(first)].title} ${countyLabel(first.fips)}`
    : count === 1 ? `Burn status updates for ${countyLabel(first.fips)}` : `Burn status updates in ${count} counties`;
  const lead = notices.length === 1 ? `${subject}.` : `You have new burn status updates for ${count === 1 ? "one county" : `${count} counties`}.`;
  return render(subject, lead, notices.map((notice) => {
    const status = liveStatus(notice);
    const { title, icon } = LIVE_COPY[status];
    const heading = status === "order-lifted" || status === "order-extended" ? notice.title
      : notices.length === 1 ? "Source report" : `${title} ${countyLabel(notice.fips)}`;
    const detail = notice.body
      .replace(/ Check the official (?:page|source) before burning\.$/, "")
      .replace(". Source: ", ".\nSource: ");
    const paragraphs = detail === "Check the official source before burning." ? [] : [detail];
    return { heading, icon: notices.length <= 3 ? icon : undefined, paragraphs, link: countyLink(site, notice) };
  }), `${SUBSCRIBER_REASON}\nCheck the official source before burning.`, unsubscribe);
}
