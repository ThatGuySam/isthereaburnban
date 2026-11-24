# Plan: isthereaburnban revival research (2026-11-23)

## Restatement
Research how to rebuild isthereaburnban.com (old: Next.js 9 on Vercel, Oklahoma + Texas only, county-level, OK via ArcGIS feature service, TX via a text list of counties) as an ultra-simple, mostly static site on Cloudflare with: zip lookup, optional map to pick a spot, link to the official burn ban page / ArcGIS source per area, coverage of as many US states as public data allows (broader if cheap), web push + email alerts for nearby bans, SEO surface area, and an agent-friendly interface. Then build a prototype and deploy to a Cloudflare preview for review.

User's words: "I kind of want to get it statically rendered. I kind of want to do astro. I don't know if that's a good deal. I want to get it shifted onto Cloudflare though, for sure." "I want the core of the product to still be ultra, ultra simple."

Ruled out: nothing explicit. Not researched: monetization, non-burn-ban fire data products beyond what helps coverage.

Unstated (do not assume): whether the live domain moves now (assume preview only); paid services budget (prefer free tiers); whether non-US matters (US first).

## Size and budget
Deep. Strong seats: Codex Sol (data/coverage, Reddit), Claude Opus (SEO + agent interface), Codex Astra (stack + alerts). Lead: old repo, Cloudflare account, merge. One round. Max two seats at once. Stop at 40 min, kill at 45.

Local context: old repo read (helpers/getOKBurnBans.js, getTXBurnBans.js, messages.js). Wrangler logged in to account "Sam Carlton Creative" with workers + KV write.

## Seat table
| Seat | Model | Effort | Emphasis | Start | End |
| --- | --- | --- | --- | --- | --- |
| Codex Sol | gpt-6.2-sol | high | Data/coverage, Reddit | 2026-11-23T18:24:08-06:00 | 18:45:22 |
| Claude Opus | opus | high | SEO + agent interface | 2026-11-23T18:24:08-06:00 | 18:29:49 |
| Codex Astra | gpt-6.2-astra | high | Stack + alerts | 2026-11-23T18:29:58-06:00 | 19:01:30 |

Commands: ~/.cache/research-team/burnban/run-{sol,opus,astra}.sh (copies in this folder's README-less plan; see references/running-seats.md pattern with --add-dir skill copy).
