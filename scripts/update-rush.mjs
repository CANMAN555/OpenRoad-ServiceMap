// Downloads every Rush Truck Centers location from rushtruckcenters.com (the location pages listed in its sitemap;
// each page carries the address, map point, phone numbers and departments) and writes data/rush.json.
// Locations that are the same shop as a pin already on the map are left out.
import { clean, fetchText, formatPhone, formatZip, liveMatcher, pool, writeData } from "./lib.mjs";

const sitemap = await fetchText("https://www.rushtruckcenters.com/sitemap.xml");
const pages = [...new Set([...sitemap.matchAll(/<loc>(https:\/\/www\.rushtruckcenters\.com\/locations\/\d+-[^<]+)<\/loc>/g)].map((m) => m[1]))];
console.log(`${pages.length} location pages`);

const DAY = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
const results = await pool(pages, 6, async (url) => {
  let html;
  try { html = await fetchText(url); } catch (e) { console.log(url, e.message); return null; }
  let biz = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); if (j.geo && j.address) { biz = j; break; } } catch {}
  }
  if (!biz) { console.log(url, "no location data"); return null; }
  // Phone numbers listed under the address: "Main Phone", "Mobile Service", "Parts", ...
  const table = (html.match(/location-detail__contact-numbers[\s\S]*?<\/table>/) || [""])[0];
  const phones = [...table.matchAll(/<td>([^<:]+):?<\/td>\s*<td>\s*<a href="tel:([^"]+)"/g)].map((m) => [clean(m[1]), formatPhone(m[2])]);
  const depts = (biz.department || []).map((d) => clean(String(d.name || "").split(" - ").pop())).filter(Boolean);
  const service = (biz.department || []).find((d) => /service/i.test(d.name || ""));
  const hours = (service?.openingHoursSpecification || []).map((h) => [(h.dayOfWeek || []).map((d) => DAY[d] || d).join(", "),
    h.opens === h.closes && /12:00 AM/.test(h.opens) ? "24 hours" : `${h.opens} – ${h.closes}`]);
  const mobile = phones.some(([l]) => /mobile/i.test(l));
  return {
    id: url.split("/").pop().split("-")[0], name: clean(biz.name).replace(/\s*[–-]\s*/, " – "),
    address: clean(biz.address.streetAddress), city: clean(biz.address.addressLocality), state: clean(biz.address.addressRegion), zip: formatZip(biz.address.postalCode),
    phone: formatPhone(biz.telephone) || phones[0]?.[1], phones: phones.filter(([, p]) => p && p !== formatPhone(biz.telephone)),
    lat: Number(biz.geo.latitude), lon: Number(biz.geo.longitude),
    services: ["Repair", mobile && "Mobile repair", depts.some((d) => /collision|body/i.test(d)) && "Collision", depts.some((d) => /tire/i.test(d)) && "Tires"].filter(Boolean),
    departments: depts, hours, url,
  };
});
const stores = results.filter((s) => s && s.phone && s.address && Number.isFinite(s.lat) && s.lat !== 0);
const isLive = await liveMatcher(), kept = stores.filter((s) => !isLive(s));
console.log(`Found ${stores.length} Rush locations; left out ${stores.length - kept.length} already on the map`);
await writeData("rush", { source: "https://www.rushtruckcenters.com/locations", fetched_at: new Date().toISOString(), count: kept.length, stores: kept }, 80);
