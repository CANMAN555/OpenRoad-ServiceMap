// One-off probe: U.S. OpenStreetMap places that are clearly for semi trucks (repair, mobile repair, tire, towing),
// with a street address and a phone, minus the companies already on the map and minus duplicates.
const Q = `[out:json][timeout:600];
area["ISO3166-1"="US"][admin_level=2]->.us;
(
  nwr["shop"="truck_repair"](area.us);
  nwr["shop"~"^(car_repair|tyres|truck|towing|vehicle_repair)$"]["name"~"truck|semi|diesel|tow|wrecker|fleet|heavy|commercial|big rig|tractor|trailer|18 ?wheel",i](area.us);
  nwr["service:vehicle:towing"="yes"](area.us);
  nwr["shop"="towing"](area.us);
  nwr["service:vehicle:truck"="yes"](area.us);
  nwr["service:vehicle:hgv"="yes"](area.us);
  nwr["hgv"="designated"]["shop"](area.us);
);
out center tags;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let d;
for (const h of hosts) {
  try { const r = await fetch(h, { method: "POST", body: "data=" + encodeURIComponent(Q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "OpenRoad-ServiceMap probe (github.com/CANMAN555/OpenRoad-ServiceMap)" } });
    if (r.ok) { d = await r.json(); console.log("host", h); break; } console.log(h, r.status); } catch (e) { console.log(h, e.message); }
}
const t = (e) => e.tags || {};
const nm = (e) => (t(e).name || "").toLowerCase();
const phone = (e) => (t(e).phone || t(e)["contact:phone"] || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const hasAddr = (e) => t(e)["addr:street"] && t(e)["addr:housenumber"];
// Heavy-truck evidence: a truck-only shop tag, a truck/HGV service tag, or a truck word in the name.
const HEAVY = /\b(truck|trucks|trucking|semi|diesel|heavy|fleet|commercial|big rig|tractor|trailer|18 ?wheel|wrecker|rotator)/;
const heavy = (e) => t(e).shop === "truck_repair" || t(e)["service:vehicle:truck"] === "yes" || t(e)["service:vehicle:hgv"] === "yes" || HEAVY.test(nm(e));
// Car-only chains that use "tire" or "tow" words but don't serve semis.
const CAR = /discount tire|tires plus|pep boys|belle tire|firestone complete|jiffy|midas|meineke|valvoline|express oil|les schwab|big o tire|ntb\b|mavis|monro|goodyear auto|u-haul|enterprise|hertz|autozone|o'?reilly|napa auto|advance auto/;
// Companies already on the map.
const LIVE = /love'?s|speedco|\bta\b|travelcenters|petro\b|freightliner|volvo|boss truck|utility trailer|prestige trailer|timpte|thermo ?king|carrier transicold|fleetpride|truckpro|southern tire mart|\bstm\b/;
const kinds = (e) => { const g = t(e), n = nm(e);
  const tow = g.shop === "towing" || g["service:vehicle:towing"] === "yes" || /tow|wrecker|rotator|recovery/.test(n);
  const tire = g.shop === "tyres" || /tire|tyre/.test(n);
  const mobile = /mobile|road ?service|roadside/.test(n);
  const repair = g.shop === "truck_repair" || g.shop === "car_repair" || /repair|diesel|service|mechanic|maintenance|shop/.test(n) || (!tow && !tire);
  return { tow, tire, mobile, repair }; };
let els = d.elements.filter((e) => phone(e).length === 10 && hasAddr(e));
const n0 = els.length;
els = els.filter((e) => !CAR.test(nm(e))); const n1 = els.length;
els = els.filter(heavy); const n2 = els.length;
els = els.filter((e) => !LIVE.test(nm(e) + " " + (t(e).brand || "").toLowerCase())); const n3 = els.length;
// Duplicates: same phone, or same name within about a quarter mile. Keep the entry with more tags.
const seen = new Map(), out = [];
for (const e of els.sort((a, b) => Object.keys(t(b)).length - Object.keys(t(a)).length)) {
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  const k1 = "p" + phone(e), k2 = "n" + nm(e).replace(/\W/g, "") + Math.round(lat * 250) + "," + Math.round(lon * 250);
  if (seen.has(k1) || seen.has(k2)) continue; seen.set(k1, 1); seen.set(k2, 1); out.push(e);
}
const c = { towing: 0, repair: 0, tire: 0, mobile: 0, towAndRepair: 0 };
for (const e of out) { const k = kinds(e); if (k.tow) c.towing++; if (k.repair) c.repair++; if (k.tire) c.tire++; if (k.mobile) c.mobile++; if (k.tow && k.repair) c.towAndRepair++; }
console.log("address+phone", n0, "minus car chains", n1, "heavy-truck", n2, "minus live companies", n3, "after dedupe", out.length, JSON.stringify(c));
const st = {}; for (const e of out) { const s = (t(e)["addr:state"] || "?").toUpperCase().slice(0, 2); st[s] = (st[s] || 0) + 1; } console.log("states", Object.keys(st).length, JSON.stringify(st));
for (const e of out.filter((_, i) => i % Math.ceil(out.length / 40) === 0)) { const k = kinds(e); console.log(Object.keys(k).filter((x) => k[x]).join("+"), "|", t(e).name, "|", t(e)["addr:city"], t(e)["addr:state"], "|", t(e).shop || "", "| check:", t(e).check_date || t(e)["survey:date"] || "-"); }
