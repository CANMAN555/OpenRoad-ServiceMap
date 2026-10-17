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
    const a = ADDR.exec(body.replace(/\n/g, ", ").replace(/,\s*,/g, ","));
    const phone = formatPhone((/\(\d{3}\)\s*\d{3}-\d{4}/.exec(body) || [])[0]);
    if (!a || !phone) return console.warn(`${slug}: no address or phone`), null;
    // Services sit in <li> lists under a "Commercial" heading and a "Passenger/Light Truck" heading.
    let commercial = [];
    for (const m of html.matchAll(/>\s*Commercial:?\s*</gi)) {
      const rest = html.slice(m.index, m.index + 6000), end = rest.search(/>\s*Passenger/i);
      const items = [...(end > 0 ? rest.slice(0, end) : rest).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => clean(x[1].replace(/<[^>]+>/g, " "))).filter((x) => x && x.length < 60);
      if (items.length >= 2) { commercial = items; break; }
    }
    // "Monday - Friday: 7:30 am - 5:00 pm Saturday: Closed (24hr Service Available) Sunday: ..."
    const hours = [], H = /(Monday\s*[-–]\s*Friday|Mon\s*[-–]\s*Fri|Saturday|Sunday)\s*:\s*/gi, hb = body.replace(/\n/g, " ");
    const marks = [...hb.matchAll(H)];
    marks.forEach((m, i) => { const v = clean(hb.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : m.index + m[0].length + 60).split(/\s{2,}|Location|Phone|Email|Request/)[0]); if (v && hours.length < 3) hours.push([clean(m[1]).replace(/\s*[-–]\s*/, "–").replace("Monday–Friday", "Mon–Fri"), v]); });
    if (slug === slugs[0]) console.log("Debug text:", body.slice(0, 1500).replace(/\n/g, " | "));
    const name = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1]?.replace(/<[^>]+>/g, " "));
    // The heading reads like "Elk Grove Village Commercial and Automotive Tires & Service".
    const city = clean(a[2]), kind = clean((name || "").replace(/^Bauer Built\s*/i, "").replace(city, "")) || null;
    return { id: slug, name: `Bauer Built ${slug === "durand-corporate" ? "Durand (Corporate)" : city}`, kind,
      address: clean(a[1].split(/\.\s+|\bLocation\s+/).pop()), city, state: a[3], zip: a[4], phone, commercial, hours,
      emergency: /24\/7 emergency|24hr service/i.test(body), url };
  } catch (e) { console.warn(`${slug}: ${e.message}`); return null; }
});

const found = pages.filter(Boolean);
const trucks = found.filter((s) => s.commercial.length || /commercial/i.test(s.kind || ""));
console.log(`Read ${found.length} locations; ${trucks.length} offer commercial truck service; left out automotive-only: ${found.filter((s) => !trucks.includes(s)).map((s) => `${s.city} (${s.kind})`).join(", ")}`);
const geo = await censusGeocode(trucks.map((s) => ({ id: s.id, street: s.address, city: s.city, state: s.state, zip: s.zip })));
const stores = [];
for (const s of trucks) {
  const g = geo.get(s.id);
  if (!g) { console.warn(`${s.name}: Census could not place ${s.address}, ${s.city}`); continue; }
  stores.push({ ...s, lat: g[0], lon: g[1] });
}
console.log("Sample:", JSON.stringify(stores[0]));
await writeData("bauer", { source: BASE + "/locations/", fetched_at: new Date().toISOString(), count: stores.length, stores }, 15);
