// Downloads every Love's location from Love's own store search (the same feed loves.com's
// store locator uses) and writes data/loves.json. Run by .github/workflows/update-loves.yml.
// Falls back to the latest All The Places run (CC0, scraped weekly from loves.com) if Love's
// blocks the request.
import { writeFile } from "node:fs/promises";

const UA = "Mozilla/5.0 (compatible; OpenRoadServiceMap/1.0; +https://github.com/CANMAN555/OpenRoad-ServiceMap)";
const PAGE_SIZE = 100;

const pick = (o, ...keys) => {
  for (const k of keys) {
    const v = k.split(".").reduce((x, p) => (x == null ? x : x[p]), o);
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
};
const clean = (s) => (s == null ? null : String(s).replace(/\s+/g, " ").trim() || null);

function formatPhone(p) {
  const d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : clean(p);
}

async function canonicalUrls() {
  const map = {};
  try {
    const r = await fetch("https://www.loves.com/sitemap-locations.xml", { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const xml = await r.text();
    for (const [, url] of xml.matchAll(/<loc>\s*(https:\/\/www\.loves\.com\/locations\/[^<\s]+)\s*<\/loc>/g)) {
      const id = url.split("-").pop().replace(/\/$/, "");
      map[id] = url;
    }
  } catch (e) {
    console.warn("Sitemap unavailable:", e.message);
  }
  return map;
}

async function fromLoves() {
  const urls = await canonicalUrls();
  const stores = [];
  for (let page = 0; page < 50; page++) {
    const r = await fetch("https://www.loves.com/api/search_stores", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
      body: JSON.stringify({ pageNumber: page, pageSize: String(PAGE_SIZE), lat: 36.5489, lng: -118.9127 }),
    });
    if (!r.ok) throw new Error("search_stores HTTP " + r.status);
    const j = await r.json();
    const batch = j.stores || [];
    if (page === 0 && batch[0]) {
      console.log("Sample store keys:", Object.keys(batch[0]).join(", "));
      console.log("Sample store:", JSON.stringify(batch[0]).slice(0, 3000));
    }
    stores.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return stores.map((s) => {
    const number = clean(pick(s, "number", "storeNumber", "id"));
    const type = clean(pick(s, "storeSearchData.name", "facilityType", "type")) || "Travel Stop";
    return {
      id: number,
      name: clean(pick(s, "preferredName", "name")) || `Love's #${number}`,
      type,
      brand: type === "Speedco" ? "Speedco" : "Love's",
      address: clean(pick(s, "address", "address1", "streetAddress", "addr_full", "address.street")),
      city: clean(pick(s, "city", "address.city")),
      state: clean(pick(s, "state", "stateCode", "address.state")),
      zip: clean(pick(s, "zip", "zipCode", "postalCode", "postcode", "address.zip")),
      phone: formatPhone(pick(s, "phone", "phoneNumber", "mainPhone", "storePhone")),
      lat: Number(pick(s, "latitude", "lat", "location.lat")),
      lon: Number(pick(s, "longitude", "lng", "lon", "location.lng")),
      url: (number && urls[number]) || (number ? `https://www.loves.com/locations/${number}` : "https://www.loves.com/locations"),
    };
  });
}

async function fromAllThePlaces() {
  const latest = await (await fetch("https://alltheplaces-data.openaddresses.io/runs/latest.json", { headers: { "User-Agent": UA } })).json();
  const runId = latest.run_id || latest.id;
  const gj = await (await fetch(`https://alltheplaces-data.openaddresses.io/runs/${runId}/output/loves_us.geojson`, { headers: { "User-Agent": UA } })).json();
  console.log("All The Places run", runId);
  return gj.features.map((f) => {
    const p = f.properties;
    const type = /speedco/i.test(p.brand || "") ? "Speedco" : /country store/i.test(p.branch || p.name || "") ? "Country Store" : "Travel Stop";
    return {
      id: clean(p.ref),
      name: clean(p.branch || p.name),
      type,
      brand: p.brand || "Love's",
      address: clean(p["addr:street_address"]),
      city: clean(p["addr:city"]),
      state: clean(p["addr:state"]),
      zip: clean(p["addr:postcode"]),
      phone: formatPhone(p.phone),
      lat: f.geometry?.coordinates?.[1],
      lon: f.geometry?.coordinates?.[0],
      url: p.website || "https://www.loves.com/locations",
    };
  });
}

let source, stores;
try {
  stores = await fromLoves();
  source = "Love's store search (loves.com/api/search_stores)";
} catch (e) {
  console.warn("Love's feed failed, using All The Places:", e.message);
  stores = await fromAllThePlaces();
  source = "All The Places (data scraped weekly from loves.com, CC0)";
}

const seen = new Set();
stores = stores
  .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.lat > 17 && s.lat < 72 && s.lon > -180 && s.lon < -60)
  .filter((s) => (s.id ? !seen.has(s.id) && seen.add(s.id) : true))
  .sort((a, b) => (a.state || "").localeCompare(b.state || "") || (a.city || "").localeCompare(b.city || ""));

if (stores.length < 300) throw new Error(`Only ${stores.length} locations found; refusing to overwrite data/loves.json`);

const counts = stores.reduce((m, s) => ((m[s.type] = (m[s.type] || 0) + 1), m), {});
console.log(`Writing ${stores.length} locations`, counts);
await writeFile(
  "data/loves.json",
  JSON.stringify({ source, fetched_at: new Date().toISOString(), count: stores.length, counts, stores }, null, 0) + "\n",
);
