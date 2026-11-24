# Lead notes, round 1 (2026-11-23)

- Old repo: Next.js 9 + Express + Redux, Vercel (vercel.json v2). IP geolocation (ipstack) + Google geocoder -> state + county -> lookup. States: OK, TX only.
- OK source (tested 2026-11-23, live): https://services3.arcgis.com/yrIZ0Nv0mSGTWJsH/arcgis/rest/services/Test___Oklahoma_Burn_Ban_Status___Data_View__v_9_0/FeatureServer/0/query?f=json&where=1%3D1&returnGeometry=false&outFields=* . Fields county_nam, Burn_Ban_Status coded values: None, County Burn Ban, Governor's Burn Ban, Ozone Alert, County Burn Ban and Ozone Alert. Polygon geometry available (wkid 3857).
- TX source (tested, live, redirects to https): https://tfsfrp.tamu.edu/WILDFIRES/BURNBAN.txt . UTF-16 LE with BOM; header "Texas Burn Bans - 11/23/2026 10:52:12 AM", then one uppercase county per line. Old code stripped \0 which is a crude UTF-16 decode.
- Domain: NS already on Cloudflare (art/karina.ns.cloudflare.com), proxied to Vercel (x-vercel-id header). Moving hosting = swap DNS/route to a Worker, no registrar move needed.
- Cloudflare: wrangler OAuth logged in, account "Sam Carlton Creative", scopes include workers write, workers_kv write, email_sending write.
