// Checks every company location's pin against the U.S. Census geocoder's point for its street
// address and prints how far apart they are, worst first. It changes no data; it shows which
// pins (or which company's coordinates) need fixing. Run by .github/workflows/check-pins.yml.
import { readFile, writeFile } from "node:fs/promises";
import { censusGeocode } from "./lib.mjs";

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
    rows.push({ brand, id: String(s.id), name: s.name, street, city: s.city, state: s.state, zip: String(s.zip || "").slice(0, 5), lat: s.lat, lon: s.lon, ok: streetLike(street) });
  }
}
const census = await censusGeocode(rows.filter((r) => r.ok).map((r) => ({ id: `${r.brand}:${r.id}`, street: r.street, city: r.city, state: r.state, zip: r.zip })));
for (const r of rows) {
  const c = census.get(`${r.brand}:${r.id}`);
  if (c) Object.assign(r, { census: [c[0], c[1]], exact: c.exact, matched: c.matched, off: miles([r.lat, r.lon], c) });
}

const pct = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null);
console.log("brand        total  checked  median_mi  p90_mi  >0.5mi  >1mi  >3mi");
for (const brand of BRANDS) {
  const all = rows.filter((r) => r.brand === brand), m = all.filter((r) => r.off != null).map((r) => r.off).sort((a, b) => a - b);
  console.log([brand.padEnd(12), String(all.length).padStart(5), String(m.length).padStart(8), (pct(m, 0.5) ?? 0).toFixed(2).padStart(10), (pct(m, 0.9) ?? 0).toFixed(2).padStart(7),
    String(m.filter((d) => d > 0.5).length).padStart(7), String(m.filter((d) => d > 1).length).padStart(5), String(m.filter((d) => d > 3).length).padStart(5)].join(" "));
}
console.log("\nPins more than 1 mile from the Census point for their address (exact Census matches only):");
for (const r of rows.filter((r) => r.off > 1 && r.exact).sort((a, b) => b.off - a.off))
  console.log(`${r.off.toFixed(1).padStart(6)} mi  ${r.brand} ${r.id} ${r.name} | ${r.street}, ${r.city}, ${r.state} | pin ${r.lat},${r.lon} census ${r.census.map((v) => v.toFixed(6)).join(",")} | matched "${r.matched}"`);
await writeFile("pin-check.json", JSON.stringify(rows));
