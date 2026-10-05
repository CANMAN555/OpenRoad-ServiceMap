// Downloads the Utility Trailer dealer directory (utilitytrailer.com/dealers), keeps U.S. locations
// and writes data/utility.json. The page embeds every dealer's map marker as a JSON array.
// Run by .github/workflows/update-vendors.yml.
import { clean, fetchText, formatPhone, writeData } from "./lib.mjs";

const PAGE = "https://www.utilitytrailer.com/dealers";
const STATES = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY" };
const ABBR = new Set(Object.values(STATES));
const decode = (s) => clean(String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&#8217;/g, "’").replace(/&quot;/g, '"').replace(/&nbsp;/g, " "));

const html = await fetchText(PAGE);
const at = html.indexOf("SABAI.GoogleMaps.map(");
if (at < 0) throw new Error("Utility dealer page has no map marker data");
const start = html.indexOf("[{", at);
// Find the end of the JSON array by bracket matching (strings can contain brackets).
let depth = 0, end = -1, inStr = false;
for (let i = start; i < html.length; i++) {
  const c = html[i];
  if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true;
  else if (c === "[" || c === "{") depth++;
  else if (c === "]" || c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
}
const markers = JSON.parse(html.slice(start, end));
console.log("markers:", markers.length);

const stores = [];
for (const m of markers) {
  const c = m.content || "";
  const link = /sabai-directory-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(c);
  const cats = decode((/sabai-directory-category">([\s\S]*?)<\/div>/.exec(c) || [])[1]);
  const loc = (/sabai-directory-location">([\s\S]*?)<\/div>/.exec(c) || [])[1] || "";
  const lines = loc.split(/<br\s*\/?>/i).map(decode).filter(Boolean);
  const country = lines.length && /^[A-Z]{2}$/.test(lines[lines.length - 1]) ? lines.pop() : null;
  if (country && country !== "US") continue;
  const csz = /^(.*?),\s*(.+?)\s+(\d{4,5}(?:-\d{4})?)$/.exec(lines[lines.length - 1] || "");
  if (!csz) continue;
  const st = STATES[csz[2]] || (ABBR.has(csz[2]) ? csz[2] : null);
  if (!st) continue; // Canada, Mexico, Chile
  const lat = Number(m.lat), lon = Number(m.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  const departments = (cats || "").split("|").map((x) => x.trim()).filter(Boolean);
  const tel = /href="tel:([^"]+)"/.exec(c);
  stores.push({
    id: link ? link[1].replace(/\/$/, "").split("/").pop() : `${lat},${lon}`,
    name: link ? decode(link[2]) : "Utility Trailer dealer",
    address: lines.slice(0, -1).join(", ") || null,
    city: clean(csz[1]),
    state: st,
    zip: csz[3].split("-")[0].padStart(5, "0"),
    phone: tel ? formatPhone(tel[1]) : null,
    lat,
    lon,
    departments,
    service: departments.some((d) => /service/i.test(d) && !/^parts only$/i.test(d)),
    parts: departments.some((d) => /parts/i.test(d)),
    sales: departments.some((d) => /sales/i.test(d)),
    cargobull: departments.some((d) => /cargobull/i.test(d)),
    mobile: departments.some((d) => /mobile/i.test(d)),
    url: link ? link[1] : PAGE,
  });
}
stores.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
const payload = { source: PAGE, fetched_at: new Date().toISOString(), count: stores.length, stores };
await writeData("utility", payload, 60);
