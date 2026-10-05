// Downloads every FleetPride location (parts branches, service centers, TruckPro stores and
// FleetPride service affiliates) from FleetPride's branch locator at branches.fleetpride.com and
// writes data/fleetpride.json. One search with a 5,000 mile radius from the middle of the country
// returns every location, with coordinates, phone, hours and services.
// Run by .github/workflows/update-vendors.yml.
import { clean, fetchText, formatPhone, span, writeData } from "./lib.mjs";

const API = "https://maps.branches.fleetpride.com/api/getAsyncLocations?template=search&level=search&radius=5000&lat=39.8&lng=-98.5&limit=3000";
const DAYS = [["Monday", "Mon"], ["Tuesday", "Tue"], ["Wednesday", "Wed"], ["Thursday", "Thu"], ["Friday", "Fri"], ["Saturday", "Sat"], ["Sunday", "Sun"]];

const j = JSON.parse(await fetchText(API, { accept: "application/json" }));
// "maplist" is HTML wrapping a comma-separated list of JSON objects, one per location.
const body = String(j.maplist || "").trim().replace(/^<div class="tlsmap_list">/, "").replace(/,?\s*<\/div>\s*$/, "");
const rows = JSON.parse("[" + body + "]");
console.log("locations in feed:", rows.length);

function hours(raw) {
  let set;
  try { set = JSON.parse(raw || "null"); } catch { return []; }
  if (!set || !set.days) return [];
  return DAYS.map(([full, day]) => {
    const v = set.days[full];
    if (v == null) return null;
    if (v === "closed" || !v.length) return { day, hours: "Closed" };
    return { day, hours: v.map((i) => (i.open === "00:00" && /^(23:59|24:00|00:00)$/.test(i.close) ? "24 hours" : span(i.open, i.close))).filter(Boolean).join(", ") || null };
  }).filter((d) => d && d.hours);
}

const stores = [];
for (const r of rows) {
  const lat = Number(r.lat), lon = Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
  const brand = clean(r.location_name);
  const phone = formatPhone(r.local_phone);
  const mobile = formatPhone(r.location_mobile_service_phone);
  stores.push({
    id: String(r.lid),
    name: clean(r.location_display_name) || brand,
    brand, // "FleetPride Parts", "FleetPride Service Center", "TruckPro, a FleetPride Company", or an affiliate shop's own name
    type: clean(r["Store Type_CS"]), // Parts, Service, Service Affiliates
    services: (r.Services_CS || "").split(",").map(clean).filter(Boolean),
    address: [clean(r.address_1), clean(r.address_2)].filter(Boolean).join(", ") || null,
    city: clean(r.city),
    state: clean(r.region),
    zip: clean(r.post_code),
    phone,
    mobilePhone: mobile && mobile !== phone ? mobile : null,
    hours: hours(r["hours_sets:primary"]),
    note: clean(r.location_closure_message) || clean(r.location_alert_message),
    lat,
    lon,
    url: clean(r.url),
  });
}
stores.sort((a, b) => a.state.localeCompare(b.state) || (a.city || "").localeCompare(b.city || "") || a.id.localeCompare(b.id));
await writeData("fleetpride", { source: "FleetPride branch locator (branches.fleetpride.com)", fetched_at: new Date().toISOString(), count: stores.length, stores }, 300);
