# Is There a Burn Ban? Where to list it and who to show it to

This memo ranks where to list isthereaburnban.com and where to bring it so people use it. It covers three groups: MCP and agent directories, search and agent indexing, and people in places where they already check burn bans. It assumes launch on isthereaburnban.com, not the preview URL.

Date: 2026-11-24. All venue rules below were checked on 2026-11-24 unless marked otherwise. Check them again before acting on this memo later.
Scope: research only. Nothing was submitted, posted or sent.

## Short answer

- **First people to reach: Mississippi newsrooms covering this month's drought burn bans.** Start with WLBT's news-tip form ([contact page](https://www.wlbt.com/about-us/contact-us/)), which ran a Hinds County burn-ban story today. Give them a list they can use without linking to the site: every Mississippi county under a ban, its expiry date, and the Mississippi Forestry Commission link for each.
  - Why: newsrooms already put together these lists by hand. Their readers are the people asking "can I burn?". Mississippi has 48 counties under a ban in the live data right now.
  - When: the day after the real domain is live, but only if Mississippi still has 10 or more bans. If not, run the same pilot with Oklahoma and Texas newsrooms in February, before Oklahoma's March fire peak.
- **Plumbing to do on the day the domain goes live**, whatever happens with the pilot:
  1. Publish to the official MCP Registry as `com.isthereaburnban/burn-ban`. Glama picked up Sam's earlier registry entry on its own.
  2. Submit the sitemap in Google Search Console and Bing Webmaster Tools.
  3. Send IndexNow and Brave submissions.
  4. Submit to Anthropic's Connectors Directory. Self-serve; it lists as Community by default.
  5. Add PRs to `awesome-remote-mcp-servers` and `public-apis`.
- **Fix before listing anywhere that reviews tools:**
  - The four MCP tools have no `title` and no `readOnlyHint`/`destructiveHint` annotations.
  - There is no `/privacy` or `/terms` page (both return 404). The email signup collects addresses.
  - There is no analytics or referrer view, so no signal in this memo can be seen yet.
- **Skip or defer:**
  - Smithery: curated, no self-serve intake.
  - PulseMCP: intake paused.
  - Cline marketplace: stale repo, built for GitHub installs.
  - RapidAPI: a paid marketplace, wrong fit for a keyless free API.
  - Paid fast tracks on mcp.so ($39) and MCP Market ($29).
  - Product Hunt.
  - ChatGPT plugin directory: wait until after the Anthropic listing. It needs identity verification, 5+3 test cases, a demo video and terms of service.

## Desired response and audience

| Audience | The job they're doing | What they'd do if it helped | How we'd see it |
| --- | --- | --- | --- |
| Rural landowners, people burning brush piles and leaves, campers in covered states | "Can I burn this weekend, and who says so?" | Check their county page, bookmark it, sign up for alerts | County-page visits, alert signups, referrals |
| Local newsrooms, county emergency managers, extension agents (intermediaries) | Publish "these counties have burn bans" lists, often compiled by hand | Link to or cite the list, or reuse the plain-text answer | Story links, referral sessions from news domains |
| Agent and MCP builders, people using Claude or ChatGPT | Give an assistant a reliable answer to "is there a burn ban in X?" | Add the connector, call `check_burn_ban` | Requests to `/mcp` and `/api/v1/status`, registry and directory listings |

## Readiness gate (what must be true before anything public)

Checked against the preview deployment and the repo on 2026-11-24.

| Gate | Status | Blocks |
| --- | --- | --- |
| Real domain serves the Worker. isthereaburnban.com still serves the old Next.js page (empty `<title>`) | Not yet | Everything below. Never list the workers.dev URL |
| Canonicals already point to `https://isthereaburnban.com/...` (checked on `/us/ok/tulsa-county/`) | Done | — |
| MCP tools have `title` plus `readOnlyHint: true` (`check_burn_ban`, `list_active_bans`, `coverage`) and `readOnlyHint: false, destructiveHint: false` (`subscribe_email_alerts`). `tools/list` on the preview returns `title: None, annotations: None` for all four | Missing | Anthropic directory (required), Glama quality score, ChatGPT |
| `/privacy` (what is collected for email and push alerts, how long it's kept, how to unsubscribe, contact) and `/terms`. Both return 404 | Missing | Anthropic directory (privacy URL), ChatGPT (privacy, terms and support URLs) |
| `/.well-known/mcp-registry-auth` with an Ed25519 public key, plus a `server.json` in the repo | Missing | Official MCP Registry publish |
| IndexNow key file in `public/` | Missing | IndexNow |
| Analytics with referrers (Cloudflare Web Analytics is free), plus a count of MCP tool calls by tool name. `invocation_logs` is off on purpose because the ops URL holds a credential | Missing | Seeing any success signal |
| Data spot check: today Hinds County, MS returned "Expires 2026-12-18", which matches [WLBT](https://www.wlbt.com/2026/11/24/lingering-extreme-drought-extends-hinds-county-burn-ban-impacting-businesses/) | One match | Newsroom pilot credibility (spot-check 5 more MS counties against MFC before sending) |

Owner approvals still needed: Sam sends anything that goes out in his name (PRs, tips, directory accounts). The pilot needs no rights clearance beyond linking official sources. Texas data is noncommercial-with-attribution, per the revival memo. Do not offer a bulk Texas download to commercial users.

---

## 1. MCP and agent directories

Ranked by payoff for effort. Rules checked 2026-11-24.

### 1.1 Official MCP Registry
- **Surface:** `https://registry.modelcontextprotocol.io`, publish through `/v0/auth/http` then `/v0/publish`.
- **Who uses it:** client and aggregator crawlers (Glama, PulseMCP when it reopens, and others) plus builders searching the API. It's upstream of most other directories.
- **Precedent:**
  - Sam's own `com.samcarlton.ecosystem/tulsa-ecosystem-map` (published 2026-11-15). Glama now lists it as unclaimed with a TDQS grade "A, 3.7/5" and "Healthy" status ([Glama page](https://glama.ai/mcp/connectors/com.samcarlton.ecosystem/tulsa-ecosystem-map)). The listing appearing without Sam adding it is an inference that Glama picks up registry entries.
  - Neighbours already listed: `com.olyport/wildfire`, `com.olyport/drought`, `com.daedalmap/wildfires`.
  - Searching `burn` returns no burn-ban server ([API](https://registry.modelcontextprotocol.io/v0/servers?search=burn)).
- **What to bring:** `server.json` with schema `2025-12-11`, `name: com.isthereaburnban/burn-ban`, and a `description` of 100 characters or fewer (schema limit). Draft: "Is there a burn ban? US county status from official state sources, by ZIP, city, coordinates or FIPS." Add a `remotes` entry `{type: streamable-http, url: https://isthereaburnban.com/mcp}` and `websiteUrl: https://isthereaburnban.com/developers/`.
- **Gate:** domain live; HTTP auth file at `/.well-known/mcp-registry-auth` (no redirect). DNS TXT auth is the alternative if the Worker can't serve it. The key goes in `~/.config/mcp-registry/isthereaburnban-ed25519.pem`, never in the repo.
- **Effort:** 30 minutes, reusing the ecosystem steps in `memories/brain/codebase/tulsa-ecosystem-map/discovery-and-deploys.md`.
- **Sam's approval:** no account needed; signing uses the domain key. It goes public under his domain, so confirm before publishing.
- **Signal:** `https://registry.modelcontextprotocol.io/v0/servers?search=isthereaburnban` returns it. A Glama connector page shows up within days.

### 1.2 Anthropic Connectors Directory (Claude)
- **Surface:** [claude.ai/directory/manage](https://claude.ai/directory/manage) → Submit new → MCP connector.
- **Who uses it:** Claude users browsing connectors. It's the largest consumer-facing MCP surface Sam can reach without a sales process.
- **Rules ([submission doc](https://claude.com/docs/connectors/building/submission), checked 2026-11-24):**
  - Any paid Claude plan can submit. The server must be remote HTTPS. "No authentication for public data" is allowed.
  - "Every tool has a `title` and a `readOnlyHint` or `destructiveHint` annotation."
  - You need a documentation URL, privacy policy URL, support contact and icon. The listing allows a 100-character name, 200-character one-liner and 2,000-character description. The slug is permanent.
  - Seven compliance acknowledgments.
  - Submissions are "scanned automatically… and, by default, lists it as a Community connector with no action from you."
- **Precedent:** no specific comparable listing was opened. The rule text is the evidence here.
- **What to bring:** `/developers/` as the docs URL, plus a one-liner such as "Check US county burn bans from official state sources, with the source link and time checked." Under Data handling, pick "third party's API you don't control": state agencies' feeds, normalized.
- **Gate:** tool annotations, `/privacy`, and testing as a custom connector in Claude first.
- **Effort:** half a day, including the fixes.
- **Sam's approval:** needs his paid Claude account.
- **Signal:** status "Published/Community" in the portal, then MCP calls with Claude's user agent.

### 1.3 Glama connectors
- **Surface:** `https://glama.ai/mcp/connectors`. Sign in to claim or add. The page header says 52,081 connectors.
- **Who uses it:** builders comparing servers by tool-quality score. A Glama connector is also required for 1.4.
- **Precedent:** Sam's ecosystem connector, above.
- **What to bring:** claim the auto-created page after the registry publish. Add it by hand only if it hasn't appeared after a week.
- **Gate:** the registry publish. Annotations raise the score.
- **Effort:** 10 minutes.
- **Sam's approval:** his sign-in to claim.
- **Signal:** the page exists, shows "Healthy", and scores A.

### 1.4 punkpeye/awesome-remote-mcp-servers
- **Surface:** [repo](https://github.com/punkpeye/awesome-remote-mcp-servers): 3.9k stars, last push 2026-11-23. Merges on 11-22 and 11-23 (e.g. [#5686](https://github.com/punkpeye/awesome-remote-mcp-servers/pull/5686)). 200 or more PRs are open.
- **Rules ([CONTRIBUTING](https://github.com/punkpeye/awesome-remote-mcp-servers/blob/main/CONTRIBUTING.md)):**
  - Endpoint must answer `initialize` (CI checks).
  - Must be listed as a Glama connector with its badge (CI checks).
  - "PRs are not merged unless the account opening them has starred the repo."
  - 3-line entry with the 🔓 marker and a description of 120 characters or fewer.
  - Agent-made PRs have used a `🤖🤖🤖` title suffix (e.g. [#4956](https://github.com/punkpeye/awesome-remote-mcp-servers/pull/4956)). Disclose that an AI prepared the PR.
- **Not the main list:** `punkpeye/awesome-mcp-servers` (98k stars) says remote-only servers belong in the remote list.
- **Gate:** Glama connector exists.
- **Effort:** 20 minutes.
- **Sam's approval:** his GitHub account (star plus PR).
- **Signal:** merged; GitHub referrals.

### 1.5 public-apis/public-apis
- **Surface:** [repo](https://github.com/public-apis/public-apis): 501k stars, merges as recent as 2026-11-22.
- **Rules ([CONTRIBUTING](https://github.com/public-apis/public-apis/blob/master/CONTRIBUTING.md)):**
  - Free access required; "not a marketing tool".
  - One link per PR. Title format `Add X API`. Description of 100 characters or fewer. No TLD in the name and the name can't end in "API".
  - There is now an MCP Servers section with an `Install` column that tracks Cursor, Anthropic and Glama listings ("Only link to listings that exist").
- **Precedent:** [Add kanari API](https://github.com/public-apis/public-apis/pull/6920), a wildfire-detections API with no auth and CORS, was merged into Environment on 2026-08-17.
- **What to bring, as two separate PRs:**
  - `| [Is There a Burn Ban](https://isthereaburnban.com/developers/) | US county burn ban status from official state sources | No | Yes | Yes |` under Environment.
  - Later, an MCP Servers row (`HTTP` transport), once the Anthropic and Glama listings exist.
- **Gate:** domain live.
- **Effort:** 20 minutes each.
- **Sam's approval:** his GitHub account.
- **Signal:** merged; developer API traffic with no browser referrer.

### 1.6 ChatGPT plugin directory (formerly "apps")
- **Surface:** platform.openai.com plugins dashboard ([submission doc](https://developers.openai.com/apps-sdk/deploy/submission), checked 2026-11-24).
- **Rules:**
  - Individual or business verification in the org.
  - All four listing URLs: website, support, privacy, terms.
  - "Initial MCP app review requires exactly five positive and three negative cases."
  - A reviewer-accessible demo video.
  - Domain token at `/.well-known/openai-apps-challenge`.
  - No auth or OAuth only.
  - Whether a server with no UI widget is accepted is **unknown**. The page points to the plugin guidelines, which were not opened.
- **Gate:** everything in 1.2, plus `/terms`, a support URL, a video and verification.
- **Effort:** 1–2 days.
- **Sam's approval:** his OpenAI org and identity verification.
- **Signal:** approved, then published.
- **Ranking:** after Anthropic. Do it once 1.2 shows real use.

### 1.7 Free-queue directories (don't pay)
- **mcp.so** ([submit](https://mcp.so/submit)): "Remote Server" type; asks for a repo URL. The repo `ThatGuySam/isthereaburnban` is public. Paid fast track is $39.
- **MCP Market** ([submit](https://mcpmarket.com/submit)): GitHub repo or "Remote MCP". $29 one-time; whether a free path exists is not stated.
- Low effort but slow; unknown uptake. Do them on a quiet afternoon.

### 1.8 Skip or recheck later
- **Smithery:** now "part of Arcade". Connection services shut down 2026-10-31. It "will remain as a public (non-proxied) MCP registry" with a curated set of verified servers. No intake is described ([/future](https://smithery.ai/future)).
- **PulseMCP:** "We are not accepting new MCP server or client submissions right now". It will pick up registry entries "once we are back" ([submit](https://www.pulsemcp.com/submit)). The registry publish covers it.
- **Cline MCP Marketplace:** issue-based and repo-oriented. Last push 2025-06-24, with 3,663 open issues ([repo](https://github.com/cline/mcp-marketplace)). Poor fit for a hosted server.
- **cursor.directory:** returned HTTP 429 to both fetch attempts; intake is unknown. Sam can open `cursor.directory/mcp` in a browser to resolve it. public-apis tracks it as a marketplace, so it's worth one look.
- **APIs.guru:** [add form](https://apis.guru/add-api/) creates an issue. More than 1,000 issues are open, though a few were closed "completed" this month. Optional, low priority. The OpenAPI file is already public.
- **RapidAPI:** skip. It's a paid-API marketplace, and a keyless free API gains nothing there.

## 2. Search and agent discovery

Most real demand is someone searching "[county] burn ban" during a dry week. This group matters more than any directory.

| # | Surface | What to do | Gate | Signal | Sam's account? |
|---|---|---|---|---|---|
| 1 | **Google Search Console** (search.google.com/search-console) | Add a Domain property `isthereaburnban.com` (DNS TXT through Cloudflare), or reuse an existing one if the old site had it. Submit `https://isthereaburnban.com/sitemap.xml` (a sitemap index with per-state files). Inspect the home page, one county page and one city page. | Domain live; per-URL `lastmod` is the status-change date, not the build date (revival memo) | Sitemap "Success"; pages indexed in the Pages report; impressions for "burn ban" queries | Yes |
| 2 | **Bing Webmaster Tools** (bing.com/webmasters) | Import from Search Console and submit the sitemap. Bing powers Copilot and most of DuckDuckGo. ChatGPT and other assistants lean on web indexes (inference; no submission form exists for ChatGPT, Claude or Perplexity) | #1 | URL Inspection shows indexed; the IndexNow page shows received URLs | Yes |
| 3 | **IndexNow** (api.indexnow.org) | Add a hex key file in `public/`, deploy, then POST the sitemap URLs. One POST reaches Bing, Yandex, Seznam, Naver, Yep and others. A later step could ping the counties whose status changed each hour. A `403 SiteVerificationNotCompleted` right after deploy is normal; retry | Key file live | 200/202 (received, not indexed) | No (done before by agent) |
| 4 | **Brave Search** ([submit-url](https://search.brave.com/submit-url); returned 429 to a fetch today, worked headless for Sam on 2026-11-15/17) | Submit the home page, `/us/`, `/developers/`, `/map/` and the 3–5 state hubs with active bans (TX, MS, LA, GA). One URL per submission | Domain live | Brave results for `site:isthereaburnban.com` | No |
| 5 | **Cloudflare AI Crawl Control and robots** | The live zone already serves Cloudflare's managed content-signals robots preamble (comments only today), which Cloudflare puts in front of the Worker's `robots.txt`. After cutover, check that `https://isthereaburnban.com/robots.txt` still allows OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User and PerplexityBot. Check in AI Crawl Control that none of them is set to Block: an edge block overrides robots.txt ([AI Crawl Control](https://developers.cloudflare.com/ai-crawl-control/)). Today these bots get 200 from the old site | Domain live | robots.txt body; AI Crawl Control dashboard shows those crawlers "Allowed" and requesting pages | Yes (Cloudflare dashboard) |
| 6 | **Google Dataset Search** | Add one `/data/` page (now 404) with `Dataset` JSON-LD: `name`, a 50–5,000-character `description`, `distribution` → `/api/v1/bans` and `/api/v1/coverage` (JSON), `spatialCoverage: United States`, `temporalCoverage`, `isAccessibleForFree`, `creator`. State the per-source terms instead of a blanket license, because TX and MN restrict reuse ([Dataset docs](https://developers.google.com/search/docs/appearance/structured-data/dataset)) | Code change; domain live | Rich Results Test passes; listed in datasetsearch.research.google.com | No |
| 7 | **Apple (Applebot)** | Nothing to submit. Applebot powers Spotlight, Siri and Safari suggestions; Applebot-Extended only controls AI training ([Apple](https://support.apple.com/en-us/119829)). Keep `User-agent: *` allowed | — | Applebot in logs | No |
| 8 | **Internet Archive Save Page Now** | Save the home page, `/developers/` and `/llms.txt` once. Cheap provenance | Domain live | Snapshot exists | No |
| 9 | **Marginalia, Exa** | Marginalia: PR adding the domain to `sites.txt` in [submit-site-to-marginalia-search](https://github.com/MarginaliaSearch/submit-site-to-marginalia-search). Exa: email support@exa.ai with sitemap and robots | Domain live | Indexed | Yes (PR or email in his name) |
| 10 | **llms.txt directories** (directory.llmstxt.cloud, llmstxt.site, llmstxthub.com all respond) | Optional. Google says llms.txt neither helps nor hurts, and no evidence was found that these directories send users. Skip unless it takes under 5 minutes | — | — | — |

## 3. People and communities

### Seasonality (when to show up)

- **Right now:** the drought burn-ban wave is active.
  - Live data at 07:09 UTC today: 212 counties under ban. By state: TX 82, MS 48, GA 27, LA 27, MI 10, CO 8, FL 4, WA 2, plus 1 each in AZ, IN, MN and OK.
  - This week's news: [Hinds Co., MS extended to Dec 18](https://www.wlbt.com/2026/11/24/lingering-extreme-drought-extends-hinds-county-burn-ban-impacting-businesses/) (a tree service there says brush is "piling up"); [Sullivan Co., IN](https://www.wwbl.com/2026/11/23/burn-ban-issued-in-sullivan-county/); [Crawford Co., IL](https://www.wthitv.com/2026/11/19/burn-ban-declared-crawford-county-illinois/); [Garland Co., AR](https://www.hotsr.com/news/2026/nov/17/garland-county-burn-ban-remains-as-historic/).
  - IL, AR and VA are not covered by live feeds, so expect "doesn't cover my state" replies.
- **Next wave: Oklahoma and the Plains, late February through April.** OSU Extension says dormant-season fire activity is greatest November–April and "March is the peak month… followed by April" ([OSU](https://extension.okstate.edu/programs/emergency-and-disaster-preparedness/wildfire/recent-moisture-effect-on-wildfire); [KOCO](https://www.koco.com/article/oklahoma-fire-danger-friday/70020588)).
- **Possible spike, unverified:** Texas and Oklahoma counties often add fireworks limits around New Year's during drought. This is an inference; not checked.
- **Western campfire restrictions: summer.** Treat campers and backpackers as a June–September audience, and only where the western land-manager coverage is solid.
- **Trends data:** Google Trends wasn't opened. Seasonality rests on the agency statements and live counts above.

### Ranked routes

**3.1 Newsrooms in active-ban states (intermediary route). Recommended pilot; see the end of this memo.**
- **Who:** local TV, radio and newspaper web desks. They publish county burn-ban lists every dry spell.
- **Precedent for need:**
  - KISS FM East Texas ran a 7-county list on 2026-08-07, compiled from county Facebook posts and PDFs. It links no tracker and doesn't mention the TFS map ([article](https://1073kissfmtexas.com/ixp/185/p/east-texas-county-burn-ban-2026/)).
  - WLBT's Hinds story today names only one county and has no county list or MFC link.
- **Competitor signal (inference):** burnbantexas.com ships a JSON feed, an embeddable widget and llms.txt "citation guidance" aimed at this kind of reuse ([llms.txt](https://burnbantexas.com/llms.txt)). That suggests competitors see the same route. So "competitors have no API" is now only half true: none has an MCP server, but burnbantexas has a JSON feed.
- **No uptake precedent found:** no article linking a third-party tracker was found. This is the main unknown the pilot tests.
- **What to bring:** the list itself, in the tip email body: county, expiry date, MFC link. It must be usable even if they never link us. Add a line saying the page updates hourly from MFC, and the plain-text endpoint for producers. Disclose that Sam built it, that it's free, and that it has no ads (if true).
- **Approver:** the assignment desk or digital producer.
- **AI rules:** none found for tips. Sam writes the tip himself; agent notes are fine as input.
- **Gate:** domain live, analytics with referrers, and 5 counties spot-checked against MFC.
- **Effort:** 30 minutes.
- **Sam sends it.**

**3.2 r/mcp, then r/ClaudeAI (agent builders).**
- **Who:** MCP builders looking for working public servers.
- **Rules:** **unverified**. reddit.com is blocked to both of this run's fetch tools. Third-party summaries say self-promotion is allowed with disclosure and "Showcase" flair ([ThreadFox summary via search](https://www.threadotter.com/subreddit-rules/mcp)). That's a lead, not the rule. Sam must read the sidebar and rules before posting.
- **What to bring:** a text post that's useful without clicking: the exact MCP config, one sample `check_burn_ban` transcript, and the honest coverage caveat. "unknown" never means you can burn.
- **Gate:** registry listing plus annotations.
- **Signal:** comments asking about coverage or API use; MCP calls in the 48 hours after.
- **Effort:** 30 minutes.

**3.3 Show HN.**
- **Precedent:**
  - [Indigene, "Native plants for where you stand"](https://news.ycombinator.com/item?id=50064470), 2026-10-12: 120 points, 52 comments. Comments raised coverage gaps, location bugs and distrust of LLM-made data. The author answered by naming his open data sources.
  - [Firemaps Spain](https://news.ycombinator.com/item?id=49093528): 16 points, 12 comments.
  - Recent "MCP server" Show HNs since June 2026: median about 5.5 points (n=40, Algolia).
- **Rules ([showhn.html](https://news.ycombinator.com/showhn.html)):** it must be tryable without signup (true); "Don't post quickly-generated one-offs"; "Please don't ask friends to upvote or comment."
- **Fit:** the HN audience mostly isn't the burner. The likely gain is developers using the API and MCP server, plus backlinks.
- **What to bring:** "Show HN: Is There a Burn Ban? – US county burn bans from official feeds, with an API and MCP server". Sam's own first comment covers why a national feed doesn't exist, the four status words, and why "Nope" is only shown where a source vouches for it.
- **Gate:** domain live, plus a coverage story he can defend.
- **Timing:** a weekday morning US time. Better in late Feb or March, when OK and TX bans are in the news, than now.
- **Effort:** 1 hour, plus staying available to reply.

**3.4 State and regional subreddits and Facebook groups (r/oklahoma, r/texas, r/mississippi, county community groups).**
- **Listening only for now.** Rules couldn't be read (Reddit blocked), and no firsthand "where do I check?" threads were retrieved; both search tools returned only news and tracker sites.
- **Possible later action:** reply in an existing ban thread with the official source link first, and only mention the site if asked.
- **Smallest next check:** Sam searches `burn ban` in each sub sorted by new and reads the rules.

**3.5 Homesteading and firewood (r/homestead, r/firewood).**
- **Listening only.** Same access gap. These communities are seasonal and general; a site link without a live question is likely self-promotion.
- **r/BackyardChickens:** no fit.

**3.6 County emergency managers and extension agents.**
- They post ban orders on Facebook and county sites (KISS FM linked those posts).
- **Contribution later:** a "your county's order isn't linked yet" correction loop, so they can send the exact order URL. That improves data and gives them a reason to share.
- No precedent found; the intermediary is unidentified. This is a follow-up after 3.1.

**3.7 Product Hunt and dev newsletters.**
- Low fit. The Product Hunt weather topic shows small apps with 2–4 reviews and no wildfire launches.
- Newsletters only after HN or Reddit traction gives them something to cite.

---

## The one place to start, and a small pilot

**Where:** WLBT (Jackson, MS) news tips, [wlbt.com/about-us/contact-us](https://www.wlbt.com/about-us/contact-us/). Optionally one or two other Mississippi newsrooms whose burn-ban stories Sam finds the same week. Only WLBT's tip channel was confirmed.

**Why this one:**
- It's where people already go to answer "can I burn?" during a live drought.
- The station's own story today lacks the statewide list we have.
- Mississippi is a clean, verified county feed with expiry dates.
- The contribution, a sourced list, helps them even if they never link the site.

**Who acts:** Sam, from his own email, written by him.

**What to send:**
- Two sentences on who he is and that the site is free.
- The pasted list of Mississippi counties under a ban, with expiry dates and the MFC link.
- One line: "this page updates hourly from MFC: https://isthereaburnban.com/us/ms/".
- An offer to answer questions.
- No ask to "feature" the site.

**When:** within 48 hours of the domain going live, while `/api/v1/bans?state=MS` shows 10 or more counties.

**Signal that counts:**
- A published story or web list that cites or links the page, or uses the list.
- Referral sessions from wlbt.com (or another newsroom) within 14 days.
- Or a reply asking for something such as an embed, a Texas version or a correction.

**Stop, revise or switch:**
- No reply and no referral in 14 days: stop pitching Mississippi. Rerun the same format in mid-February with Oklahoma (Tulsa and OKC stations) and Texas newsrooms, ahead of the March peak.
- A reply asking for an embed: build a small sourced embed next.
- A data correction: fix it first, and treat it as the most valuable outcome.
- If Sam would rather start with builders, run 3.2 (r/mcp) after reading its rules.

## Day-the-domain-goes-live checklist (in order)

**[Sam]** means his account or approval is needed. **[agent]** means an agent can run it once Sam says go.

**Before cutover (code)**
1. **[agent]** Add `title` and annotations to all four MCP tools.
2. **[agent]** Add `/privacy` and `/terms`.
3. **[agent]** Add the IndexNow key file.
4. **[agent]** Add `/.well-known/mcp-registry-auth` and `server.json`. Sam generates the key outside the repo.
5. **[agent]** Add the `/data/` Dataset page.
6. **[agent]** Add an aggregate MCP tool-call counter.
7. **[agent]** Change `SITE_URL` in `wrangler.jsonc` to `https://isthereaburnban.com`.

**Cutover day**
1. **[Sam]** Cloudflare: route isthereaburnban.com to the Worker. Turn on Web Analytics. Open AI Crawl Control and confirm OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User and PerplexityBot are Allowed.
2. **[agent]** Verify the live site:
   - `robots.txt` body after Cloudflare's preamble.
   - The sitemap index uses the real host.
   - Home, county and city pages return 200 with no `noindex`; unknown paths return 404.
   - `/mcp` answers `initialize` and `tools/list`, and shows annotations.
3. **[agent, Sam confirms]** Publish to the official MCP Registry. Check `registry.modelcontextprotocol.io/v0/servers?search=isthereaburnban`.
4. **[agent]** Send IndexNow for the sitemap URLs (retry on 403). Send Brave submit for about 8 hub URLs and Internet Archive saves.
5. **[Sam]** Google Search Console: add a Domain property (DNS TXT) and submit `https://isthereaburnban.com/sitemap.xml`. Inspect the home page and one county URL.
6. **[Sam]** Bing Webmaster Tools: import from Search Console and confirm the sitemap.
7. **[Sam]** Test as a custom connector in Claude, then submit to the Anthropic Connectors Directory (paid plan).
8. **[Sam]** Mississippi newsroom pilot: send the tip, if Mississippi still has 10 or more bans.

**Days 2–14**
1. **[Sam]** Claim the Glama connector once it appears.
2. **[Sam, GitHub]** PR to awesome-remote-mcp-servers: star the repo first, add the 🔓 entry and Glama badge.
3. **[Sam, GitHub]** PR to public-apis, Environment section.
4. **[Sam]** Marginalia PR and Exa email (optional). Free mcp.so and MCP Market forms (don't pay).
5. **[Sam]** After reading the r/mcp rules: Showcase post.
6. **[Sam]** Hold Show HN for late Feb or March, and the ChatGPT plugin submission until the Anthropic listing shows use.

## Access gaps and how to close them

| Gap | What was tried | How to resolve |
| --- | --- | --- |
| Reddit rules and firsthand threads (r/mcp, r/homestead, r/oklahoma…) | WebFetch is blocked for reddit.com. A curl search was denied by the permission system. Web search returned no threads | Sam reads the sidebars and searches "burn ban" sorted by new |
| cursor.directory intake | HTTP 429 twice | Open it in a browser |
| ChatGPT: are servers without a UI widget accepted? | Submission doc read; plugin guidelines not opened | Read the plugin guidelines before investing |
| Brave submit page today | 429 to fetch | It worked headless on 2026-11-15/17; use the existing Playwright route |
| Newsroom uptake precedent (a tracker cited by local news) | Two search passes found none | The pilot is the test |
| Whether Glama ingests from the registry or Sam added it | The Glama page shows "unclaimed" | Watch whether the new entry appears unprompted |

## Sources opened for this memo

- MCP Registry API searches (`burn`, `fire`, `wildfire`, `drought`, `com.samcarlton`) and the [2025-12-11 server schema](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json)
- [Anthropic connector submission](https://claude.com/docs/connectors/building/submission)
- [OpenAI plugin submission](https://developers.openai.com/apps-sdk/deploy/submission)
- [Smithery /future](https://smithery.ai/future)
- [PulseMCP submit](https://www.pulsemcp.com/submit)
- [mcp.so submit](https://mcp.so/submit)
- [MCP Market submit](https://mcpmarket.com/submit)
- [Glama connectors](https://glama.ai/mcp/connectors)
- CONTRIBUTING files: awesome-remote-mcp-servers, awesome-mcp-servers, public-apis. README for APIs.guru and cline/mcp-marketplace (through `gh api`)
- [Google Dataset docs](https://developers.google.com/search/docs/appearance/structured-data/dataset)
- [Cloudflare AI Crawl Control](https://developers.cloudflare.com/ai-crawl-control/)
- [Applebot](https://support.apple.com/en-us/119829)
- [Show HN rules](https://news.ycombinator.com/showhn.html) and HN Algolia searches
- Newsroom articles linked above
- Live probes of the preview `/mcp`, `/api/v1/bans`, pages and robots; old isthereaburnban.com robots and pages; competitor `/llms.txt`, `/openapi.json` and `/mcp`
