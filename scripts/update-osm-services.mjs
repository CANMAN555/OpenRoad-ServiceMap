// Locksmiths and vehicle glass repair shops from OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Writes data/locksmiths.json and data/glass.json. Unlike Other Vendors these don't have to be semi-truck specific
// (Manny, 2026-10-21): most shops that work on cars also work on trucks, they just don't say so.
// Kept only when OpenStreetMap has a street address, a city and a U.S. phone number, and when the place is still
// current: its own website, fetched today, has to show the same phone number. A glass shop's website also has to
// talk about vehicle glass (windshields, auto glass), so window and mirror shops for houses are left out.
// Duplicates (same phone, or same name within a few hundred feet) are merged.
import { readFile } from "node:fs/promises";
import { checkSite, clean, formatPhone, formatZip, pool, writeData } from "./lib.mjs";

const GLASS_NAME = /auto ?glass|windshield|windscreen|car glass|truck glass|vehicle glass|safelite/i;
const Q = `[out:json][timeout:900];
area["ISO3166-1"="US"][admin_level=2]->.us;
(
  nwr["shop"="locksmith"](area.us);
  nwr["craft"="locksmith"](area.us);
  nwr["service:vehicle:glass"="yes"](area.us);
  nwr["shop"="car_repair"]["car_repair"~"glass"](area.us);
  nwr["shop"~"^(car_repair|car_parts|glaziery|vehicle_repair|truck_repair)$"]["name"~"glass|windshield|windscreen",i](area.us);
  nwr["craft"~"^(glaziery|windshield|car_repair)$"]["name"~"auto|windshield|windscreen|car|truck|vehicle|mobile",i](area.us);
);
out center tags;`;
// overpass-api.de answers 406 to browser-like user agents, so name the project plainly.
const UA = "OpenRoad-ServiceMap data update (github.com/CANMAN555/OpenRoad-ServiceMap)";
const HOSTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
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
        if (r.ok) { const els = (await r.json()).elements || []; console.log("Overpass:", h, els.length, "places"); if (els.length > 500) return els; continue; }
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
const out = { lock: [], glass: [] }, seen = { lock: new Set(), glass: new Set() };
const dropped = { noAddress: 0, dupe: 0 };
const ranked = els.sort((a, b) => Object.keys(b.tags || {}).length - Object.keys(a.tags || {}).length);
for (const e of ranked) {
  const g = e.tags || {}, name = clean(g.name), n = (name || "").toLowerCase();
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  const digits = String(g.phone || g["contact:phone"] || "").split(/[;,]/)[0].replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const street = g["addr:housenumber"] && g["addr:street"] ? `${g["addr:housenumber"]} ${g["addr:street"]}` : null;
  const city = clean(g["addr:city"]), state = lat != null ? stateOf(g["addr:state"], lat, lon) : null;
  if (!name || !street || !city || !state || digits.length !== 10 || lat == null) { dropped.noAddress++; continue; }
  const lock = g.shop === "locksmith" || g.craft === "locksmith" || /locksmith/.test(n);
  const glass = g["service:vehicle:glass"] === "yes" || /glass/.test(g.car_repair || "") || GLASS_NAME.test(n) || (/glass/.test(n) && g.shop !== "locksmith");
  const s = {
    id: `${e.type[0]}${e.id}`, name, address: clean(street), city, state, zip: formatZip(g["addr:postcode"]),
    phone: formatPhone(digits), lat: +lat.toFixed(6), lon: +lon.toFixed(6),
    services: [lock && "Locksmith", glass && "Glass repair", /mobile/.test(n) && "Mobile"].filter(Boolean),
    hours: clean(g.opening_hours), website: clean(g.website || g["contact:website"] || g.url),
    osm: `https://www.openstreetmap.org/${e.type}/${e.id}`,
  };
  const keys = ["p" + digits, "n" + n.replace(/\W/g, "") + Math.round(lat * 150) + "," + Math.round(lon * 150)];
  let added = false;
  for (const [kind, on] of [["lock", lock], ["glass", glass]]) {
    if (!on || keys.some((k) => seen[kind].has(k))) continue;
    keys.forEach((k) => seen[kind].add(k)); out[kind].push(s); added = true;
  }
  if (!added) dropped.dupe++;
}
console.log("Dropped:", JSON.stringify(dropped), "Locksmiths:", out.lock.length, "Glass:", out.glass.length);

// ---------- check each place against its own website ----------
const all = [...new Map([...out.lock, ...out.glass].map((s) => [s.id, s])).values()];
const why = {}, today = new Date().toISOString().slice(0, 10);
await pool(all, 16, async (s) => {
  const r = await checkSite(s.website, s.phone);
  if (typeof r === "string") { why[r] = (why[r] || 0) + 1; s.unverified = true; }
  else { s.verified = today; s.verifiedUrl = r.url; why.verified = (why.verified || 0) + 1; s.siteText = r.text; }
});
console.log(`Website check of ${all.length} places:`, JSON.stringify(why));
for (const k of ["lock", "glass"]) out[k] = out[k].filter((s) => !s.unverified);
// A glass shop must advertise vehicle glass work: "auto glass" or a windshield in its name, or its website offering
// windshield / auto glass repair or replacement (a body shop that only mentions windshield wipers doesn't count).
const VEHICLE_GLASS = /\b(auto ?glass|automotive glass|vehicle glass|car glass|truck glass|(?:windshields?|windscreens?|glass|rock chips?|chips?)[ -](?:repairs?|replacements?|installation))\b/i;
const notVehicle = [];
out.glass = out.glass.filter((s) => { const ok = GLASS_NAME.test(s.name) || VEHICLE_GLASS.test(s.siteText); if (!ok) notVehicle.push(`${s.name} (${s.city}, ${s.state})`); return ok; });
console.log(`Left out ${notVehicle.length} glass shops whose website doesn't advertise vehicle glass work:\n  ` + notVehicle.join("\n  "));
for (const s of all) delete s.siteText;

const meta = { source: "OpenStreetMap contributors (ODbL), openstreetmap.org/copyright", fetched_at: new Date().toISOString() };
await writeData("locksmiths", { ...meta, count: out.lock.length, stores: out.lock }, 15);
await writeData("glass", { ...meta, count: out.glass.length, stores: out.glass }, 10);
