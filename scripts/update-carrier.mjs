// Downloads the Carrier Transicold dealer list (the feed behind locator.ttdealers.carrier.com, Carrier's
// truck/trailer refrigeration and ComfortPro APU dealer locator), keeps U.S. dealers and writes data/carrier.json.
// The feed URL carries an app key, so it is read from the locator's own script at run time and never
// stored in this repository. Staff emails and contact names are not kept.
// Run by .github/workflows/update-vendors.yml.
import { clean, fetchText, formatPhone, span, writeData } from "./lib.mjs";

const SITE = "https://locator.ttdealers.carrier.com/";
// Service type ids, from the locator's own list (LCV 6, Truck 2, Trailer 5, Engineless 4, APU 3, eCool 7, 24/7 8, Mobile Service 1, Low GWP 11).
const SERVICES = { 1: "Mobile Service", 2: "Truck", 3: "APU", 4: "Engineless", 5: "Trailer", 6: "LCV", 7: "eCool", 8: "24/7", 11: "Low GWP" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function feedUrl() {
  const html = await fetchText(SITE);
  const main = /src="([^"]*main\.[0-9a-f]+\.js)"/.exec(html);
  if (!main) throw new Error("Could not find the Carrier locator script");
  const js = await fetchText(new URL(main[1], SITE).href);
  const m = /getAllDealersV2=function\(\)\{return this\.http\.get\(this\.baseUrl\+"(getallV2\?[^"]+)"/.exec(js);
  if (!m) throw new Error("Could not find the Carrier dealer feed in the locator script");
  return new URL("api/dealer/" + m[1], SITE).href;
}

const titleCase = (s) => clean(s) && clean(s).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
const { dealers = [] } = JSON.parse(await fetchText(await feedUrl(), { accept: "application/json" }));
console.log("dealers in feed:", dealers.length);

const stores = dealers
  .filter((d) => d && d.countryCode === "US" && !d.isDeleted && Number.isFinite(+d.dealerLatitude) && +d.dealerLatitude !== 0)
  .map((d) => {
    const a = d.dealerAddressDetailModel || {};
    const services = [...new Set((d.dealerServiceTypeModel || []).map((s) => SERVICES[s.serviceType_uid]).filter(Boolean))];
    const phones = String(d.phone || "").split(",").map(formatPhone).filter(Boolean);
    const hours = (d.dealerTimingModel || [])
      .map((t) => ({ day: DAYS[t.day], hours: t.startTime && t.endTime ? (t.endTime === "23:59" && t.startTime === "00:00" ? "24 hours" : span(t.startTime, t.endTime === "23:59" ? "24:00" : t.endTime)) : "Closed" }))
      .filter((t) => t.day);
    const web = clean(d.webUrl);
    const street = [a.address1, a.address2].map(clean).filter(Boolean).join(", ");
    const mobileOnly = /^mobile( dealer| service)?$/i.test(street);
    return {
      id: String(d.uid),
      name: clean(d.name),
      level: clean(d.dealerLevel) && !/^none$/i.test(d.dealerLevel) ? clean(d.dealerLevel) : null,
      address: mobileOnly ? null : street || null,
      mobileOnly, // no shop address: the dealer works out of service trucks
      city: titleCase(a.city),
      state: clean(a.stateCode),
      zip: clean(a.postalCode),
      phone: phones[0] || null,
      phone2: phones[1] || null,
      lat: +d.dealerLatitude,
      lon: +d.dealerLongitude,
      services,
      apu: services.includes("APU"),
      truck: services.includes("Truck"),
      trailer: services.includes("Trailer"),
      mobile: services.includes("Mobile Service"),
      allDay: services.includes("24/7"),
      hours: hours.every((h) => h.hours === "Closed") ? [] : hours,
      note: clean(d.otherInformation),
      website: web ? (/^https?:\/\//i.test(web) ? web : "https://" + web) : null,
    };
  });
stores.sort((a, b) => (a.state || "").localeCompare(b.state || "") || (a.city || "").localeCompare(b.city || ""));
const payload = {
  source: SITE,
  fetched_at: new Date().toISOString(),
  count: stores.length,
  counts: { apu: stores.filter((s) => s.apu).length, mobile: stores.filter((s) => s.mobile).length, allDay: stores.filter((s) => s.allDay).length },
  stores,
};
console.log(JSON.stringify(payload.counts));
await writeData("carrier", payload, 80);
