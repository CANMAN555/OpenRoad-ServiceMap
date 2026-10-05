// Downloads every U.S. Thermo King dealer page from Thermo King's dealer directory
// (thermoking.com/dealers, listed in its sitemap) and writes data/thermoking.json.
// Each page embeds the dealer's record as JSON (address, coordinates, hours, services).
// Run by .github/workflows/update-vendors.yml.
import { clean, fetchText, formatPhone, pool, writeData } from "./lib.mjs";

const SITEMAP = "https://www.thermoking.com/dealers/sitemap.xml";
const DAY = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun" };
const t12 = (n) => {
  const h = Math.floor(n / 100), m = n % 100;
  if (h === 24 || (h === 0 && m === 0)) return "12 a.m.";
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "a.m." : "p.m."}`;
};
function hours(normal) {
  return (normal || []).map((d) => {
    if (d.isClosed || !(d.intervals || []).length) return { day: DAY[d.day], hours: "Closed" };
    return {
      day: DAY[d.day],
      hours: d.intervals.map((i) => (i.start === 0 && (i.end === 2359 || i.end === 0) ? "24 hours" : `${t12(i.start)} – ${t12(i.end)}`)).join(", "),
    };
  }).filter((d) => d.day);
}

const sm = await fetchText(SITEMAP);
const urls = [...new Set([...sm.matchAll(/<loc>(https:\/\/www\.thermoking\.com\/dealers\/north-america\/us\/[a-z]{2}\/[^<]+)<\/loc>/g)].map((m) => m[1].trim()))];
console.log("U.S. dealer pages:", urls.length);

function parse(url, html) {
  const m = /<script id="js-map-config-dir-map"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  const ent = (JSON.parse(m[1]).entities || [])[0];
  const p = ent && ent.profile;
  if (!p || p.closed || p.c_tKActive === false) return null;
  const c = p.yextDisplayCoordinate || p.geocodedCoordinate || {};
  const lat = Number(c.lat), lon = Number(c.long);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) return null;
  const a = p.address || {};
  const services = (p.c_servicesOffered || []).map(clean).filter(Boolean);
  const web = clean(p.websiteUrl);
  return {
    id: url.split("/").slice(-2).join("/"),
    name: clean(p.name),
    address: [a.line1, a.line2, a.line3].map(clean).filter(Boolean).join(", ") || null,
    city: clean(a.city),
    state: clean(a.region),
    zip: clean(a.postalCode),
    phone: formatPhone(p.mainPhone && p.mainPhone.number),
    lat,
    lon,
    services,
    truckTrailer: services.some((s) => /truck|trailer/i.test(s)),
    sales: services.some((s) => /sales/i.test(s)),
    blueTrack: !!p.c_blueTrackSelect,
    hours: hours(p.hours && p.hours.normalHours),
    hoursNote: clean(p.additionalHoursText || p.c_additionalHoursInformation),
    dropYard: !!(p.c_dropYardServices && p.c_dropYardServices.available),
    website: web ? (/^https?:\/\//i.test(web) ? web : "https://" + web) : null,
    url,
  };
}

const all = (await pool(urls, 4, async (u) => {
  try { return parse(u, await fetchText(u)); } catch (e) { console.log("skip", u, e.message); return null; }
})).filter(Boolean);
// Road calls are trucks and trailers: leave out marine-only and bus-only locations.
const stores = all.filter((s) => s.truckTrailer);
stores.sort((a, b) => (a.state || "").localeCompare(b.state || "") || (a.city || "").localeCompare(b.city || ""));
const payload = {
  source: "https://www.thermoking.com/dealers/north-america/us",
  fetched_at: new Date().toISOString(),
  count: stores.length,
  counts: { pages: urls.length, parsed: all.length, truckTrailer: stores.length, blueTrack: stores.filter((s) => s.blueTrack).length },
  stores,
};
console.log(JSON.stringify(payload.counts));
await writeData("thermoking", payload, 100);
