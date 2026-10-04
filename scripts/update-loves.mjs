// Downloads every Love's location from Love's own store search (the same feed loves.com's
// store locator uses) and writes data/loves.json. Run by .github/workflows/update-loves.yml.
// Falls back to the latest All The Places run (CC0, scraped weekly from loves.com) if Love's
// blocks the request.
import { mkdir, writeFile } from "node:fs/promises";

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

// Love's feed sometimes answers 500 for a few seconds; retry with backoff before giving up.
async function searchStores(body) {
  let last;
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch("https://www.loves.com/api/search_stores", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
      body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
    last = "HTTP " + r.status;
    console.warn(`search_stores ${last}, retrying`);
    await new Promise((res) => setTimeout(res, 5000 * (attempt + 1)));
  }
  throw new Error("search_stores " + last);
}

// "06:00:00" -> "6 AM", "22:30:00" -> "10:30 PM"
function clock(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  if (!m) return null;
  const h = +m[1], min = m[2], ap = h >= 12 && h < 24 ? "PM" : "AM", h12 = h % 12 || 12;
  return `${h12}${min === "00" ? "" : ":" + min} ${ap}`;
}
const fieldMap = (list) => Object.fromEntries((list || []).filter((f) => f && f.fieldName).map((f) => [f.fieldName, clean(f.fieldValue)]));

// Services Love's advertises that mean there is a repair/tire shop on site.
const SHOP_SERVICES = [
  "Light Mechanical", "Tire Services", "Commercial Truck Oil Change", "Speedco On-Site", "TirePass In-Service Center",
  "International® Warranty", "Freightliner® ExpressPoint℠", "CARB Clean Truck Check",
];

async function fromLoves() {
  const urls = await canonicalUrls();
  const stores = [];
  for (let page = 0; page < 50; page++) {
    const j = await searchStores({ pageNumber: page, pageSize: String(PAGE_SIZE), lat: 36.5489, lng: -118.9127 });
    const batch = j.stores || [];
    stores.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return stores.map((s) => {
    const number = clean(pick(s, "number", "storeNumber", "id"));
    const type = clean(pick(s, "facilitySubtypeName", "storeSearchData.name")) || "Travel Stop";
    const flags = Object.fromEntries((s.customFields || []).map((f) => [f.fieldName, f.fieldValue]));
    const mc = s.mappedCustomFields || {};
    const amenities = new Set((mc.amenities || []).filter((f) => f.fieldValue === "true").map((f) => f.fieldName));
    const extra = new Set((mc.additionalAmenities || []).filter((f) => f.fieldValue === "true").map((f) => f.fieldName));
    const facilityHours = fieldMap(mc.facilityHoursOfOperation);
    const services = SHOP_SERVICES.filter((n) => amenities.has(n) || extra.has(n));
    if (amenities.has("Truck Wash")) services.push("Truck Wash");
    const shopOnSite = type === "Truck Service" || services.some((n) => n !== "Truck Wash" && n !== "CARB Clean Truck Check") || !!facilityHours["Truck Care"];
    const days = (mc.businessHours || []).filter((f) => f.fieldName && clean(f.fieldValue)).map((f) => ({ day: f.fieldName, hours: clean(f.fieldValue) }));
    const restaurants = (mc.restaurants || []).filter((r) => r && r.restaurantName).map((r) => {
      const h = (r.conceptHours || [])[0];
      const hours = !h ? null : h.isOpen24Hours ? "Open 24 hours" : clock(h.openTime) && clock(h.closeTime) ? `${clock(h.openTime)} to ${clock(h.closeTime)}` : null;
      return { name: r.restaurantName, hours };
    });
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
      highway: clean(s.highway),
      exit: clean(s.exitNumber),
      roadService24: flags["24hourroadservice"] === "true",
      shop: {
        onSite: shopOnSite,
        services,
        truckCare24: flags["24hourtruckcare"] === "true",
        speedcoNearby: flags["speedconearby"] === "true" && !amenities.has("Speedco On-Site"),
      },
      fuel: [...new Set((s.fuelPrices || []).map((f) => clean(f.fuelType)).filter(Boolean))],
      roadsideAssistance: extra.has("Roadside Assistance"),
      hours: {
        store: facilityHours["Store"] || null,
        truckCare: facilityHours["Truck Care"] || null,
        truckWash: facilityHours["Truck Wash"] || null,
        days,
        restaurants,
      },
      tireCare: s.isTireCare === true,
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
await mkdir("data", { recursive: true });
await writeFile(
  "data/loves.json",
  JSON.stringify({ source, fetched_at: new Date().toISOString(), count: stores.length, counts, stores }, null, 0) + "\n",
);
