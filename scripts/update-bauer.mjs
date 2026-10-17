// Downloads every Bauer Built Tire & Service location from bauerbuilt.com/locations and its location pages
// (name, address, phone, hours, services) and writes data/bauer.json. The pages carry no map points, so each
// street address is placed with the U.S. Census geocoder. Automotive-only stores (no commercial truck service)
// are left out.
import { UA, censusGeocode, clean, fetchText, formatPhone, pool, writeData } from "./lib.mjs";

const BASE = "https://www.bauerbuilt.com";
// Page text with one line per block element, so lists and labels stay apart.
const text = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h\d|span|a|td|tr|button)>/gi, "\n").replace(/<[^>]+>/g, " ")
  .split("\n").map(clean).filter(Boolean).join("\n");
const list = await fetchText(BASE + "/locations/");
const slugs = [...new Set([...list.matchAll(/href="(?:https:\/\/www\.bauerbuilt\.com)?\/locations\/([a-z0-9-]+)\/?"/g)].map((m) => m[1]))].filter((x) => x !== "feed");
console.log(`Found ${slugs.length} location pages`);

const ADDR = /(\d+[^\n,]{2,60}),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?/;
const pages = await pool(slugs, 4, async (slug) => {
  try {
    const url = `${BASE}/locations/${slug}/`;
    const html = await fetchText(url), body = text(html);
    const a = ADDR.exec(body.replace(/\n/g, ", ").replace(/,\s*,/g, ","));
    const phone = formatPhone((/\(\d{3}\)\s*\d{3}-\d{4}/.exec(body) || [])[0]);
    if (!a || !phone) return console.warn(`${slug}: no address or phone`), null;
    // Everything about this store sits between its address and the "PASSENGER/LIGHT TRUCK" service list; the site
    // menu above it repeats every service the company offers anywhere, so it is skipped.
    const street = clean(a[1].split(/\.\s+|\bLocation\s+/).pop()), at = body.indexOf(street), from = at < 0 ? 0 : at, region = body.slice(from, from + 4000).split(/\bPASSENGER\b/)[0];
    const svc = /\bCOMMERCIAL\b([\s\S]*)$/.exec(region);
    const commercial = svc ? svc[1].split("\n").map(clean).filter((x) => x && x.length < 60 && !/^services$/i.test(x)) : [];
    // "Monday - Friday 7:30 am - 5:00 pm", "Saturday: Closed (24hr Service Available)"
    const head = (svc ? region.slice(0, svc.index) : region).replace(/\bServices\s*$/i, "").replace(/\n/g, " ");
    const hours = [], marks = [...head.matchAll(/(Monday\s*[-–]\s*Friday|Mon\s*[-–]\s*Fri|Saturday|Sunday)\s*:?\s*/gi)];
    marks.forEach((m, i) => {
      const v = clean(head.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).split(/\b(?:Location|Phone|Email|Request|Get Directions|Services)\b/)[0]);
      if (v) hours.push([clean(m[1]).replace(/^Mon(day)?\s*[-–]\s*Fri(day)?$/i, "Mon–Fri").replace(/^Saturday$/i, "Sat").replace(/^Sunday$/i, "Sun"), v]);
    });
    if (!hours.length) console.log(`${slug}: no hours found in: ${head.slice(0, 400)}`);
    const name = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1]?.replace(/<[^>]+>/g, " ")) || "";
    // The heading reads like "Saginaw (Freeway Lane) Commercial and Automotive Tires & Service".
    const k = /\b(Commercial|Automotive|Wholesale)\b/.exec(name), city = clean(a[2]);
    const kind = k ? clean(name.slice(k.index)) : null, place = clean((k ? name.slice(0, k.index) : "").replace(/^Bauer Built\s*/i, "")) || city;
    return { id: slug, name: `Bauer Built ${place}`, kind,
      address: street, city, state: a[3], zip: a[4], phone, commercial, hours,
      emergency: /24\/7 emergency|24hr service/i.test(region), url };
  } catch (e) { console.warn(`${slug}: ${e.message}`); return null; }
});

const found = pages.filter(Boolean);
// Truck service stores only: the Durand wholesale warehouse / corporate office and automotive-only stores are left out.
const trucks = found.filter((s) => /commercial/i.test(s.kind || "") || (s.commercial.length && !/wholesale|corporate/i.test(s.kind || "")));
console.log(`Read ${found.length} locations; ${trucks.length} offer commercial truck service; left out automotive-only: ${found.filter((s) => !trucks.includes(s)).map((s) => `${s.city} (${s.kind})`).join(", ")}`);
const geo = await censusGeocode(trucks.map((s) => ({ id: s.id, street: s.address, city: s.city, state: s.state, zip: s.zip })));
// Addresses the Census can't place go to OpenStreetMap's geocoder (one request a second, per its usage policy).
async function nominatim(s) {
  const q = new URLSearchParams({ street: s.address.replace(/\s+(suite|ste|unit)\b.*$/i, ""), city: s.city, state: s.state, postalcode: s.zip || "", countrycodes: "us", format: "jsonv2", limit: "1" });
  try {
    await new Promise((r) => setTimeout(r, 1100));
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + q, { headers: { "User-Agent": UA } });
    const [hit] = r.ok ? await r.json() : [];
    return hit ? [Number(hit.lat), Number(hit.lon)] : null;
  } catch { return null; }
}
const stores = [];
for (const s of trucks) {
  const g = geo.get(s.id) || (await nominatim(s));
  if (!g) { console.warn(`${s.name}: neither the Census nor OpenStreetMap could place ${s.address}, ${s.city}`); continue; }
  stores.push({ ...s, lat: g[0], lon: g[1], geo: geo.has(s.id) ? "census" : "osm" });
}
console.log("Sample:", JSON.stringify(stores[0]));
console.log("Kinds:", [...new Set(found.map((s) => s.kind))].join(" | "));
await writeData("bauer", { source: BASE + "/locations/", fetched_at: new Date().toISOString(), count: stores.length, stores }, 15);
