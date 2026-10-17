// Downloads every Bauer Built Tire & Service location from bauerbuilt.com/locations and its location pages
// (name, address, phone, hours, services) and writes data/bauer.json. The pages carry no map points, so each
// street address is placed with the U.S. Census geocoder. Automotive-only stores (no commercial truck service)
// are left out.
import { censusGeocode, clean, fetchText, formatPhone, pool, writeData } from "./lib.mjs";

const BASE = "https://www.bauerbuilt.com";
const text = (html) => clean(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h\d|span|a|td|tr)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n"));
const list = await fetchText(BASE + "/locations/");
const slugs = [...new Set([...list.matchAll(/href="(?:https:\/\/www\.bauerbuilt\.com)?\/locations\/([a-z0-9-]+)\/?"/g)].map((m) => m[1]))];
console.log(`Found ${slugs.length} location pages`);

const ADDR = /(\d+[^\n,]{2,60}),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?/;
const pages = await pool(slugs, 4, async (slug) => {
  try {
    const url = `${BASE}/locations/${slug}/`;
    const html = await fetchText(url), body = text(html);
    const raw = body.replace(/\n/g, " \n ");
    const a = ADDR.exec(body.replace(/\n/g, ", ").replace(/,\s*,/g, ","));
    const phone = formatPhone((/\(\d{3}\)\s*\d{3}-\d{4}/.exec(body) || [])[0]);
    if (!a || !phone) return console.warn(`${slug}: no address or phone`), null;
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    // Services are listed under "Commercial" and "Passenger/Light Truck" headings.
    const ci = lines.findIndex((l) => /^commercial:?$/i.test(l));
    const pi = lines.findIndex((l) => /^passenger/i.test(l));
    const commercial = ci < 0 ? [] : lines.slice(ci + 1, pi > ci ? pi : ci + 15).filter((l) => l.length < 50 && !/^(hours|monday|saturday|request|get directions|location)/i.test(l));
    const hours = [];
    for (const m of raw.matchAll(/(Monday\s*[-–]\s*Friday|Mon\s*[-–]\s*Fri|Saturday\s*[-–]?\s*(?:&|and|-|–)?\s*Sunday|Saturday|Sunday)\s*:?\s*([^\n]{3,60})/gi)) hours.push([clean(m[1]), clean(m[2])]);
    const name = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1]?.replace(/<[^>]+>/g, " "));
    return { id: slug, name: `Bauer Built ${name && !/^bauer built/i.test(name) ? name : slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
      address: clean(a[1]), city: clean(a[2]), state: a[3], zip: a[4], phone, commercial, hours,
      emergency: /24\/7 emergency|24hr service/i.test(body), url };
  } catch (e) { console.warn(`${slug}: ${e.message}`); return null; }
});

const found = pages.filter(Boolean);
const trucks = found.filter((s) => s.commercial.length || /commercial/i.test(s.name));
console.log(`Read ${found.length} locations; ${trucks.length} offer commercial truck service; left out automotive-only: ${found.filter((s) => !trucks.includes(s)).map((s) => s.city).join(", ")}`);
const geo = await censusGeocode(trucks.map((s) => ({ id: s.id, street: s.address, city: s.city, state: s.state, zip: s.zip })));
const stores = [];
for (const s of trucks) {
  const g = geo.get(s.id);
  if (!g) { console.warn(`${s.name}: Census could not place ${s.address}, ${s.city}`); continue; }
  stores.push({ ...s, lat: g[0], lon: g[1] });
}
console.log("Sample:", JSON.stringify(stores[0]));
await writeData("bauer", { source: BASE + "/locations/", fetched_at: new Date().toISOString(), count: stores.length, stores }, 15);
