// Downloads every Pomp's Tire Service location from pompstire.com/locations (each location card carries its
// name, address, phone and map point) and writes data/pomps.json. Locations that are the same shop as a pin
// already on the map are left out.
import { clean, fetchText, formatPhone, formatZip, liveMatcher, writeData } from "./lib.mjs";

const STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };
const html = await fetchText("https://www.pompstire.com/locations");
const attr = (tag, k) => { const m = new RegExp(`data-${k}="([^"]*)"`).exec(tag); return m ? clean(m[1]) : null; };
const stores = [], seen = new Set();
for (const m of html.matchAll(/<[a-z]+\b[^>]*\bdata-lat="[^"]*"[^>]*>/g)) {
  const tag = m[0], lat = Number(attr(tag, "lat")), lon = Number(attr(tag, "lng"));
  const full = attr(tag, "address") || "", city = attr(tag, "city"), stateName = attr(tag, "state") || "";
  const state = STATES[stateName.toLowerCase()] || (stateName.length === 2 ? stateName.toUpperCase() : null);
  const street = clean(full.split(",")[0]);
  const id = attr(tag, "searchable")?.split(" ")[0] || `${lat},${lon}`;
  if (!Number.isFinite(lat) || !street || !city || !state || seen.has(id)) continue;
  seen.add(id);
  stores.push({ id, name: `Pomp's Tire ${attr(tag, "name") || city}`, address: street, city, state, zip: formatZip(attr(tag, "zip")), phone: formatPhone(attr(tag, "phone")), lat, lon,
    services: ["Tires", "Repair"], url: "https://www.pompstire.com/locations" });
}
const isLive = await liveMatcher(), before = stores.length;
const kept = stores.filter((s) => s.phone && !isLive(s));
console.log(`Found ${before} Pomp's locations; left out ${before - kept.length} with no phone or already on the map`);
await writeData("pomps", { source: "https://www.pompstire.com/locations", fetched_at: new Date().toISOString(), count: kept.length, stores: kept }, 50);
