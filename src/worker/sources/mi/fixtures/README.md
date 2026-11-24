# Michigan DNR permit-map fixture

`permits-2026-11-24.json` is the full [county attribute query](https://gisp.mcgi.state.mi.us/arcgis/rest/services/DNR/Burn_Permits/MapServer/1/query?where=1%3D1&outFields=FIPS2%2CSTATUS%2CPullStamp&returnGeometry=false&f=json), captured November 24, 2026 at 05:00:52 UTC. Only JSON whitespace was reformatted.

The [layer renderer](https://gisp.mcgi.state.mi.us/arcgis/rest/services/DNR/Burn_Permits/MapServer/1?f=pjson) assigns brown to 0, green to 1, orange to 2 and gray to 3. The [public map key and township lookup](https://www2.dnr.state.mi.us/burnpermits/) explain those colors. The [timestamp layer](https://gisp.mcgi.state.mi.us/arcgis/rest/services/DNR/Burn_Permits/MapServer/2?f=pjson) labels `PullStamp` as the map update time. At 04:56:14 UTC the raw field decoded to 23:50:02 on November 23 when formatted as UTC. At 05:00:52 UTC it decoded to 00:00:04 on November 24. Both matched Eastern wall time. The fixture's map update was 05:00:04 UTC.
