// Small helpers shared by the vendor update scripts.
import { mkdir, readFile, writeFile } from "node:fs/promises";

export const UA = "Mozilla/5.0 (compatible; OpenRoadServiceMap/1.0; +https://github.com/CANMAN555/OpenRoad-ServiceMap)";

// Turns HTML character references some feeds leave in their text ("O&#x27;Donnell", "&nbsp;") into characters.
const NAMED = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : NAMED[e.toLowerCase()] ?? m);
export const clean = (s) => (s == null ? null : decode(String(s)).replace(/\s+/g, " ").trim() || null);
// "917523253" -> "91752-3253"; five-digit ZIPs and ZIP+4 with a dash pass through.
export const formatZip = (z) => { const c = clean(z); return c && /^\d{9}$/.test(c) ? `${c.slice(0, 5)}-${c.slice(5)}` : c; };

export function formatPhone(p) {
  const d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d === "5555555555") return null; // placeholder some feeds use
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : clean(p);
}

// GET with retries and backoff; these sites occasionally answer 5xx for a few seconds.
export async function fetchText(url, { tries = 5, accept = "*/*" } = {}) {
  let last;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: accept } });
      if (r.ok) return await r.text();
      if (r.status === 404) throw Object.assign(new Error("HTTP 404"), { notFound: true });
      last = "HTTP " + r.status;
    } catch (e) {
      if (e.notFound) throw e;
      last = e.message;
    }
    await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
  }
  throw new Error(`${url}: ${last}`);
}

// "08:00AM" / "8:00 AM" / "17:30" -> "8 a.m." / "5:30 p.m."
export function clock(t) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AP]M)?\s*$/i.exec(t || "");
  if (!m) return null;
  const min = m[2];
  const ap = m[3] ? m[3].toUpperCase() : +m[1] >= 12 && +m[1] < 24 ? "PM" : "AM";
  const h = +m[1] % 12 || 12;
  return `${h}${min === "00" ? "" : ":" + min} ${ap === "AM" ? "a.m." : "p.m."}`;
}
export const span = (a, b) => {
  const s = clock(a), e = clock(b);
  if (!s || !e) return null;
  if (s === e && /^12 a\.m\.$/.test(s)) return "24 hours";
  return `${s} – ${e}`;
};

// Pin corrections found by scripts/check-pins.mjs: { "brand:id": { address, lat, lon, why } }.
// A correction is used only while the company still lists the same street address, so a store that
// moves gets the company's new coordinates instead of an old fix.
const sameAddress = (a, b) => String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "") === String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export async function applyPinFixes(name, stores) {
  let fixes = {};
  try { fixes = JSON.parse(await readFile("data/pin-fixes.json", "utf8")); } catch { return 0; }
  let n = 0;
  for (const s of stores) {
    const f = fixes[`${name}:${s.id}`];
    if (f && sameAddress(f.address, s.address)) { s.lat = f.lat; s.lon = f.lon; s.geo = "checked"; n++; }
  }
  if (n) console.log(`Applied ${n} checked pin locations to ${name}`);
  return n;
}

export async function writeData(name, payload, min) {
  if (payload.stores.length < min) throw new Error(`Only ${payload.stores.length} ${name} locations (expected at least ${min}); not writing.`);
  await applyPinFixes(name, payload.stores);
  await mkdir("data", { recursive: true });
  await writeFile(`data/${name}.json`, JSON.stringify(payload) + "\n");
  console.log(`Wrote data/${name}.json with ${payload.stores.length} locations`);
}

export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n], n);
    }
  }));
  return out;
}

// Street-level coordinates from the U.S. Census Bureau's free batch geocoder.
// list: [{id, street, city, state, zip}] -> Map(id -> [lat, lon]) for the addresses it matched.
export async function censusGeocode(list) {
  const out = new Map();
  const csvField = (v) => `"${String(v || "").replace(/"/g, "'")}"`;
  for (let i = 0; i < list.length; i += 200) {
    const csv = list.slice(i, i + 200).map((s) => [s.id, s.street, s.city, s.state, s.zip].map(csvField).join(",")).join("\n");
    for (let attempt = 0; attempt < 4; attempt++) {
      const form = new FormData();
      form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
      form.append("benchmark", "Public_AR_Current");
      try {
        const r = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: form, headers: { "User-Agent": UA } });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const text = await r.text();
        // The geocoder sometimes answers 200 with an error page instead of results; retry those.
        if (!/"Match"|"No_Match"|"Tie"/.test(text)) throw new Error("unexpected answer: " + text.slice(0, 120).replace(/\s+/g, " "));
        for (const line of text.split("\n")) {
          const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
          if (cols[2] !== "Match" || !cols[5]) continue;
          const [lon, lat] = cols[5].split(",").map(Number);
          // The array is [lat, lon] for existing callers; .exact and .matched say how sure the Census is.
          if (Number.isFinite(lat) && Number.isFinite(lon)) out.set(cols[0], Object.assign([lat, lon], { exact: cols[3] === "Exact", matched: cols[4] }));
        }
        break;
      } catch (e) {
        console.warn(`Census geocoder (batch ${i / 200 + 1}, try ${attempt + 1}):`, e.message);
        await new Promise((res) => setTimeout(res, 10000 * (attempt + 1)));
      }
    }
  }
  return out;
}

// Companies that already have their own layer on the map. New vendor layers leave out any location that is the same
// shop as one of their pins: within about 500 feet AND sharing a distinctive word of the name ("TransEdge Truck
// Centers" next to a Volvo pin named "Transedge Truck Centers"), or sharing the phone number within about a mile.
// A different business next door, like an independent tire shop across the lot from a Love's, stays.
export const LIVE_LAYERS = ["loves", "ta", "freightliner", "volvo", "boss", "utility", "prestige", "timpte", "thermoking", "carrier", "fleetpride", "stm"];
const GENERIC = new Set("truck trucks trucking center centers centre service services svc tire tires repair repairs shop inc llc co corp company the and of at commercial sales parts equipment trailer trailers fleet diesel heavy duty auto group sc ctr travel stop stops mobile road".split(" "));
const words = (name) => new Set(String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !GENERIC.has(w) && !/^\d+$/.test(w)));
export async function liveMatcher(extra = []) {
  const pts = [];
  const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);
  for (const k of [...LIVE_LAYERS, ...extra]) {
    let d;
    try { d = JSON.parse(await readFile(`data/${k}.json`, "utf8")); } catch { continue; }
    for (const s of d.stores) if (Number.isFinite(s.lat)) pts.push([s.lat, s.lon, new Set([digits(s.phone), digits(s.servicePhone)].filter((n) => n.length === 10)), words(s.name)]);
  }
  const within = (lat, lon, a, b, deg) => Math.abs(a - lat) < deg && Math.abs((b - lon) * Math.cos(lat * Math.PI / 180)) < deg;
  return (s) => {
    // City names in store names ("Rush Truck Centers – Dallas") don't make two businesses the same shop.
    const city = words(s.city), ph = digits(s.phone), w = [...words(s.name)].filter((x) => !city.has(x));
    return pts.some(([a, b, phones, names]) =>
      (within(s.lat, s.lon, a, b, 0.0015) && w.some((x) => names.has(x))) || (phones.has(ph) && within(s.lat, s.lon, a, b, 0.015)));
  };
}
