# Washington fixtures

The captures are dated in UTC. It was still November 23 in Washington.

| File | Capture time (UTC) | Request URL |
| --- | --- | --- |
| `ecology-burn-bans-2026-11-24.html` | 2026-11-24 06:23:13 | [Washington Ecology burn bans](https://ecology.wa.gov/air-climate/air-quality/smoke-fire/burn-bans) |
| `puget-status-2026-11-24.html` | 2026-11-24 06:23:13 | [Puget Sound Clean Air status grid](https://secure.pscleanair.org/AirQuality/BurnBan) |
| `king-fire-safety-2026-11-24.html` | 2026-11-24 06:34:10 | [King County Sitecore content host](https://cd.kingcounty.gov/en/dept/local-services/governance-leadership/local-government-for-unincorporated-king-county/fire-safety) |

All returned HTTP 200 to the fetcher user agent in `docs/fetchers.md`. Ecology's excerpt retains the current heading, policy text, both dated stage tables, and the adjacent reservation table. King County's excerpt retains the jurisdiction summary and the entire current-status block. Puget Sound retains the entire response. Line endings are normalized for Git. Tests simulate active Puget Sound and King County stages using the publisher's [grid CSS codes](https://secure.pscleanair.org/AirQuality/css/BurnBan/BurnBans.css) and [fire safety stage labels](https://kingcounty.gov/en/dept/local-services/governance-leadership/local-government-for-unincorporated-king-county/fire-safety).
