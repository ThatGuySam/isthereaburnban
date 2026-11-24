# /// script
# requires-python = ">=3.11"
# dependencies = ["pyshp==2.3.1", "shapely==2.1.2"]
# ///
"""Generate src/data/nws-zone-counties.json from the NWS April 2026 GIS release."""

import argparse
from collections import defaultdict
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from urllib.request import Request, urlopen
from zipfile import ZipFile

import shapefile
from shapely import STRtree, make_valid
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent.parent
NWS = "https://www.weather.gov/source/gis/Shapefiles"
CENSUS = "https://www2.census.gov/geo/tiger/GENZ2025/shp"
INPUTS = {
    f"{NWS}/County/c_16ap26.zip": "503f9d697a97bdbfd8a7cfe6b3b666801f43392fa220294987a68cac0bd3f03b",
    f"{NWS}/WSOM/fz16ap26.zip": "daeb5cf94f8cd9ee850d6d142f1d98c77e6a7234f021a6b4c7aeba5763fd7486",
    f"{NWS}/County/bp16ap26.dbx": "69d3472d4d576b8a4924efb7a43108f7c64111f503e15efd650f43dc617a6f12",
    f"{NWS}/WSOM/z_16ap26.zip": "010dc5eab64b6e326c969e252bd016f56a037b0444df8303658707bca4cc7fd8",
    f"{CENSUS}/cb_2025_us_county_500k.zip": "aa976c00b181939755d0da757f4c7c2dc0103c3b3b4530fb2a91c2bb62fc777c",
}


def read_input(source, source_dir):
    if source_dir:
        data = (source_dir / Path(source).name).read_bytes()
    else:
        request = Request(source, headers={
            "User-Agent": "isthereaburnban.com (https://isthereaburnban.com/developers/)",
        })
        with urlopen(request, timeout=60) as response:
            data = response.read()
    if sha256(data).hexdigest() != INPUTS[source]:
        raise ValueError(f"NWS GIS input checksum changed: {source}")
    return data


def read_shapes(data, include=lambda record: True):
    with ZipFile(BytesIO(data)) as archive:
        parts = {Path(name).suffix: name for name in archive.namelist()}
        with shapefile.Reader(
            shp=BytesIO(archive.read(parts[".shp"])),
            dbf=BytesIO(archive.read(parts[".dbf"])),
            encoding="latin-1",
        ) as reader:
            for item in reader.iterShapeRecords():
                if not include(item.record):
                    continue
                geom = shape(item.shape.__geo_interface__)
                yield item.record, geom if geom.is_valid else make_valid(geom)


def intersect_zones(zone_data, polygons):
    # Some fire zones straddle state lines. The UGC prefix identifies the
    # zone, and the published geometry determines which counties it covers.
    tree = STRtree([geom for _, geom in polygons])
    mapping = defaultdict(set)
    for record, geom in read_shapes(zone_data):
        if not geom.area:
            continue
        ugc = f"{record.STATE}Z{record.ZONE}"
        for index in tree.query(geom, predicate="intersects"):
            fips, county = polygons[index]
            # These releases share NAD83. Ignore boundary contact and sub-0.5% slivers
            # of the smaller polygon to tolerate mismatched lines along shared borders.
            if geom.intersection(county).area > 0.005 * min(geom.area, county.area):
                mapping[ugc].add(fips)
    return mapping


def forecast_zones(data, counties):
    mapping = defaultdict(set)
    for line in data.decode("latin-1").splitlines():
        state, zone, _, _, _, _, fips, *_ = line.split("|")
        if fips in counties:
            mapping[f"{state}Z{zone}"].add(fips)
    return mapping


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, help="Read downloaded NWS files from this directory")
    args = parser.parse_args()
    counties = {row["fips"] for row in json.loads((ROOT / "src/data/counties.json").read_bytes())}
    county_data, fire_data, correlation, forecast_data, census_data = (
        read_input(source, args.source_dir) for source in INPUTS
    )
    polygons = [(record.FIPS, geom) for record, geom in read_shapes(county_data, lambda row: row.FIPS in counties) if geom.area]
    missing = counties.difference(fips for fips, _ in polygons)
    # NWS codes Kalawao as part of Maui. Use the Census land boundary to
    # give the separate Kalawao County page the relevant zone alerts.
    supplements = [(record.GEOID, geom) for record, geom in read_shapes(census_data, lambda row: row.GEOID in missing) if geom.area]
    mappings = {
        "fire": intersect_zones(fire_data, polygons + supplements),
        "forecast": forecast_zones(correlation, counties),
    }
    for ugc, fips in intersect_zones(forecast_data, supplements).items():
        mappings["forecast"][ugc].update(fips)
    for kind, mapping in mappings.items():
        uncovered = counties.difference(*mapping.values())
        if uncovered:
            raise ValueError(f"{kind} zones do not cover {sorted(uncovered)}")
    path = ROOT / "src/data/nws-zone-counties.json"
    with path.open("w", encoding="utf-8") as file:
        blocks = [f'  "supplementalCounties":{json.dumps(sorted(fips for fips, _ in supplements))}']
        for kind, mapping in mappings.items():
            rows = (f'    "{ugc}":{json.dumps(sorted(fips), separators=(",", ":"))}'
                    for ugc, fips in sorted(mapping.items()))
            blocks.append(f'  "{kind}": {{\n' + ",\n".join(rows) + "\n  }")
            print(f"{kind}: {len(mapping)} zones, {len(set().union(*mapping.values()))} counties")
        file.write("{\n" + ",\n".join(blocks) + "\n}\n")


if __name__ == "__main__":
    main()
