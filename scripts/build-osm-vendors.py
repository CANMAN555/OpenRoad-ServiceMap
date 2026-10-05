#!/usr/bin/env python3
"""Build the vendor listings the site searches (truck repair, tires, towing, truck stops, dealers).

Input: an OpenStreetMap .osm.pbf already narrowed down with `osmium tags-filter` (see
.github/workflows/update-osm-vendors.yml). Output: data/osm/index.json plus one file per 2-degree
tile, so a browser only downloads the tiles near the truck or along the route.

The rules match the live OpenStreetMap search the site used before:
  shop=truck_repair, shop=tyres, shop=truck
  shop=car_repair with hgv=yes/designated or a truck/diesel/fleet/semi/trailer name
  amenity=fuel with hgv=yes/designated or a major truck stop brand name
  anything named "towing" or "wrecker"

Usage: python3 scripts/build-osm-vendors.py filtered.osm.pbf [more.osm.pbf ...]
"""
import json
import math
import os
import re
import sys
from datetime import datetime, timezone

import osmium

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "osm")
TILE = 2  # degrees

HGV = re.compile(r"^(yes|designated)$")
REPAIR_NAME = re.compile(r"truck|diesel|fleet|semi|trailer", re.I)
FUEL_NAME = re.compile(r"Love's|Pilot|Flying J|TravelCenters|Petro Stopping|Sapp Bros|Road Ranger|Bosselman|Kenly 95|Iowa 80", re.I)
TOW_NAME = re.compile(r"towing|wrecker", re.I)

# Only the tags the page shows or filters on.
KEEP = ["name", "brand", "shop", "amenity", "hgv", "phone", "contact:phone", "phone:mobile", "opening_hours",
        "addr:housenumber", "addr:street", "addr:city", "addr:state", "website", "contact:website"]


def wanted(t):
    shop, name = t.get("shop"), t.get("name", "")
    if shop in ("truck_repair", "tyres", "truck"):
        return True
    if shop == "car_repair" and (HGV.match(t.get("hgv", "")) or REPAIR_NAME.search(name)):
        return True
    if t.get("amenity") == "fuel" and (HGV.match(t.get("hgv", "")) or FUEL_NAME.search(name)):
        return True
    return bool(TOW_NAME.search(name))


class Builder(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.items = {}      # "n/123" -> [lat, lon, timestamp, tags]
        self.way_box = {}    # way id -> [minlat, minlon, maxlat, maxlon], for relation centers

    def keep(self, key, lat, lon, obj, tags):
        ts = obj.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ") if obj.timestamp and obj.timestamp.year > 1970 else None
        self.items[key] = [round(lat, 5), round(lon, 5), ts, {k: tags[k] for k in KEEP if k in tags}]

    def node(self, n):
        if not n.tags or not n.location.valid():
            return
        t = dict(n.tags)
        if wanted(t):
            self.keep(f"node/{n.id}", n.location.lat, n.location.lon, n, t)

    def way(self, w):
        lats, lons = [], []
        for nd in w.nodes:
            if nd.location.valid():
                lats.append(nd.location.lat)
                lons.append(nd.location.lon)
        if not lats:
            return
        box = [min(lats), min(lons), max(lats), max(lons)]
        self.way_box[w.id] = box
        t = dict(w.tags)
        if t and wanted(t):
            # Center of the bounding box, the same point OpenStreetMap's own search reports.
            self.keep(f"way/{w.id}", (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, w, t)

    def relation(self, r):
        t = dict(r.tags)
        if not t or not wanted(t):
            return
        boxes = [self.way_box[m.ref] for m in r.members if m.type == "w" and m.ref in self.way_box]
        if not boxes:
            return
        s, w = min(b[0] for b in boxes), min(b[1] for b in boxes)
        n, e = max(b[2] for b in boxes), max(b[3] for b in boxes)
        self.keep(f"relation/{r.id}", (s + n) / 2, (w + e) / 2, r, t)


def main(paths):
    b = Builder()
    for p in paths:
        b.apply_file(p, locations=True)
        b.way_box.clear()
        print(f"{p}: {len(b.items)} listings so far", flush=True)
    if len(b.items) < 1000 and not os.environ.get("ALLOW_SMALL"):
        sys.exit(f"Only {len(b.items)} listings found; refusing to replace the data with a partial build.")

    tiles = {}
    for key, (lat, lon, ts, tags) in b.items.items():
        tk = f"{math.floor(lat / TILE) * TILE}_{math.floor(lon / TILE) * TILE}"
        tiles.setdefault(tk, []).append([key, lat, lon, ts, tags])

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith("t") and f.endswith(".json"):
            os.remove(os.path.join(OUT, f))
    for tk, rows in tiles.items():
        rows.sort()
        with open(os.path.join(OUT, f"t{tk}.json"), "w") as fh:
            json.dump(rows, fh, separators=(",", ":"), ensure_ascii=False)
    index = {
        "source": "OpenStreetMap contributors (ODbL), via Geofabrik extracts",
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tile_degrees": TILE,
        "count": len(b.items),
        "tiles": {tk: len(rows) for tk, rows in sorted(tiles.items())},
    }
    with open(os.path.join(OUT, "index.json"), "w") as fh:
        json.dump(index, fh, separators=(",", ":"))
    print(f"Wrote {len(b.items)} listings in {len(tiles)} tiles")


if __name__ == "__main__":
    main(sys.argv[1:])
