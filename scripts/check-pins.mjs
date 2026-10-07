// Checks every company location's pin against the U.S. Census geocoder's point for its street
// address. Where the two disagree by more than half a mile, OpenStreetMap's geocoder (Nominatim)
// gives a third opinion, and a pin is only moved when the Census and OpenStreetMap agree with each
// other (within 0.3 mi) and both disagree with the company's pin. Moves are saved in
// data/pin-fixes.json, which the update scripts apply on every weekly refresh.
// Usage: node scripts/check-pins.mjs [--apply]. Run by .github/workflows/check-pins.yml.
import { readFile, writeFile } from "node:fs/promises";
import { applyPinFixes, censusGeocode, UA } from "./lib.mjs";

const APPLY = process.argv.includes("--apply");

const BRANDS = ["loves", "ta", "freightliner", "volvo", "boss", "utility", "prestige", "timpte", "thermoking", "carrier", "fleetpride", "stm"];
const miles = (a, b) => {
  const r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(x));
};
// A street address the Census can match: has a house number and isn't a highway mile marker.
const streetLike = (a) => /^\s*\d+[A-Za-z]?\s+\S/.test(a || "") && !/\bmile(\s+marker)?\s*\d|\bexit\s+\d|\bMM\s*\d/i.test(a);

const rows = [];
for (const brand of BRANDS) {
  const { stores } = JSON.parse(await readFile(`data/${brand}.json`, "utf8"));
  for (const s of stores) {
    const street = String(s.address || "").split(/,\s*(?:suite|ste|unit|#)/i)[0];
    rows.push({ brand, id: String(s.id), name: s.name, address: s.address, street, city: s.city, state: s.state, zip: String(s.zip || "").slice(0, 5), lat: s.lat, lon: s.lon, ok: streetLike(street) });
  }
}
const census = await censusGeocode(rows.filter((r) => r.ok).map((r) => ({ id: `${r.brand}:${r.id}`, street: r.street, city: r.city, state: r.state, zip: r.zip })));
for (const r of rows) {
  const c = census.get(`${r.brand}:${r.id}`);
  if (c) Object.assign(r, { census: [c[0], c[1]], exact: c.exact, matched: c.matched, off: miles([r.lat, r.lon], c) });
}

// Third opinion from Nominatim for every pin more than half a mile from its Census point. Only an
// answer for the house number itself counts; a street or town centre would prove nothing.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function nominatim(r) {
  const q = new URLSearchParams({ street: r.street, city: r.city || "", state: r.state || "", postalcode: r.zip || "", countrycodes: "us", format: "jsonv2", addressdetails: "1", limit: "1" });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://nominatim.openstreetmap.org/search?" + q, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const [hit] = await res.json();
      return hit && hit.address?.house_number ? [Number(hit.lat), Number(hit.lon)] : null;
    } catch (e) { console.warn("Nominatim:", e.message); await sleep(5000 * (attempt + 1)); }
  }
  return null;
}
const disputed = rows.filter((r) => r.off > 0.5);
console.log(`Asking OpenStreetMap about ${disputed.length} pins more than 0.5 mi from their Census point…`);
for (const r of disputed) {
  const o = await nominatim(r);
  await sleep(1100); // Nominatim's usage policy: at most one request per second
  if (!o) { r.verdict = "unsure"; continue; }
  r.osm = o;
  const pinOsm = miles([r.lat, r.lon], o), censusOsm = miles(r.census, o);
  r.verdict = pinOsm <= 0.5 ? "keep" : censusOsm <= 0.3 ? "move" : "unsure";
}

const pct = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null);
console.log("brand        total  checked  median_mi  p90_mi  >0.5mi  >1mi  >3mi");
for (const brand of BRANDS) {
  const all = rows.filter((r) => r.brand === brand), m = all.filter((r) => r.off != null).map((r) => r.off).sort((a, b) => a - b);
  console.log([brand.padEnd(12), String(all.length).padStart(5), String(m.length).padStart(8), (pct(m, 0.5) ?? 0).toFixed(2).padStart(10), (pct(m, 0.9) ?? 0).toFixed(2).padStart(7),
    String(m.filter((d) => d > 0.5).length).padStart(7), String(m.filter((d) => d > 1).length).padStart(5), String(m.filter((d) => d > 3).length).padStart(5)].join(" "));
}
const tally = disputed.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {});
console.log("\nPins more than 0.5 mi off:", JSON.stringify(tally), "(keep = OpenStreetMap agrees with the company; move = Census and OpenStreetMap agree on another spot)");
for (const r of disputed.sort((a, b) => b.off - a.off))
  console.log(`${r.verdict.padEnd(6)} ${r.off.toFixed(1).padStart(5)} mi  ${r.brand} ${r.id} ${r.name} | ${r.street}, ${r.city}, ${r.state} | pin ${r.lat},${r.lon} census ${r.census.map((v) => v.toFixed(5)).join(",")}${r.osm ? " osm " + r.osm.map((v) => v.toFixed(5)).join(",") : ""}`);
await writeFile("pin-check.json", JSON.stringify(rows));

// Keep earlier fixes whose store still lists the same address, and add the new ones.
let fixes = {};
try { fixes = JSON.parse(await readFile("data/pin-fixes.json", "utf8")); } catch {}
const live = new Map(rows.map((r) => [`${r.brand}:${r.id}`, r]));
for (const k of Object.keys(fixes)) if (!live.has(k)) delete fixes[k];
for (const r of disputed.filter((r) => r.verdict === "move")) {
  const lat = +((r.census[0] + r.osm[0]) / 2).toFixed(6), lon = +((r.census[1] + r.osm[1]) / 2).toFixed(6);
  fixes[`${r.brand}:${r.id}`] = { address: r.address, lat, lon, why: `Company pin was ${r.off.toFixed(1)} mi from the street address; U.S. Census and OpenStreetMap agree on this point (checked ${new Date().toISOString().slice(0, 10)})` };
}
console.log(`${Object.keys(fixes).length} pin fixes on file`);
if (APPLY) {
  await writeFile("data/pin-fixes.json", JSON.stringify(Object.fromEntries(Object.entries(fixes).sort()), null, 1) + "\n");
  for (const brand of BRANDS) {
    const file = `data/${brand}.json`, d = JSON.parse(await readFile(file, "utf8"));
    if (await applyPinFixes(brand, d.stores)) await writeFile(file, JSON.stringify(d) + "\n");
  }
}
