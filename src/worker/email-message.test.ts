// @ts-nocheck -- matches the existing Bun tests, which run without Bun types in the Worker tsconfig.
import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { renderAlertEmail, renderConfirmationEmail } from "./email-message";
import { countyBulletin, testNotice, transitionNotice } from "./notification-message";

const site = "https://isthereaburnban.example";
const token = "00000000-0000-4000-8000-000000000001";
const at = "2026-11-24T16:05:00.000Z";
const county = {
  fips: "40143", county: "Tulsa County", state: "OK", status: "ban", label: "Burn ban",
  checked: at, sourceName: "Oklahoma Forestry Services",
};
const transition = { fips: county.fips, oldStatus: "none", newStatus: "ban", at };
const ban = transitionNotice(transition, county);
const restrictions = transitionNotice({ fips: "40001", oldStatus: "none", newStatus: "restricted", at }, {
  ...county, fips: "40001", county: "Adair County", status: "restricted", label: "Burn permit required",
});
const lifted = transitionNotice({ ...transition, oldStatus: "ban", newStatus: "none" }, {
  ...county, status: "none", label: "No countywide burn ban",
});
const localLift = {
  ...lifted, emailStatus: "order-lifted", title: "Burn ban lifted: Tulsa city limits",
  body: "The city confirmed the lift. Check the official page for other rules before burning.",
};
const extension = {
  ...ban, emailStatus: "order-extended", title: "Burn ban extended: Unincorporated areas",
  body: "Burn ban extended through Nov 30, 2026. Source: Oklahoma Forestry Services.",
};
const ops = {
  kind: "ops", fips: "", title: "Burn ban pipeline alert", body: "ok missed two scheduled source checks.",
  url: "/api/v1/coverage",
  incident: {
    sourceIds: ["ok"], state: "OK", openedAt: Date.parse(at),
    nextStep: "Open your private dashboard bookmark. In Source pipeline, check the last attempt, last success, and dead letters for this source.",
  },
};

const examples = {
  confirmation: renderConfirmationEmail(site, ["40001", "40143"], token, "2026-11-25T16:05:00.000Z"),
  "burn-ban": renderAlertEmail(site, [ban], token),
  "ban-lifted": renderAlertEmail(site, [lifted], token),
  "order-lifted": renderAlertEmail(site, [localLift], token),
  "order-extended": renderAlertEmail(site, [extension], token),
  restrictions: renderAlertEmail(site, [restrictions], token),
  "county-bulletin": renderAlertEmail(site, [countyBulletin(county)], token),
  "multiple-counties": renderAlertEmail(site, [ban, restrictions], token),
  "source-incident": renderAlertEmail(site, [ops], null),
  "operator-simulation": renderAlertEmail(site, [testNotice(county.fips, "test", transition)], token),
  "operator-sandbox": renderAlertEmail(site, [testNotice(county.fips, "test")], null),
  "scheduled-check": renderAlertEmail(site, [testNotice(county.fips, "canary")], null),
};

for (const [name, message] of Object.entries(examples)) {
  test(`${name} matches the text and HTML examples`, () => {
    const parts = { txt: `Subject: ${message.subject}\n\n${message.text}`, html: message.html };
    for (const [extension, content] of Object.entries(parts)) {
      const example = new URL(`../../docs/email-examples/${name}.${extension}`, import.meta.url);
      if (process.env.UPDATE_EMAIL_EXAMPLES === "1") writeFileSync(example, content);
      expect(content).toBe(readFileSync(example, "utf8"));
    }
    expect(message.subject).not.toMatch(/^Test:|\p{Extended_Pictographic}/u);
    expect(message.html).not.toMatch(/<(?:img|script|link)\b/i);
    expect(message.html.match(/<a href/g)).toHaveLength(
      (name === "multiple-counties" ? 2 : 1) + (message.headers ? 1 : 0),
    );
  });
}

test("the HTML escapes notice and URL values while the text keeps the readable wording", () => {
  const message = renderAlertEmail(site, [{ ...ban, body: 'Source says <open> & "check".' }], "a+b&c");
  expect(message.text).toContain('Source says <open> & "check".');
  expect(message.html).toContain("Source says &lt;open&gt; &amp; &quot;check&quot;.");
  expect(message.html).toContain("unsubscribe?token=a%2Bb%26c");
});

test("conflicting or unknown reports never claim that a ban was lifted", () => {
  const unknown = transitionNotice({ ...transition, oldStatus: "ban", newStatus: "unknown" }, { ...county, status: "unknown" });
  const disputed = transitionNotice({ ...transition, oldStatus: "ban", newStatus: "none" }, { ...county, status: "none", conflict: true });
  for (const notice of [unknown, disputed]) {
    const message = renderAlertEmail(site, [notice], token);
    expect(message.subject).toBe("Burn status update for Tulsa County, OK");
    expect(message.text).not.toMatch(/lifted|✅/);
  }
});

test("verified order updates preserve their scope and effective date", () => {
  for (const notice of [localLift, extension]) {
    const oldNotice = { ...notice, emailStatus: undefined };
    const rendered = renderAlertEmail(site, [notice], token);
    expect(rendered).toEqual(renderAlertEmail(site, [oldNotice], token));
    expect(rendered.text).toContain(notice.title);
    expect(rendered.subject).toMatch(/^Burn order (lifted|extended) in Tulsa County/);
  }
});
