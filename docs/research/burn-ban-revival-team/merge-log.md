# Merge log (2026-11-23)

All re-opens by lead via curl, 2026-11-23 ~18:50 CST.

| Claim | Seat(s) | Outcome |
| --- | --- | --- |
| OK county FeatureServer (OklahomaBurnBan__Data_Layer__v_9_0__View) live, 77 counties, Burn_Ban_Status | Opus, Sol, lead | supported (count 77; dataLastEditDate 2026-11-09). Old "Test___..." URL from 2021 config also still answers (lead). |
| TX FeatureServer gis.tfs.tamu.edu EOC/BurnBan with FIPS + BurnBan Yes/No | Sol only | supported (254 rows; FIPS padded with spaces "001       ") |
| TX BURNBAN.txt UTF-16, dated today | Opus, Sol, lead | supported ("Texas Burn Bans - 11/23/2026 10:52:12 AM") |
| FL FFS FeatureServer 67 counties | Opus, Sol | supported (dataLastEditDate 2026-09-02, Burn_Ban "No Burn Ban") |
| IN IDHS WebEOC FeatureServer live | Opus, Sol | supported (93 rows for 92 counties; last edit 2026-11-23) |
| IA DPS Active_Burn_Bans view | Sol only | supported, with a defect: Active_Burn_Ban null in sample and layer last edit 2026-04-27; negatives unverified |
| LA parish FeatureServer | Sol only | supported (64 rows, Burn_Ban1 field, edit 2026-11-21ish) |
| WI DNR JSON | Sol only | supported (danger rating + permit text; not a ban flag per se) |
| MI county MapServer | Sol only | supported (STATUS/PullStamp fields; codes need legend) |
| MN CGI JSON status codes | Sol only | supported (status 2 Todd 2026-11-01; code meaning not checked) |
| Census ZCTA->county file public, 6.8 MB | Opus, Sol | supported (HTTP 200, 6,821,287 bytes) |
| No burn-ban MCP server in official registry | Opus | supported ("burn" search returns unrelated ai.arsentev/contextburn) |
| burnbanradar 47 states / 2,999 counties; burnbanfinder 12 states / 1,106 | Opus, Sol | supported (home page text) |
| Competitors have no /api, /openapi.json, /.well-known/mcp.json, llms.txt | Opus | supported for burnbanradar, burndates (api path renders "County not found" HTML), burnbanfinder; burnbancheck llms.txt not re-opened |
| burndates is built with Astro | lead | found by lead during verification (data-astro-cid attributes) |
| Google retired SpecialAnnouncement + FAQ rich results; llms.txt not needed for Google | Opus | not re-opened (Opus read Search Central updates page in full); carried |
| createMcpHandler stateless, McpAgent deprecated | Opus | supported (handler-api index.md) |
| Cloudflare Email Service needs Workers Paid for arbitrary recipients; 3,000/mo included then $0.35/1k | Sol, Astra | supported (pricing page index.md, dateModified 2026-06-09) |
| Workers free: 100k req/day, 5 cron triggers, 20k asset files, 10 ms CPU per request and per cron | Sol, Astra | supported (limits page) |
| No national multi-state live ban feed (NIFC SA_County_BurnBans stale since 2023-12) | Opus, Sol | not re-opened; two independent seats agree |
| Reddit quote, Campfire Map builder | Sol | read by a Codex seat |
| MS Ninja Tables JSON (table 1775) with counties, issued, expires, exemptions | Astra only | supported (rows e.g. Humphreys 9/16/26-12/30/26) |
| OK McCurtain ban marked active but attached resolution named Nov 9-22 | Astra only | not re-opened; carried as an example of stale-positive risk |
| ~10,180 of 33,791 ZCTAs span >1 county | Opus (~10,186), Astra (10,180) | two independent counts agree; not re-opened |
| Resend free 100/day, 3,000/mo | Sol, Astra | not re-opened |
| iOS 16.4+ web push only for Home Screen web apps | Sol, Astra | not re-opened (WebKit post, long-standing) |
| MN license restricts redistributing the entire dataset; TX terms noncommercial with attribution | Astra only | not re-opened; flagged in memo as a rights check before launch |

## Disagreements
- MCP now vs later: Opus recommends a stateless remote MCP from day one (cheap, no competitor has one); Sol says MCP can wait for demand. Lead: build it, since the handler is stateless and shares the API code (lead judgement).
- Snapshot store: Opus suggests KV; Astra notes KV free is 1,000 writes/day and recommends D1. Lead: one KV key per hourly snapshot (24 writes/day) is within free; D1 for subscriptions.

## Seat table
| Seat | Emphasis | Round 1 |
| --- | --- | --- |
| Codex Sol (gpt-6.2-sol, high) | Data and coverage, Reddit | 21 min (18:24-18:45 CST), 5 only-this-seat findings in the memo (TX FIPS FeatureServer, IA, LA, MI/WI feeds, Reddit Campfire Map quote) |
| Claude Opus (opus, high) | SEO and agent interface | 6 min (18:24-18:30), 4 (SpecialAnnouncement/FAQ retired, llms.txt Google statement, no burn-ban MCP in registry, burnbanradar lastmod pattern) |
| Codex Astra (gpt-6.2-astra, high) | Stack and alerts | 32 min (18:30-19:01), 4 (MS JSON feed, McCurtain stale order, KV write budget, us-atlas TopoJSON 250 KB gz) |
| Lead | Old repo, Cloudflare account, verification | old feeds still live, DNS already on Cloudflare, burndates built with Astro |
