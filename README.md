# OpenRoad Service Map

Find truck repair, tire, towing along a route for commercial vehicle road calls.

**Live site: https://canman555.github.io/OpenRoad-ServiceMap/**

A free, open source website for truck drivers and dispatchers setting up a road call. Enter a route, or where the truck is broken down, and it lists truck repair shops, tire shops, towing, truck stops and truck dealers near the route. Results are sorted by route mile and have tap-to-call phone numbers.

![Desktop screenshot](screenshots/desktop.png)

## Why

When a truck breaks down, a driver or dispatcher has to find a shop that can handle a heavy truck, near a specific spot on the highway, fast. Most of that searching happens on general map apps that mix in car shops and don't show where along the route each one sits. This site narrows the search to truck services in a corridor along the route and puts the phone number first.

## Features

- **Along a route:** search 3 to 25 miles each side of a route between two places.
- **Near the truck:** search around an address, town, coordinates, or the phone's location.
- **Route mile for every result**, plus how far off route it is.
- **Tap-to-call** numbers, hours, a 24/7 filter, and a "has phone number" filter.
- **Copy info** button that copies name, phone, address, route mile and coordinates for dispatch.
- **Satellite view** using Esri World Imagery, with road and town labels.
- **Every Love's location in the US** (Travel Stops, Country Stores and Truck Care/Speedco shops) as yellow pins. Hover or tap a pin for the address, phone number, highway exit, hours and a link to the location page on loves.com. Each popup says plainly whether the location sells truck diesel, has a truck repair shop and offers tire service.
- **TA, Petro and TA Express travel centers** as red TA pins. Popups show truck diesel, whether there is a TA Truck Service shop (bays, services, in-bay hours), tire service, and whether the shop uses TA's **eShop 2.0** portal or the original eShop.
- **Freightliner dealers and service points**, including Freightliner ExpressPoint at Love's and Speedco, as white FL pins. Popups show repair, tire, road service and towing, Elite Support, and service and parts hours.
- **Volvo Trucks dealers and service locations** as teal V pins. Popups show repair, Volvo Certified Uptime Center, road service, towing, tires, and service, parts and on-call hours.
- A box at the top right of the map turns each brand on or off.
- **Fix this listing** link on every result, so anyone can correct the data on OpenStreetMap.
- Works on phones, with light and dark themes.

<img src="screenshots/loves-popups.png" alt="Love's popups for a fuel and shop stop, a fuel-only stop and a Speedco repair shop" width="820">

<img src="screenshots/brand-popups.png" alt="Popups for a TA with eShop 2.0, a TA with the original eShop, a Freightliner dealer and a Volvo dealer" width="820">

<img src="screenshots/brand-pins.png" alt="Love's, TA, Freightliner and Volvo pins with the brand on/off box" width="520">

<img src="screenshots/mobile.png" alt="Phone screenshot" width="280">

## How it works (tech used)

It is one static file (`index.html`) with no server and no API keys, so it can be hosted free on GitHub Pages.

| Job | Service (free, public) |
| --- | --- |
| Map tiles | Esri World Imagery satellite with Esri road and place labels, via Leaflet 1.9.4 |
| Place search | Nominatim (US, Canada, Mexico) |
| Route | OSRM public demo server, driving profile |
| Vendor search | Overpass API, searched in a corridor along the route |

Vendor types come from these OpenStreetMap tags: `shop=truck_repair`, `shop=tyres`, `shop=truck`, `shop=car_repair` with `hgv=yes` or a truck/diesel/fleet name, `amenity=fuel` with `hgv=yes` or a major truck stop brand name, and anything named "towing" or "wrecker".

## Love's locations

`data/loves.json` comes straight from Love's own store locator feed (the one behind loves.com/locations). The [Update Love's locations](.github/workflows/update-loves.yml) workflow runs `scripts/update-loves.mjs` every Monday and commits the file only when something changed, so addresses and phone numbers stay current without manual edits. Run it any time from the repo's Actions tab with "Run workflow".

## TA, Freightliner and Volvo locations

The [Update TA, Freightliner and Volvo locations](.github/workflows/update-vendors.yml) workflow runs every Monday and writes one file per brand, each from that company's own site:

| File | Source | Script |
| --- | --- | --- |
| `data/ta.json` | Every location page listed in the ta-petro.com sitemap, plus the eShop 2.0 site list on [ta-petro.com/fleets/eshop-2](https://www.ta-petro.com/fleets/eshop-2) | `scripts/update-ta.mjs` |
| `data/freightliner.json` | Freightliner's dealer search (freightliner.com/dealer-search) | `scripts/update-freightliner.mjs` |
| `data/volvo.json` | Volvo Trucks' dealer locator feed (volvotrucks.us/find-a-dealer) | `scripts/update-volvo.mjs` |

Freightliner's locator often gives coordinates only to the ZIP code, so ExpressPoint sites take Love's exact coordinates and other addresses are placed with the free U.S. Census geocoder. A few addresses the geocoder can't match keep Freightliner's coordinates and may sit a short distance from the real building.

## Limits to know about

- **Listings can be missing or out of date.** OpenStreetMap is maintained by volunteers. Always call ahead to confirm hours, heavy-truck capability and payment. Each result shows when its listing was last edited and links to fix it on OpenStreetMap.
- **Routes are car routes.** OSRM's public server does not know truck height, weight, length or hazmat restrictions. Use a truck GPS for the actual drive.
- **Public servers have usage limits.** Nominatim allows about one request per second, and the OSRM demo server is meant for light use. Esri World Imagery is used under Esri's terms, which may require an Esri account for heavy or commercial use. If traffic grows, point the URLs at your own or a paid provider.
- Mobile road service companies are rarely mapped in OpenStreetMap, so they mostly won't show up.

## Run locally

No build step and no API keys. Clone the repo and serve the folder:

```sh
git clone https://github.com/CANMAN555/OpenRoad-ServiceMap.git
cd OpenRoad-ServiceMap
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly also works in most browsers.

## License

MIT for the code. Map data © OpenStreetMap contributors, available under the ODbL.
