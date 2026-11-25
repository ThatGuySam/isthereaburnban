// @ts-nocheck -- bun test types aren't installed.
import { expect, test } from "bun:test";
import { parseArcherRescission, parseBexarRescission, txBexarCountyIssuer } from "./county-issuers";

const now = new Date("2026-11-24T22:45:00Z");
const archerOrder = "/upload/page/1317/2026/20261006_BURN_BAN_LIFTED.pdf";
const archer = `
<div class="headline" style="text-align: center;"><span>Burn Ban Lifted</span></div>
<div class="headline">&nbsp;</div><div class="headline">Current Burn Ban Status for Archer County</div>
<p><a href="${archerOrder}">Burn Ban Lifted Order</a></p><p>Effective Date: October 6th, 2026</p>`;
const digest = async () => "7a10da76ef59b3a673312f79b46c2487e0809cfe8870a329bc0bc113e653c3dc";
const bexar = `<link rel="canonical" href="${txBexarCountyIssuer.sourceUrl}">
<meta itemProp="datePublished" content="2026-11-03T14:32:56.086-08:00">
<meta itemProp="headline" content="🔥 BURN BAN LIFTED IN UNINCORPORATED BEXAR COUNTY 🔥">
<meta property="og:image:alt" content="Cover image for Bexar County Commissioners">
<meta name="description" content="The burn ban for unincorporated areas of Bexar County has been officially lifted, effective immediately.">`;
const advisory = "<h1>Fire Marshal</h1><p>Burning is NOT recommended today, Tuesday, November 24, 2026.</p>";

test("Archer's current page must link to the reviewed signed rescission", async () => {
  expect((await parseArcherRescission(archer, now, digest))[0]).toMatchObject({
    fips: "48009", issuerFor: "tx", status: "none", since: "2026-10-06",
    officialUrl: `https://www.co.archer.tx.us${archerOrder}`,
  });
  await expect(parseArcherRescission(archer, now, async () => "a different document")).rejects.toThrow("requires review");
  await expect(parseArcherRescission(archer.replace("Burn Ban Lifted</span>", "Burn Ban in Effect</span>"), now, digest)).rejects.toThrow("requires review");
});

test("Bexar uses the county's dated agency post and requires a current advisory", async () => {
  expect((await parseBexarRescission(bexar, advisory, now))[0]).toMatchObject({
    fips: "48029", issuerFor: "tx", since: "2026-11-03", documentId: "523172242", status: "none",
    officialUrl: txBexarCountyIssuer.sourceUrl,
  });
  await expect(parseBexarRescission(bexar.replace("Bexar County Commissioners", "Generic Account"), advisory, now)).rejects.toThrow("announcement");
  await expect(parseBexarRescission(bexar, advisory + "<p>Burn Ban in Effect as of November 24.</p>", now)).rejects.toThrow("needs review");
});
