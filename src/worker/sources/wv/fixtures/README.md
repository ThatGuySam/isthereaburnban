# West Virginia source capture

- `forestry-fire-laws-2026-11-24.json` is the unmodified WordPress REST response captured at 2026-11-24 13:16:05 UTC. The request used the project User-Agent and `Accept: application/json`. [Exact GET](https://wvforestry.com/wp-json/wp/v2/pages/119?_fields=id%2Cstatus%2Clink%2Cmodified_gmt%2Ccontent) · [Public page](https://wvforestry.com/fire-laws/)
- WordPress reports an April 2, 2024 page edit. The page publishes a standing rule. The October 13, 2026 Emergency Management notice independently confirms this fall's hours. The adapter rechecks the page's identity and the four seasonal paragraphs before projecting Eastern daytime windows. The rule covers all 55 counties and reports covered activities only. [State statute](https://code.wvlegislature.gov/20-3-5/) · [2026 fall notice](https://ready.wv.gov/article/wv-fall-fire-season-oct-1-dec-31)

## Inventory checks on November 24, 2026

| Publisher | Observed via direct GET |
| --- | --- |
| [Forestry fire laws](https://wvforestry.com/fire-laws/) | HTTP 200. The WordPress HTML, seasonal banner and REST page agree on the recurring restriction. The public post search returned historical and educational posts. The danger page links a fire potential forecast. |
| [Commerce release](https://commerce.wv.gov/gov-justice-ends-statewide-ban-on-outdoor-burning-regular-burning-season-regulations-now-in-effect/) | HTTP 200. October 9, 2019 termination of the 2019 statewide ban. The Forestry category feed's latest release was for the 2026 spring season. |
| [Fire Marshal statute PDF](https://firemarshal.wv.gov/media/37361/download) | HTTP 200. Undated copy of § 20-3-5 confirms both seasons and the hours. The Legislature HTML timed out on two direct attempts. The search index and the Fire Marshal PDF allowed the relevant provisions to be cross-checked. |
| [Governor Justice release](https://governorjustice.wv.gov/News/press-releases/2024/Pages/Gov.-Justice-announces-statewide-burn-ban-has-been-lifted.aspx) | HTTP 200. The statewide emergency ban expired November 15, 2024. |
| [Berkeley County guidance](https://berkeleywv.org/330/Outdoor-Burning) | HTTP 200. Standing guidance and a referral to Martinsburg's separate ordinance. Alert Center and News Flash contained no current dated burn order. |
| [Berkeley County ordinances PDF](https://www.berkeleywv.org/DocumentCenter/View/9954/Outdoor-Burn-Ordinances-PDF) | HTTP 200. Standing rules and links for the county and Martinsburg. |

The current Governor's Drupal news archive gave no burn order in the releases checked from October 1 to November 23. The Secretary of State's WebForms searches for executive orders and proclamations loaded on GET and returned HTTP 500 on a subject search for `burn`. These are manual sources. [Governor's archive](https://governor.wv.gov/allnews/all) · [Executive Journal](https://apps.sos.wv.gov/adlaw/executivejournal/)

Monongahela's public alerts and the eight New River Gorge alerts yielded no current temporary public fire order. New River Gorge has separate standing campfire rules. [Monongahela alerts](https://www.fs.usda.gov/r09/monongahela/alerts) · [New River Gorge alert JSON](https://www.nps.gov/neri/park-alerts-neri.json) · [Park compendium](https://www.nps.gov/neri/learn/management/superintendents-compendium.htm)
