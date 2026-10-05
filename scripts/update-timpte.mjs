// Downloads the Timpte location list from Timpte's dealer locator at timpteequipmenttrailers.com/find-a-dealer
// (Timpte-owned Factory Direct Customer Support Centers plus Timpte equipment trailer dealers) and writes
// data/timpte.json. The page embeds every location as JSON ("jsonLocations").
// timpte.com/locations would also list Super Hopper dealers, but its search returns no results (the page's
// script fails to load), so it is not used.
// Run by .github/workflows/update-vendors.yml.
import { clean, fetchText, formatPhone, writeData } from "./lib.mjs";

const PAGE = "https://timpteequipmenttrailers.com/find-a-dealer";
const STATES = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY" };
const ABBR = new Set(Object.values(STATES));
const decode = (s) => clean(String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&#8217;/g, "’").replace(/&quot;/g, '"').replace(/&nbsp;/g, " "));

const html = await fetchText(PAGE);
const at = html.indexOf("jsonLocations:");
if (at < 0) throw new Error("Timpte dealer page has no jsonLocations data");
// Bracket-match the JSON object that follows (strings can contain braces).
const start = html.indexOf("{", at);
let depth = 0, end = -1, inStr = false;
for (let i = start; i < html.length; i++) {
  const c = html[i];
  if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true;
  else if (c === "{" || c === "[") depth++;
  else if (c === "}" || c === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
}
const { items = [] } = JSON.parse(html.slice(start, end));
console.log("locations in feed:", items.length);

const stores = [];
for (const it of items) {
  const lat = Number(it.lat), lon = Number(it.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
  const p = it.popup_html || "";
  const web = (/<a href="\s*(https?:[^"]+?)\s*"/.exec(p) || [])[1];
  const tel = (/href="tel:([^"]+)"/.exec(p) || [])[1];
  // After the title and website the popup lists: street <br> city <br> "State, ZIP" <br> Phone Number: ...
  const body = p.replace(/<h3[\s\S]*?<\/h3>/, "").replace(/<a [^>]*class="amlocator-link"[^>]*>(?!\s*<span)[\s\S]*?<\/a>/, "");
  const lines = body.split(/<br\s*\/?>/i).map(decode).filter((x) => x && !/^Phone Number/i.test(x));
  const sIdx = lines.findIndex((x) => /^([A-Za-z .]+),\s*(\d{4,5})\b/.test(x) && (STATES[x.split(",")[0].trim()] || ABBR.has(x.split(",")[0].trim())));
  if (sIdx < 0) { console.log("skip (no U.S. state):", it.name); continue; }
  const [stName, zipPart] = lines[sIdx].split(",").map((x) => x.trim());
  const name = decode(it.name);
  const csc = /^Timpte\s*-/i.test(name);
  stores.push({
    id: String(it.id),
    name: csc ? name.replace(/^Timpte\s*-\s*/, "Timpte of ").replace(/ of DC CSC$/, " of David City") : name,
    type: csc ? "Factory Direct Customer Support Center" : "Equipment Trailer Dealer",
    address: lines.slice(0, Math.max(0, sIdx - 1)).join(", ") || null,
    city: sIdx > 0 ? lines[sIdx - 1] : null,
    state: STATES[stName] || stName,
    zip: zipPart.match(/\d+/)[0].padStart(5, "0").slice(0, 5),
    phone: formatPhone(tel),
    lat,
    lon,
    website: web && !/^https:\/\/timpte\.com\/?$/.test(web) ? web : null,
  });
}
stores.sort((a, b) => (a.type === b.type ? 0 : a.type < b.type ? 1 : -1) || a.state.localeCompare(b.state) || (a.city || "").localeCompare(b.city || ""));
const payload = {
  source: PAGE,
  fetched_at: new Date().toISOString(),
  count: stores.length,
  counts: stores.reduce((o, s) => ((o[s.type] = (o[s.type] || 0) + 1), o), {}),
  stores,
};
console.log(JSON.stringify(payload.counts));
await writeData("timpte", payload, 40);
