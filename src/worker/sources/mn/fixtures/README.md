# Minnesota DNR burning restrictions

The JSON is the unmodified response to [the MapServer CGI GET](https://maps.dnr.state.mn.us/cgi-bin/mapserv/burning_restrictions?mode=nquery), captured at 2026-11-24 05:31:57 UTC (November 23, 11:31:57 p.m. Central). HTTP 200, JSON UTF-8. There were no ETag or Last-Modified response headers.

The [official map page](https://www.dnr.state.mn.us/forestry/fire/firerating_restrictions.html) calls this URL for its table. It uses the zero-based position in the `burning_restrictions` array to look up `status`. The `legOrder` field sorts the legend. The legend fixture is that exact array, extracted from the HTML at 2026-11-24 05:31:59 UTC.

| Feed code | Map meaning |
| --- | --- |
| 0 | No data |
| 1 | Variance permits only |
| 2 | Permits required |
| 3 | No open burning, campfires allowed |
| 4 | Elevated restrictions, including no open burning |
| 5 | No permit required |
| 6 | Agency-approved permits only |

The official table displays each `last_update` as provided. The page's overall date is generated in the visitor's browser. The downloadable map was dated November 23, and a point query near Ely returned the same November 23 noon timestamp as the northern St. Louis County row. The adapter interprets these timezone-free area timestamps in Central time and uses a 48-hour freshness window per area. The [permit administration directory](https://apps.dnr.state.mn.us/burning-permits/admin_areas) corroborates the split permit areas, including Polk East and Roseau East.
