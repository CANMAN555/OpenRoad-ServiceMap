// Semi truck repair, mobile repair, tire and towing places from OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Writes data/towing.json (towing and wrecker services) and data/truckshops.json (repair, mobile repair and tire).
// A place that advertises both, like "Smith Towing & Diesel Repair", goes in both files.
// Kept only when OpenStreetMap has a street address, a city and a U.S. phone number, and when it is clearly for
// semi trucks (a truck shop tag or a truck word in the name). Car-only chains and the companies that already have
// their own layer on the map are left out, and duplicates (same phone, or same name within a few hundred feet) are merged.
// Finally each place must still be current: its own website, fetched today, has to show the same phone number.
// Places with no website, a dead site, or a site that lists a different number are left out.
import { readFile } from "node:fs/promises";
import { UA as SITE_UA, clean, formatPhone, formatZip, liveMatcher, pool, writeData } from "./lib.mjs";

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
// overpass-api.de answers 406 to browser-like user agents, so name the project plainly.
const UA = "OpenRoad-ServiceMap data update (github.com/CANMAN555/OpenRoad-ServiceMap)";
const HOSTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

const HEAVY = /\b(truck|trucks|trucking|semi|diesel|heavy|fleet|commercial|big rig|tractor|trailer|18 ?wheel|wrecker|rotator)/;
const CAR = /discount tire|tires plus|pep boys|belle tire|firestone complete|jiffy|midas|meineke|valvoline|express oil|les schwab|big o tire|\bntb\b|mavis|monro|goodyear auto|u-haul|enterprise|hertz|autozone|o'?reilly|napa auto|advance auto/;
// Companies that already have their own layer on the map.
const LIVE = /love'?s|speedco|\bta\b|travelcenters|travel centers of america|\bpetro\b|freightliner|volvo|boss truck|utility trailer|prestige trailer|timpte|thermo ?king|carrier transicold|fleetpride|truckpro|southern tire mart|\bstm\b|rush truck|\bmack\b|pomp'?s/;
const STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };
const CODES = new Set(Object.values(STATES));

// Public Overpass servers turn away heavy queries when busy (429/504), so try each server, then wait and go again.
async function overpass() {
  for (let round = 0; round < 4; round++) {
    if (round) await new Promise((r) => setTimeout(r, 90000));
    for (const h of HOSTS) {
    try {
      const r = await fetch(h, { method: "POST", body: "data=" + encodeURIComponent(Q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA } });
      // A mirror that is behind or cut short answers with far fewer places; skip it.
      if (r.ok) { const els = (await r.json()).elements || []; console.log("Overpass:", h, els.length, "places"); if (els.length > 800) return els; continue; }
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
// Also leave out the truck service chains that have their own layer in Other Vendors.
const isLive = await liveMatcher(["mack", "rush", "pomps"]);
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

// ---------- check each place against its own website ----------
async function get(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": SITE_UA, Accept: "text/html,*/*" } });
    return r.ok ? { url: r.url, html: await r.text() } : null;
  } catch { return null; } finally { clearTimeout(t); }
}
// "(864) 419-1067" matches 864-419-1067, 864.419.1067, 8644191067, +1 864 419 1067 and tel: links.
const phoneIn = (html, d) => new RegExp(`\\(?${d.slice(0, 3)}\\)?[\\s.\\-\\u00a0]*${d.slice(3, 6)}[\\s.\\-\\u00a0]*${d.slice(6)}(?!\\d)`).test(html);
async function verify(s) {
  if (!s.website) return "no website";
  let site = s.website;
  if (!/^https?:\/\//i.test(site)) site = "https://" + site;
  const d = s.phone.replace(/\D/g, "");
  const home = await get(site);
  if (!home) return "site down";
  if (phoneIn(home.html, d)) return { url: home.url };
  // Many sites keep the number on a contact page.
  const base = new URL(home.url);
  const links = [...home.html.matchAll(/href="([^"#]*(?:contact|location|about)[^"#]*)"/gi)].map((m) => { try { return new URL(m[1], base).href; } catch { return null; } })
    .filter((u) => u && new URL(u).host === base.host);
  for (const u of [...new Set(links)].slice(0, 3)) {
    const pg = await get(u);
    if (pg && phoneIn(pg.html, d)) return { url: pg.url };
  }
  return "phone not on site";
}
const all = [...new Map([...out.tow, ...out.shop].map((s) => [s.id, s])).values()];
const why = {}, today = new Date().toISOString().slice(0, 10);
await pool(all, 8, async (s) => {
  const r = await verify(s);
  if (typeof r === "string") { why[r] = (why[r] || 0) + 1; s.unverified = true; }
  else { s.verified = today; s.verifiedUrl = r.url; why.verified = (why.verified || 0) + 1; }
});
console.log(`Website check of ${all.length} places:`, JSON.stringify(why));
for (const k of ["tow", "shop"]) out[k] = out[k].filter((s) => !s.unverified);

const meta = { source: "OpenStreetMap contributors (ODbL), openstreetmap.org/copyright", fetched_at: new Date().toISOString() };
await writeData("towing", { ...meta, count: out.tow.length, stores: out.tow }, 5);
await writeData("truckshops", { ...meta, count: out.shop.length, stores: out.shop }, 50);
