// Builds data/places.json, the U.S. city list behind the From / To / Truck location suggestions.
// Inputs are public-domain U.S. Census files downloaded by .github/workflows/build-places.yml:
//   gazetteer.txt  - 2024 Gazetteer places file (every city, town, village and CDP with its center point)
//   population.csv - 2024 city and town population estimates (used to rank suggestions)
import { readFile, mkdir, writeFile } from "node:fs/promises";

const [gaz, pop] = await Promise.all([readFile("gazetteer.txt", "utf8"), readFile("population.csv", "latin1")]);

// Population by 7-digit place GEOID (state FIPS + place FIPS), incorporated places only (SUMLEV 162).
const csvLine = (l) => [...l.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].map((m) => (m[2] !== undefined ? m[2] : m[1])).slice(0, -1);
const popRows = pop.trim().split(/\r?\n/);
const head = csvLine(popRows[0]);
const col = (n) => head.indexOf(n);
const popCol = head.filter((h) => /^POPESTIMATE\d{4}$/.test(h)).sort().pop();
const population = new Map();
for (const l of popRows.slice(1)) {
  const r = csvLine(l);
  if (r[col("SUMLEV")] !== "162") continue;
  population.set(r[col("STATE")] + r[col("PLACE")], Number(r[col(popCol)]) || 0);
}

// "Omaha city" -> "Omaha", "Nashville-Davidson metropolitan government (balance)" -> "Nashville-Davidson",
// "Lake Havasu City city" -> "Lake Havasu City", "Chalco CDP" -> "Chalco".
const cleanName = (n) => n.replace(/\s*\(balance\)$/, "").replace(/\s+CDP$/, "").replace(/(\s+[a-z][a-z.'-]*)+$/, "").trim();

const rows = gaz.trim().split(/\r?\n/).map((l) => l.split("\t").map((s) => s.trim()));
const h = rows[0];
const i = (n) => h.indexOf(n);
const all = [];
for (const r of rows.slice(1)) {
  const st = r[i("USPS")], name = cleanName(r[i("NAME")] || "");
  const lat = Number(r[i("INTPTLAT")]), lon = Number(r[i("INTPTLONG")]);
  if (!st || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  all.push([name, st, Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, population.get(r[i("GEOID")]) || 0]);
}
all.sort((a, b) => b[4] - a[4] || a[0].localeCompare(b[0]));
// A town and a CDP can share a name in one state; keep the larger (listed first after sorting).
const seen = new Set();
const places = all.filter((p) => {
  const key = p[0].toLowerCase() + "|" + p[1];
  return seen.has(key) ? false : seen.add(key);
});
if (places.length < 20000) throw new Error(`Only ${places.length} places parsed; not writing.`);
await mkdir("data", { recursive: true });
await writeFile(
  "data/places.json",
  JSON.stringify({ source: "U.S. Census Bureau 2024 Gazetteer and population estimates", fetched_at: new Date().toISOString(), fields: ["name", "state", "lat", "lon", "population"], places }) + "\n",
);
console.log(`Wrote ${places.length} places (${places.filter((p) => p[4]).length} with population, from ${popCol})`);
