// Temporary: prints the shape of Love's store records so the updater can map shop and hours fields.
const UA = "Mozilla/5.0 (compatible; OpenRoadServiceMap/1.0)";
const all = [];
for (let page = 0; page < 10; page++) {
  const r = await fetch("https://www.loves.com/api/search_stores", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA }, body: JSON.stringify({ pageNumber: page, pageSize: "100", lat: 36.5489, lng: -118.9127 }) });
  const txt = await r.text(); let b; try { b = JSON.parse(txt).stores; } catch { b = null; }
  if (!Array.isArray(b)) { console.log("HTTP", r.status, txt.slice(0, 500)); break; } all.push(...b); if (b.length < 100) break;
}
const names = {}, mapped = {};
for (const s of all) {
  for (const f of s.customFields || []) names[f.fieldName] = (names[f.fieldName] || 0) + (f.fieldValue === "true" ? 1 : 0);
  for (const [k, v] of Object.entries(s.mappedCustomFields || {})) mapped[k] = (mapped[k] || new Set()), (Array.isArray(v) ? v : []).forEach((x) => mapped[k].add(x.fieldName || x.smaFieldName));
}
console.log("customFields true-counts:", JSON.stringify(names));
console.log("mappedCustomFields keys:", JSON.stringify(Object.fromEntries(Object.entries(mapped).map(([k, v]) => [k, [...v]]))));
const flags = ["isLoveStore","isCountryStore","isTireCare","isSpeedCo","isTravelStopWithSpeedCo","isRestaurant"];
console.log("flag counts:", JSON.stringify(Object.fromEntries(flags.map((f) => [f, all.filter((s) => s[f]).length]))));
const ex = [all.find((s) => s.isTravelStopWithSpeedCo), all.find((s) => s.facilitySubtypeName === "Travel Stop" && !s.isTravelStopWithSpeedCo), all.find((s) => s.facilitySubtypeName === "Truck Service"), all.find((s) => s.facilitySubtypeName === "Country Store")];
for (const s of ex) if (s) console.log("EXAMPLE", s.number, s.facilitySubtypeName, JSON.stringify(s.mappedCustomFields).slice(0, 2500), "| storeSearchData:", JSON.stringify(s.storeSearchData).slice(0, 600), "| site:", JSON.stringify(s.site).slice(0, 400));
