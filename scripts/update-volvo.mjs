// Downloads every U.S. Volvo Trucks dealer and service location from Volvo's dealer locator feed
// (the one behind volvotrucks.us/find-a-dealer) and writes data/volvo.json.
// Run by .github/workflows/update-vendors.yml.
import { clean, fetchText, formatPhone, span, writeData } from "./lib.mjs";

const FEED = "https://dealerlocator.volvotrucks.us/Volvo_DealerJson.ashx";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // feed numbers days from Sunday = 0

const titleCase = (s) => clean(s) && clean(s).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Llc|Inc|Usa|Of|And)\b/g, (w) => ({ Llc: "LLC", Inc: "Inc", Usa: "USA", Of: "of", And: "and" }[w]));
const list = (o) => (o ? Object.values(o) : []).map(clean).filter(Boolean);

function days(sched) {
  if (!sched) return [];
  return Object.entries(sched)
    .map(([i, d]) => {
      const closed = !d || /closed/i.test(d.Start) || /closed/i.test(d.End);
      return { day: DAYS[Number(i)], hours: closed ? "Closed" : span(d.Start, d.End) || clean(`${d.Start} - ${d.End}`) };
    })
    .filter((d) => d.day);
}
const allClosed = (ds) => !ds.length || ds.every((d) => d.hours === "Closed");

// Services in Volvo's list that a driver on a road call cares about most.
const KEY_SERVICES = ["Volvo Certified Uptime Center", "Road Service Available", "Towing Service Available", "Tire Repair", "Express Lane Service", "DOT Inspection", "Trailer Repair Service", "Mack Engine Service", "Cummins Engine Service", "Detroit Diesel Service"];

const json = JSON.parse(await fetchText(FEED, { accept: "application/json" }));
const us = json.countries && json.countries.US;
if (!us) throw new Error("Volvo feed has no US section");
const stores = [];
for (const st of Object.values(us.states || {})) {
  for (const d of Object.values(st.dealers || {})) {
    const lat = Number(d.MAIN_LATITUDE), lon = Number(d.MAIN_LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
    const services = list(d.services).map((s) => s.replace(/^\*/, ""));
    const service = days(d.hours && d.hours.Service);
    const onCall = days(d.hours && d.hours.OnCall);
    const parts = days(d.hours && d.hours.Parts);
    const web = clean(d.WEB_ADDRESS);
    stores.push({
      id: clean(d.IDENTIFIER_VALUE) || String(d.COMPANY_ID),
      name: titleCase(d.COMPANY_DBA_NAME),
      type: clean(d.DEALER_TYPE_DESC),
      address: titleCase([d.MAIN_ADDRESS_LINE_1_TXT, d.MAIN_ADDRESS_LINE_2_TXT].filter(Boolean).join(", ")),
      city: titleCase(d.MAIN_CITY_NM),
      state: clean(d.MAIN_STATE_PROV_CD),
      zip: clean(d.MAIN_POSTAL_CD),
      phone: formatPhone(d.REG_PHONE_NUMBER),
      servicePhone: formatPhone(d.SVC_PHONE_NUMBER),
      tollFree: formatPhone(d.TF_PHONE_NUMBER),
      lat,
      lon,
      service: d.DEALER_TYPE_DESC !== "Parts Only",
      uptime: services.includes("Volvo Certified Uptime Center"),
      roadService: services.includes("Road Service Available"),
      towing: services.includes("Towing Service Available"),
      tires: services.includes("Tire Repair"),
      keyServices: KEY_SERVICES.filter((k) => services.includes(k)),
      services,
      hours: {
        service: allClosed(service) ? [] : service,
        parts: allClosed(parts) ? [] : parts,
        onCall: allClosed(onCall) ? [] : onCall,
      },
      website: web ? (/^https?:\/\//i.test(web) ? web : "https://" + web.replace(/^\/+/, "")) : null,
    });
  }
}
stores.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
const count = (f) => stores.reduce((o, s) => ((o[f(s)] = (o[f(s)] || 0) + 1), o), {});
const payload = {
  source: "https://www.volvotrucks.us/find-a-dealer/",
  fetched_at: new Date().toISOString(),
  count: stores.length,
  counts: { type: count((s) => s.type), service: count((s) => (s.service ? "service" : "no service")), uptime: count((s) => (s.uptime ? "uptime" : "no")) },
  stores,
};
console.log(JSON.stringify(payload.counts));
await writeData("volvo", payload, 200);
