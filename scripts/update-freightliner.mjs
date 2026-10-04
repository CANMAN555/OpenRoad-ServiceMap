// Downloads every U.S. Freightliner location from Freightliner's own dealer locator
// (freightliner.com/dealer-search, which includes dealers, service points and ExpressPoint
// locations) and writes data/freightliner.json. Run by .github/workflows/update-vendors.yml.
import { readFile } from "node:fs/promises";
import { clean, fetchText, formatPhone, span, UA, writeData } from "./lib.mjs";

const API = "https://www.freightliner.com/umbraco/backoffice/dealers/geo-search?";
const CAP = 1000; // the locator returns at most this many results per box
const DAYS = [["monday", "Mon"], ["tuesday", "Tue"], ["wednesday", "Wed"], ["thursday", "Thu"], ["friday", "Fri"], ["saturday", "Sat"], ["sunday", "Sun"]];

const titleCase = (s) => clean(s) && clean(s).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Llc|Inc|Usa|Of|And|Ii|Iii)\b/g, (w) => ({ Llc: "LLC", Inc: "Inc", Usa: "USA", Of: "of", And: "and", Ii: "II", Iii: "III" }[w])).replace(/'S\b/g, "'s");

// Split any box that hits the result cap into four until every box is under it.
async function search(box, depth = 0) {
  const rows = JSON.parse(await fetchText(API + new URLSearchParams(box), { accept: "application/json" }));
  if (rows.length < CAP || depth > 6) return rows;
  const midLat = (box.north + box.south) / 2, midLng = (box.east + box.west) / 2;
  const parts = [
    { north: box.north, south: midLat, east: midLng, west: box.west },
    { north: box.north, south: midLat, east: box.east, west: midLng },
    { north: midLat, south: box.south, east: midLng, west: box.west },
    { north: midLat, south: box.south, east: box.east, west: midLng },
  ];
  const out = [];
  for (const p of parts) out.push(...(await search(p, depth + 1)));
  return out;
}

// Department schedule text is like "07:00AM 06:00PM " or "24 Hours".
function days(dept) {
  if (!dept || !dept.schedule) return [];
  return DAYS.map(([key, day]) => {
    const d = dept.schedule[key] || {};
    if (d.status === "AllDay") return { day, hours: "24 hours" };
    if (d.status === "Closed") return { day, hours: "Closed" };
    const m = /(\d{1,2}:\d{2}\s*[AP]M)\s+(\d{1,2}:\d{2}\s*[AP]M)/i.exec(d.text || "");
    return m ? { day, hours: span(m[1], m[2]) } : d.text ? { day, hours: clean(d.text) } : null;
  }).filter(Boolean);
}
// The locator's coordinates are often only accurate to the ZIP code, so pins would land in the
// wrong part of town. Love's/Speedco ExpressPoint sites (code "L" + Love's store number) take
// Love's exact coordinates; every other address is matched with the U.S. Census geocoder.
async function lovesCoords() {
  try {
    const j = JSON.parse(await readFile("data/loves.json", "utf8"));
    return new Map(j.stores.map((s) => [String(s.id), [s.lat, s.lon]]));
  } catch {
    return new Map();
  }
}
async function censusGeocode(list) {
  const out = new Map();
  const csvField = (v) => `"${String(v || "").replace(/"/g, "'")}"`;
  for (let i = 0; i < list.length; i += 1000) {
    const csv = list.slice(i, i + 1000).map((s) => [s.id, s.street, s.city, s.state, s.zip].map(csvField).join(",")).join("\n");
    const form = new FormData();
    form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
    form.append("benchmark", "Public_AR_Current");
    try {
      const r = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: form, headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      for (const line of (await r.text()).split("\n")) {
        const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
        if (cols[2] !== "Match" || !cols[5]) continue;
        const [lon, lat] = cols[5].split(",").map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lon)) out.set(cols[0], [lat, lon]);
      }
    } catch (e) {
      console.warn("Census geocoder unavailable:", e.message);
    }
  }
  return out;
}

