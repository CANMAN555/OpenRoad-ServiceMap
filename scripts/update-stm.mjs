// Downloads every Southern Tire Mart location from Southern Tire Mart's own store locator at
// stmtires.com (its regular stores, its shops inside Pilot Flying J travel centers, and STM
// Wholesale) and writes data/stm.json. The locator lists every store ID, then serves one record
// per store with address, phone, hours, services and coordinates.
// Some store coordinates are off by several miles (store 249 on Lamar Ave in Memphis was placed
// downtown), so every address is also matched with the U.S. Census geocoder and the Census point
// is used when the two disagree by more than 3 miles (closer than that, the store's own point is
// usually better than the Census estimate along a long rural road).
// Run by .github/workflows/update-vendors.yml.
import { censusGeocode, clean, fetchText, formatPhone, pool, writeData } from "./lib.mjs";

const BASE = "https://stmtires.com/wp-json/stm/v1";
const DAYS = [["monday", "Mon"], ["tuesday", "Tue"], ["wednesday", "Wed"], ["thursday", "Thu"], ["friday", "Fri"], ["saturday", "Sat"], ["sunday", "Sun"]];
const KIND = { "Southern Tire Mart": "Southern Tire Mart", STMPFJ: "Southern Tire Mart at Pilot Flying J", "STM Wholesale": "STM Wholesale" };

// "7:30am-5:30pm" -> "7:30 a.m. – 5:30 p.m."; "24 Hours" and "Closed" pass through.
function clock(t) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(t.trim());
  if (!m) return null;
  return `${+m[1]}${m[2] && m[2] !== "00" ? ":" + m[2] : ""} ${m[3].toLowerCase() === "am" ? "a.m." : "p.m."}`;
}
function dayHours(v) {
  const s = clean(v);
  if (!s) return null;
  if (/^closed$/i.test(s)) return "Closed";
  if (/^(open )?24 ?hours$/i.test(s)) return "24 hours";
  const [a, b] = s.split(/\s*[-–]\s*/);
  const from = a && clock(a), to = b && clock(b);
  return from && to ? `${from} – ${to}` : s;
}
const list = (s) => [...new Set(String(s || "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => clean(x.replace(/^"|"$/g, ""))).filter(Boolean))];
const miles = (a, b) => {
  const r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(x));
};

const ids = JSON.parse(await fetchText(`${BASE}/getAllLocationEntityIds`, { accept: "application/json" }));
console.log("store IDs:", ids.length);
const rows = (await pool(ids, 4, async (id) => {
  try { return JSON.parse(await fetchText(`${BASE}/getLocationByEntityId?entityId=${encodeURIComponent(id)}`, { accept: "application/json" })); }
  catch (e) { console.warn("skip", id, e.message); return null; }
})).filter(Boolean);
console.log("store records:", rows.length);

const stores = [];
for (const r of rows) {
  const lat = Number(r.latitude), lon = Number(r.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) { console.log("skip (no coordinates):", r.entity_id); continue; }
  const hours = DAYS.map(([k, day]) => ({ day, hours: dayHours(r["hours_" + k]) })).filter((d) => d.hours);
  stores.push({
    id: String(r.entity_id),
    name: `Southern Tire Mart ${clean(r.address_city) || ""}`.trim(),
    kind: KIND[clean(r.labels)] || "Southern Tire Mart",
    address: [clean(r.address_line_1), clean(r.address_line_2)].filter(Boolean).join(", ") || null,
    city: clean(r.address_city),
    state: clean(r.address_region),
    zip: clean(r.address_postal_code),
    phone: formatPhone(r.main_phone),
    hours,
    commercial: /^true$/i.test(r.is_commercial),
    retail: /^true$/i.test(r.is_retail),
    commercialServices: list(r.commercial_services),
    specialties: list(r.specialties),
    lat,
    lon,
    url: clean(r.permalink),
  });
}

const census = await censusGeocode(stores.filter((s) => s.address).map((s) => ({ id: s.id, street: s.address, city: s.city, state: s.state, zip: s.zip })));
let moved = 0;
for (const s of stores) {
  const c = census.get(s.id);
  if (c && miles([s.lat, s.lon], c) > 3) { console.log(`moved ${s.id} ${s.city}, ${s.state} by ${miles([s.lat, s.lon], c).toFixed(1)} mi to the Census match`); [s.lat, s.lon] = c; s.geo = "census"; moved++; }
}
console.log(`Census matched ${census.size} of ${stores.length}; moved ${moved}`);

stores.sort((a, b) => (a.state || "").localeCompare(b.state || "") || (a.city || "").localeCompare(b.city || "") || a.id.localeCompare(b.id));
await writeData("stm", { source: "Southern Tire Mart store locator (stmtires.com)", fetched_at: new Date().toISOString(), count: stores.length, stores }, 200);
