// Semi truck repair, mobile repair, tire and towing places from OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Writes data/towing.json (towing and wrecker services) and data/truckshops.json (repair, mobile repair and tire).
// A place that advertises both, like "Smith Towing & Diesel Repair", goes in both files.
// Kept only when OpenStreetMap has a street address, a city and a U.S. phone number, and when it is clearly for
// semi trucks (a truck shop tag or a truck word in the name). Car-only chains and the companies that already have
// their own layer on the map are left out, and duplicates (same phone, or same name within a few hundred feet) are merged.
import { readFile } from "node:fs/promises";
import { UA, clean, formatPhone, formatZip, liveMatcher, writeData } from "./lib.mjs";

const Q = `[out:json][timeout:900];
area["ISO3166-1"="US"][admin_level=2]->.us;
(
  nwr["shop"="truck_repair"](area.us);
  nwr["shop"~"^(car_repair|tyres|truck|towing|vehicle_repair)$"]["name"~"truck|semi|diesel|tow|wrecker|fleet|heavy|commercial|big rig|tractor|trailer|18 ?wheel|rotator",i](area.us);
  nwr["service:vehicle:towing"="yes"](area.us);
  nwr["shop"="towing"](area.us);
  nwr["service:vehicle:truck"="yes"](area.us);
  nwr["service:vehicle:hgv"="yes"](area.us);
);
out center tags;`;
const HOSTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

const HEAVY = /\b(truck|trucks|trucking|semi|diesel|heavy|fleet|commercial|big rig|tractor|trailer|18 ?wheel|wrecker|rotator)/;
const CAR = /discount tire|tires plus|pep boys|belle tire|firestone complete|jiffy|midas|meineke|valvoline|express oil|les schwab|big o tire|\bntb\b|mavis|monro|goodyear auto|u-haul|enterprise|hertz|autozone|o'?reilly|napa auto|advance auto/;
// Companies that already have their own layer on the map.
const LIVE = /love'?s|speedco|\bta\b|travelcenters|travel centers of america|\bpetro\b|freightliner|volvo|boss truck|utility trailer|prestige trailer|timpte|thermo ?king|carrier transicold|fleetpride|truckpro|southern tire mart|\bstm\b/;
const STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };
const CODES = new Set(Object.values(STATES));

// Public Overpass servers turn away heavy queries when busy (429/504), so try each server, then wait and go again.
async function overpass() {
  for (let round = 0; round < 4; round++) {
    if (round) await new Promise((r) => setTimeout(r, 90000));
    for (const h of HOSTS) {
    try {
      const r = await fetch(h, { method: "POST", body: "data=" + encodeURIComponent(Q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA } });
      if (r.ok) { console.log("Overpass:", h); return (await r.json()).elements; }
      console.log(h, "HTTP", r.status);
    } catch (e) { console.log(h, e.message); }
    }
  }
  throw new Error("No Overpass server answered");
}

// State from the address, or from the nearest Census place within 40 miles when the address leaves it out.
const places = JSON.parse(await readFile("data/places.json", "utf8")).places;
function stateOf(tag, lat, lon) {
  const s = String(tag || "").trim(), c = s.slice(0, 2).toUpperCase();
  if (CODES.has(c) && (s.length === 2 || /^[A-Za-z]{2}\b/.test(s) && !STATES[s.toLowerCase()])) return c;
  if (STATES[s.toLowerCase()]) return STATES[s.toLowerCase()];
  let best = null, bd = 0.6 * 0.6; // about 40 miles in degrees, squared
  for (const p of places) { const d = (p[2] - lat) ** 2 + ((p[3] - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; best = p[1]; } }
  return best;
}

const els = await overpass();
const isLive = await liveMatcher();
const out = { tow: [], shop: [] }, seen = { tow: new Set(), shop: new Set() };
let dropped = { noAddress: 0, car: 0, notTruck: 0, live: 0, dupe: 0 };
const ranked = els.sort((a, b) => Object.keys(b.tags || {}).length - Object.keys(a.tags || {}).length);
for (const e of ranked) {
  const g = e.tags || {}, name = clean(g.name), n = (name || "").toLowerCase();
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  const digits = String(g.phone || g["contact:phone"] || "").split(/[;,]/)[0].replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const street = g["addr:housenumber"] && g["addr:street"] ? `${g["addr:housenumber"]} ${g["addr:street"]}` : null;
  const city = clean(g["addr:city"]), state = lat != null ? stateOf(g["addr:state"], lat, lon) : null;
  if (!name || !street || !city || !state || digits.length !== 10 || lat == null) { dropped.noAddress++; continue; }
  if (CAR.test(n)) { dropped.car++; continue; }
  if (!(g.shop === "truck_repair" || g["service:vehicle:truck"] === "yes" || g["service:vehicle:hgv"] === "yes" || HEAVY.test(n))) { dropped.notTruck++; continue; }
  if (LIVE.test(n + " " + String(g.brand || g.operator || "").toLowerCase())) { dropped.live++; continue; }
  const tow = g.shop === "towing" || g["service:vehicle:towing"] === "yes" || /\btow|wrecker|rotator|recovery/.test(n);
  const tire = g.shop === "tyres" || /tire|tyre/.test(n);
  const mobile = /mobile|road ?service|roadside|on-?site/.test(n);
  const repair = g.shop === "truck_repair" || /repair|diesel|service|mechanic|maintenance|shop|truck center|fleet/.test(n) || (!tow && !tire);
  const s = {
    id: `${e.type[0]}${e.id}`, name, address: clean(street), city, state, zip: formatZip(g["addr:postcode"]),
    phone: formatPhone(digits), lat: +lat.toFixed(6), lon: +lon.toFixed(6),
    services: [repair && "Repair", mobile && "Mobile repair", tire && "Tires", tow && "Towing"].filter(Boolean),
    hours: clean(g.opening_hours), website: clean(g.website || g["contact:website"] || g.url),
    osm: `https://www.openstreetmap.org/${e.type}/${e.id}`,
  };
  if (isLive(s)) { dropped.live++; continue; }
  const keys = ["p" + digits, "n" + n.replace(/\W/g, "") + Math.round(lat * 150) + "," + Math.round(lon * 150)];
  let added = false;
  for (const [kind, on] of [["tow", tow], ["shop", repair || tire || mobile]]) {
    if (!on) continue;
    if (keys.some((k) => seen[kind].has(k))) continue;
    keys.forEach((k) => seen[kind].add(k)); out[kind].push(s); added = true;
  }
  if (!added) dropped.dupe++;
}
console.log("Dropped:", JSON.stringify(dropped));
const meta = { source: "OpenStreetMap contributors (ODbL), openstreetmap.org/copyright", fetched_at: new Date().toISOString() };
await writeData("towing", { ...meta, count: out.tow.length, stores: out.tow }, 20);
await writeData("truckshops", { ...meta, count: out.shop.length, stores: out.shop }, 200);
