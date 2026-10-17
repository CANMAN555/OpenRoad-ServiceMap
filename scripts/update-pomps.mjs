// Downloads every Pomp's Tire Service location from pompstire.com/locations (each location card carries its
// name, address, phone, map point and a link to the store's own page, where its hours are) and writes data/pomps.json.
import { clean, fetchText, formatPhone, formatZip, pool, writeData } from "./lib.mjs";

const STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };
const html = await fetchText("https://www.pompstire.com/locations");
const attr = (tag, k) => { const m = new RegExp(`data-${k}="([^"]*)"`).exec(tag); return m ? clean(m[1]) : null; };
const stores = [], seen = new Set();
const cards = [...html.matchAll(/<[a-z]+\b[^>]*\bdata-lat="[^"]*"[^>]*>/g)];
for (const [i, m] of cards.entries()) {
  const card = html.slice(m.index, i + 1 < cards.length ? cards[i + 1].index : m.index + 8000);
  const page = (/href="(https:\/\/locations\.pompstire\.com\/[^"#?]+)"/.exec(card) || [])[1];
  const tag = m[0], lat = Number(attr(tag, "lat")), lon = Number(attr(tag, "lng"));
  const full = attr(tag, "address") || "", city = attr(tag, "city"), stateName = attr(tag, "state") || "";
  const state = STATES[stateName.toLowerCase()] || (stateName.length === 2 ? stateName.toUpperCase() : null);
  const street = clean(full.split(",")[0]);
  const id = attr(tag, "searchable")?.split(" ")[0] || `${lat},${lon}`;
  if (!Number.isFinite(lat) || !street || !city || !state || seen.has(id)) continue;
  seen.add(id);
  stores.push({ id, name: `Pomp's Tire ${attr(tag, "name") || city}`, address: street, city, state, zip: formatZip(attr(tag, "zip")), phone: formatPhone(attr(tag, "phone")), lat, lon,
    services: ["Tires", "Repair"], url: page || "https://www.pompstire.com/locations" });
}

// Each store page has a "Location Hours" table: "Monday 7:30 AM - 5:30 PM ... Sunday Closed".
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
await pool(stores.filter((s) => s.url.includes("locations.pompstire.com")), 4, async (s) => {
  try {
    const t = clean((await fetchText(s.url)).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
    const from = t.search(/Location Hours|Store Hours|Hours/i), part = from < 0 ? t : t.slice(from, from + 1500);
    const marks = [...part.matchAll(new RegExp(`\\b(${DAYS.join("|")})\\b\\s*:?\\s*`, "g"))];
    const hours = [];
    marks.forEach((m, i) => {
      const v = clean(part.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : m.index + m[0].length + 40)).replace(/\s*[-–]\s*/, " – ");
      if (/^(closed|open 24 hours|\d{1,2}(:\d{2})?\s*[ap]\.?m\.?\s*–\s*\d{1,2}(:\d{2})?\s*[ap]\.?m\.?)/i.test(v) && !hours.some((h) => h.day === m[1].slice(0, 3)))
        hours.push({ day: m[1].slice(0, 3), hours: /^closed/i.test(v) ? "Closed" : v.match(/^(open 24 hours|[^A-Za-z]*[ap]\.?m\.?\s*–\s*[^A-Za-z]*[ap]\.?m\.?)/i)[0] });
    });
    if (hours.length) s.hours = hours;
    else console.warn(`${s.name}: no hours found on ${s.url}`);
  } catch (e) { console.warn(`${s.name}: ${e.message}`); }
});
console.log(`Hours found for ${stores.filter((s) => s.hours).length} of ${stores.length} stores; sample:`, JSON.stringify(stores[0]));
const kept = stores.filter((s) => s.phone);
console.log(`Found ${stores.length} Pomp's locations; left out ${stores.length - kept.length} with no phone`);
await writeData("pomps", { source: "https://www.pompstire.com/locations", fetched_at: new Date().toISOString(), count: kept.length, stores: kept }, 50);
