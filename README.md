# OpenRoad Service Map

A free, open source website for truck drivers and dispatchers setting up a road call. Enter a route (or where the truck is broken down) and it lists truck repair shops, tire shops, towing, truck stops and truck dealers near the route, sorted by route mile, with tap-to-call phone numbers.

![Desktop screenshot](screenshots/desktop.png)

## How it works

It is one static file (`index.html`) with no server and no API keys, so it can be hosted free on GitHub Pages.

| Job | Service (free, public) |
| --- | --- |
| Map tiles | USDA NAIP aerial imagery (default, public domain, 2023-2025 flights) with USGS National Map imagery when zoomed out; Esri World Imagery and OpenStreetMap street map as options; Leaflet 1.9.4 |
| Place search | Nominatim (US, Canada, Mexico) |
| Route | OSRM public demo server, driving profile |
| Vendor search | Overpass API, searched in a corridor along the route |

Vendor types come from these OpenStreetMap tags: `shop=truck_repair`, `shop=tyres`, `shop=truck`, `shop=car_repair` with `hgv=yes` or a truck/diesel/fleet name, `amenity=fuel` with `hgv=yes` or a major truck stop brand name, and anything named "towing" or "wrecker".

## Limits to know about

- **Listings can be missing or out of date.** OpenStreetMap is maintained by volunteers. Always call ahead to confirm hours, heavy-truck capability and payment. Each result shows when its listing was last edited and links to fix it on OpenStreetMap.
- **Routes are car routes.** OSRM's public server does not know truck height, weight, length or hazmat restrictions. Use a truck GPS for the actual drive.
- **Public servers have usage limits.** Nominatim allows about one request per second, and the OSRM demo server and OSM tile servers are meant for light use. If traffic grows, point the URLs at your own or a paid provider.
- Mobile road service companies are rarely mapped in OpenStreetMap, so they mostly won't show up.

## Run locally

Open `index.html` in a browser. No build step.

## License

MIT for the code. Map data © OpenStreetMap contributors, available under the ODbL.
