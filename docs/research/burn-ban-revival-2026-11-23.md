# Is There a Burn Ban? Rebuild research

This memo covers how to rebuild isthereaburnban.com as a simple, mostly static site on Cloudflare. It covers coverage beyond Oklahoma and Texas, ZIP and map lookup, alerts, and search and agent access.

Date: 2026-11-23
Scope: data sources (US first), stack, alerts, SEO, agent interface. Not covered: monetization, the live-domain cutover date.

## Short answer

Rebuild with Astro on Cloudflare Workers. Prerender the home, state and directory pages. A scheduled Worker polls official feeds every hour, and one shared status function serves county pages, a JSON API and an MCP endpoint. About 20 states publish live machine-readable feeds today. Start with seven county-level states that have clean feeds: OK, TX, FL, IN, LA, MS and IA (Iowa as positive-only). Give every other state a linked official directory and an explicit "can't confirm". Web push works on the free tier. Email to the public needs Workers Paid ($5/mo) or Resend. Main uncertainty: freshness and reuse terms differ by state, so never show "Nope" where the source can't vouch for it.

## What the evidence says

### Data and coverage

- There is no national feed for current burn bans. The multi-state NIFC Southern Area county layer stopped updating in Dec 2023. Fire-restriction data is split across state forestry agencies, fire marshals, county emergency managers and federal land managers ([NWCG restriction standard](https://www.nwcg.gov/node/6270260), [NIFC maps](https://www.nifc.gov/fire-information/maps)).
- The two original feeds still work. The [Oklahoma Forestry county layer](https://services3.arcgis.com/yrIZ0Nv0mSGTWJsH/arcgis/rest/services/OklahomaBurnBan__Data_Layer__v_9_0__View/FeatureServer/0) has 77 counties with a `Burn_Ban_Status` of None, County Burn Ban, Governor's Burn Ban or Ozone Alert, and supports point queries. Texas A&M Forest Service publishes [BURNBAN.txt](https://tfsfrp.tamu.edu/WILDFIRES/BURNBAN.txt) (UTF-16; the 2026-11-23 header said "82 Texas Burn Bans … 10:52:12 AM"). It also has a [FeatureServer with county FIPS codes](https://gis.tfs.tamu.edu/arcgis/rest/services/EOC/BurnBan/FeatureServer/0) (254 rows, `BurnBan` Yes/No, `StartDate`). Official pages: [OFS map](https://experience.arcgis.com/experience/8bdc59b2a54a4383a9a2996fb9407580/), [TFS burn bans](https://tfsweb.tamu.edu/wildfire-and-other-disasters/burn-bans-and-information/).
- These county-level feeds were re-opened and answered on 2026-11-23:
  - [Florida FFS](https://services3.arcgis.com/XYg2eF8UuxZVuVmF/arcgis/rest/services/Burn_Ban_Public_View_v2_4118cfe50dba49efa3d6fa7326d5a87f/FeatureServer/0): 67 counties, last edit 2026-09-02.
  - [Indiana DHS](https://services8.arcgis.com/mRWfR9ONMmLivkAh/arcgis/rest/services/WebEOC_prod_BurnBans/FeatureServer/0): 93 rows for 92 counties, edited today.
  - [Louisiana parishes](https://services3.arcgis.com/uymqJ6hE4wvB3E9t/arcgis/rest/services/Burn_Ban1/FeatureServer/3): 64 parishes.
  - [Iowa DPS](https://services.arcgis.com/vPD5PVLI6sfkZ5E4/arcgis/rest/services/Active_Burn_Bans_%28View%29/FeatureServer/0): 99 counties, but its fields are null when there is no ban and the layer was last edited 2026-04-27. Treat Iowa as positive-only.
  - [Mississippi Forestry JSON](https://www.mfc.ms.gov/wp-admin/admin-ajax.php?action=wp_ajax_ninja_tables_public_action&table_id=1775&target_action=get-all-data): counties with issued and expiry dates and exemptions. The human page is [MFC burn bans](https://www.mfc.ms.gov/burning-info/burn-bans/).
- Permit or danger systems (not bans in the strict sense) have feeds in [Wisconsin](https://apps.dnr.wi.gov/forestryapps/burnrestriction/json/), [Michigan](https://gisp.mcgi.state.mi.us/arcgis/rest/services/DNR/Burn_Permits/MapServer/1) and [Minnesota](https://maps.dnr.state.mn.us/cgi-bin/mapserv/burning_restrictions?mode=nquery). These need their own labels, such as "permits required".
- Western states publish restrictions by land manager rather than by county: ND, WY, MT, UT, NV, NM, AZ, ID and WA all have ArcGIS layers. Each needs polygon matching and its own interpretation (not re-opened; listed in the seat notes).
- Feeds are blocked or missing in several states. AR's map fails TLS. OR's restriction layer needs a token. CA, KY and the WA Ecology pages refused direct fetches. The New England states and most of the Mid-Atlantic run on town permits or seasonal rules with no live feed.
- Seasonal rules can be encoded as calendar facts: NY brush burning March 16–May 14, the GA EPD summer ban in 54 counties May 1–Sept 30, the Ohio daytime limits, and the VA 4 p.m. law Feb 15–Apr 30 (not re-opened).
- Stale data is a real risk. Oklahoma still marked McCurtain County under a ban on 2026-11-23, while its attached resolution was dated Nov 9–22 (not re-opened). Tennessee's county layer was last edited in March 2024.
- Reuse terms. Most ArcGIS items leave `licenseInfo` blank. Texas allows noncommercial use with attribution. Minnesota restricts redistributing its whole dataset. Link to the official sources and store normalized facts. Check the terms state by state before offering a bulk download (not re-opened).

### ZIP and map

- The [Census ZCTA-to-county file](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt) is public (6.8 MB). About 10,180 of 33,791 ZCTAs cross a county line; 74008, for example, is in both Tulsa and Wagoner counties. A ZIP lookup must therefore return every candidate county. HUD's crosswalk is better for weighting but needs a login.
- `us-atlas` county TopoJSON is about 250 KB gzipped ([file](https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json)). That is enough for a browse map drawn from outlines alone, with no tile server. The [Census coordinates geocoder](https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=-95.9928&y=36.154&benchmark=Public_AR_Current&vintage=Current_Current&format=json) resolves a point to a county FIPS code without a key.

### Stack

- Astro prerenders by default. It lets single routes opt into on-demand rendering on Cloudflare, and ships no client JS unless a component asks for it ([on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/), [Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)). One competitor, burndates.com, is itself built with Astro (found by lead during verification).
- Workers Free covers 100,000 dynamic requests a day, 5 cron triggers, and 10 ms of CPU per request and per cron run. Static asset requests are free and unlimited, up to 20,000 files per version ([limits](https://developers.cloudflare.com/workers/platform/limits/)). Network wait does not count toward CPU, so fetching and normalizing small county feeds fits.
- KV Free allows 1,000 writes a day, so one snapshot key written hourly (24 writes) fits. D1 Free is enough for subscriptions ([KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)).
- The domain's nameservers are already on Cloudflare (art/karina.ns.cloudflare.com) and currently proxy to Vercel. Cutting over is a route change (lead).

### Alerts

- Web push from a Worker uses VAPID keys and a service worker. [Cloudflare's example](https://github.com/cloudflare/agents/blob/main/docs/agents/push-notifications.md) shows the pattern, and [`@block65/webcrypto-web-push`](https://github.com/block65/webcrypto-web-push) does it with Web Crypto. On iOS 16.4+, push works only after the user adds the site to the Home Screen ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- Email: [Cloudflare Email Sending](https://developers.cloudflare.com/email-service/platform/pricing/) needs Workers Paid to reach arbitrary recipients; it includes 3,000 emails a month, then $0.35 per 1,000. [Resend](https://resend.com/pricing) Free allows 100 a day and 3,000 a month, which a single ban with a few hundred subscribers would exceed. Use double opt-in and one-click unsubscribe. CAN-SPAM rules depend on the message's primary purpose ([15 USC 7704](https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap103-sec7704.htm)).

### SEO

- Google's spam policy names "scraping feeds … to generate many pages … where little value is provided" and city doorway pages ([spam policies](https://developers.google.com/search/docs/essentials/spam-policies)). County pages are safe when each one carries a real, changing fact plus the official link, the date the status changed, the scope and neighboring counties. Indexed ZIP pages and keyword-variant pages are not.
- Google retired SpecialAnnouncement rich results in 2025 and FAQ rich results in May 2026, and says llms.txt neither helps nor hurts Search ([Search Central updates](https://developers.google.com/search/updates); not re-opened). Use BreadcrumbList, WebPage `dateModified` and one Dataset.
- Google trusts `lastmod` only when it is accurate ([sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)). Set it to the date the status changed, not the build date. burnbanradar stamps all 3,046 county URLs with the same day (not re-opened).

### Agents and competitors

- Competitors: [burnbanradar.com](https://burnbanradar.com/) claims 47 states and 2,999 counties. [burnbanfinder.com](https://burnbanfinder.com/) covers 12 states and 1,106 counties, and began tracking on Nov 17, 2026. [burndates.com](https://burndates.com/about/) also has county pages. None of the three has `/api`, `/openapi.json`, `/.well-known/mcp.json` or `llms.txt` (all re-opened 2026-11-23).
- The official MCP registry has no burn-ban server. A search for "burn" returns an unrelated tool ([registry API](https://registry.modelcontextprotocol.io/v0/servers?search=burn)).
- Cloudflare's [`createMcpHandler`](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/) is stateless and needs no Durable Object, so an MCP endpoint is a thin wrapper around the same status function.
- A practitioner warning, from the builder of Campfire Map: "areas with no coloring do not represent a lack of restrictions" ([r/PNWhiking](https://www.reddit.com/r/PNWhiking/comments/1vqk9pv/campfire_map_for_western_us/); read by a Codex seat).

## What works

- Four status words instead of two: **Yes** (ban), **Nope** (the source covers the area and reports none), **Restrictions** (partial, or permits only), and **Can't confirm** (no feed, stale data or ambiguous). Every answer names the jurisdiction, the time it was last checked, and links to the official page.
- Static pages for the hierarchy, from home to state to county, with live status rendered from one snapshot.
- A ZIP lookup that returns every county the ZIP touches.
- One keyless GET API with OpenAPI, plain-text output, llms.txt and a stateless MCP endpoint.

## What to avoid

- Showing "Nope" for a state you don't cover, or when a feed fails.
- Indexed ZIP or "near me" keyword pages, and fake `lastmod` dates.
- Sending alerts on the first import or after a feed outage. Diff verified snapshots only.
- Bulk-redistributing datasets whose terms restrict it (MN, NJ, TX commercial use).

## Recommendation

1. Astro static pages plus a custom Worker entry (fetch + scheduled) on Workers Static Assets. Hourly cron writes a normalized snapshot to KV; D1 holds push and email subscriptions.
2. Launch with OK, TX, FL, IN, LA, MS (status) and IA (positive-only). Add a directory linking an official page for all 50 states + DC. Add WI/MI/MN as "restrictions" sources, then western land-manager layers.
3. Ship web push on the free tier. Turn on email once Sam picks Workers Paid (Cloudflare Email Sending) or Resend.
4. Publish `/api/v1/status?zip=|lat&lon=|fips=`, `/api/v1/bans`, `/api/v1/coverage`, `/openapi.json`, `/llms.txt` and `/mcp`. List it in the MCP registry as `com.isthereaburnban/...` after the domain cutover.
5. Before the domain cutover, collect two weeks of snapshots, spot-check them against official orders, and check `robots.txt` and the Cloudflare AI Crawl Control settings so ChatGPT-User and Claude-User aren't blocked.

What would change this: a national feed appearing, or Sam choosing to stay on OK and TX only. In that case plain HTML plus a Worker would be enough and Astro could be skipped.

## Gap table

| Part of the question | Coverage | Missing |
| --- | --- | --- |
| Astro + Cloudflare | Strong | Measured CPU for the largest feed on the free plan |
| Official links per area | Strong (51-area directory) | Per-county official pages (county EM sites) |
| State coverage | Medium: 7 clean county feeds, about 12 more scoped feeds | KY/AR/CA/OR backends; per-feed update timing; rights |
| ZIP lookup | Strong | HUD weighting (login needed) |
| Map | Strong | — |
| Public data inventory | Medium-strong | National aggregator: none found |
| Push + email | Strong on design | Real-device delivery tests; Sam's plan choice |
| SEO + agents | Strong | Actual rank data for "burn ban [county]" queries |

Questions for Sam that close gaps faster than more searching:
- Is Workers Paid ($5/mo) on this account acceptable? It unlocks Cloudflare email and removes the 10 ms CPU risk.
- Is this a commercial site (ads or affiliate links)? Texas terms invite noncommercial use.

Proposed next wave, if wanted: a single Codex seat to find working backends for KY, AR, CA and OR, plus per-county official page URLs for the launch states.

## Links safe to share

- https://forestry.ok.gov/burn-ban-info
- https://tfsweb.tamu.edu/wildfire-and-other-disasters/burn-bans-and-information/
- https://www.in.gov/dhs/burn-ban-map/
- https://www.mfc.ms.gov/burning-info/burn-bans/
- https://www.fdacs.gov/CurrentWildfireInfo
- https://developers.google.com/search/docs/essentials/spam-policies
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/email-service/platform/pricing/
- https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/
- https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt

## For Sam to open

- https://mip.agri.arkansas.gov/agtools/Forestry/Fire_Info (TLS failure)
- https://eec.ky.gov/Natural-Resources/Forestry/wildland-fire-management/pages/county-burn-bans.aspx (403 to curl)
- https://burnpermit.fire.ca.gov/current-burn-status/ (403 to curl)

## Receipt

Run `burnban-2026-11-23`. Skills: sams-research-team v2.1, sams-research. Three parallel research notes plus lead verification. 24 claims re-opened: 21 supported, 1 supported with a defect (Iowa null fields), 0 not supported, 0 could not open, plus 1 read by a Codex seat (Reddit). Others carried and marked "not re-opened". Notes, briefs and the merge log are in [burn-ban-revival-team/](burn-ban-revival-team/).