const dept = (row, name) => (row.departments || []).find((d) => clean(d.name) && d.name.toLowerCase() === name);

const rows = await search({ north: 72, south: 17, east: -64, west: -180 });
const seen = new Set();
const stores = [];
for (const r of rows) {
  if (r.country !== "United States" || !r.latitude || !r.longitude) continue;
  const key = `${r.code}|${r.latitude}|${r.longitude}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const depts = [...new Set((r.departments || []).map((d) => titleCase(d.name)).filter(Boolean))];
  const auth = clean(r.authorizations && r.authorizations.FTLAuth);
  const services = (r.services || []).map(titleCase).filter(Boolean);
  const svcDept = dept(r, "service") || (r.service && r.service.fields && r.service.fields[0]);
  const web = clean(r.website);
  stores.push({
    id: r.code,
    name: titleCase(r.name),
    type: clean(r.entityType),
    auth,
    address: titleCase([r.address, r.address2].filter(Boolean).join(", ")),
    city: titleCase(r.city),
    state: clean(r.state),
    zip: clean(r.zip),
    phone: formatPhone(r.phone),
    afterHours: formatPhone(r.phoneAfterHours),
    wrecker: formatPhone(r.phoneWrecker),
    lat: r.latitude,
    lon: r.longitude,
    departments: depts,
    service: /service/i.test(auth || "") || depts.includes("Service"),
    eliteSupport: Boolean(r.eliteSupport),
    expressPoint: Boolean(r.isExpressPoint),
    atLoves: Boolean(r.isLoveService),
    speedco: Boolean(r.isSpeedcoService),
    eCertified: Boolean(r.isECertified),
    roadside: services.some((s) => /roadside/i.test(s)),
    roadside24: services.includes("24-Hour Roadside Repair"),
    towing: services.includes("Towing"),
    tires: services.includes("Tire Repair"),
    services,
    amenities: (r.amenitiesList || []).map(titleCase).filter(Boolean),
    hours: { service: days(svcDept), parts: days(dept(r, "parts")) },
    url: r.url ? new URL(r.url, "https://www.freightliner.com/").href : null,
    website: web ? (/^https?:\/\//i.test(web) ? web : "https://" + web.replace(/^\/+/, "")) : null,
  });
}
const loves = await lovesCoords();
const toGeocode = [];
for (const s of stores) {
  const m = /^L(\d+)$/.exec(s.id);
  if (m && loves.has(m[1])) [s.lat, s.lon, s.geo] = [...loves.get(m[1]), "loves"];
  else toGeocode.push({ id: s.id + "|" + stores.indexOf(s), street: s.address, city: s.city, state: s.state, zip: s.zip });
}
const census = await censusGeocode(toGeocode);
for (const g of toGeocode) {
  const s = stores[Number(g.id.split("|")[1])];
  if (census.has(g.id)) [s.lat, s.lon, s.geo] = [...census.get(g.id), "census"];
  else s.geo = "freightliner";
}

stores.sort((a, b) => (a.state || "").localeCompare(b.state || "") || (a.city || "").localeCompare(b.city || ""));
const count = (f) => stores.reduce((o, s) => ((o[f(s)] = (o[f(s)] || 0) + 1), o), {});
const payload = {
  source: "https://www.freightliner.com/dealer-search/",
  fetched_at: new Date().toISOString(),
  count: stores.length,
  counts: {
    auth: count((s) => s.auth),
    kind: count((s) => (s.atLoves ? "Love's" : s.speedco ? "Speedco" : "Dealer/service point")),
    expressPoint: count((s) => (s.expressPoint ? "yes" : "no")),
    eliteSupport: count((s) => (s.eliteSupport ? "yes" : "no")),
    coordinates: count((s) => s.geo),
  },
  stores,
};
console.log(`${rows.length} rows from the locator`, JSON.stringify(payload.counts));
await writeData("freightliner", payload, 500);
