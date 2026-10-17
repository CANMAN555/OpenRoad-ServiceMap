// One-off probe: how many U.S. OpenStreetMap places look like semi truck repair, tire or towing,
// and how many of those have both a street address and a phone number. Prints counts and a few samples.
const Q = `[out:json][timeout:600];
area["ISO3166-1"="US"][admin_level=2]->.us;
(
  nwr["shop"="truck_repair"](area.us);
  nwr["shop"="towing"](area.us);
  nwr["service:vehicle:towing"="yes"](area.us);
  nwr["towing"="yes"](area.us);
  nwr["shop"~"^(car_repair|tyres|truck)$"]["name"~"truck|semi|diesel|tow|wrecker|fleet|heavy|tire",i](area.us);
  nwr["shop"~"^(car_repair|tyres)$"]["service:vehicle:truck"="yes"](area.us);
  nwr["shop"~"^(car_repair|tyres)$"]["service:vehicle:hgv"="yes"](area.us);
);
out center tags;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let d;
for (const h of hosts) {
  try { const r = await fetch(h, { method: "POST", body: "data=" + encodeURIComponent(Q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "OpenRoad-ServiceMap probe (github.com/CANMAN555/OpenRoad-ServiceMap)" } });
    if (r.ok) { d = await r.json(); console.log("host", h); break; } console.log(h, r.status); } catch (e) { console.log(h, e.message); }
}
const els = d.elements, t = (e) => e.tags || {};
const phone = (e) => t(e).phone || t(e)["contact:phone"];
const addr = (e) => t(e)["addr:street"] && t(e)["addr:housenumber"];
const kind = (e) => { const g = t(e), n = (g.name || "").toLowerCase();
  const tow = g.shop === "towing" || g.towing === "yes" || g["service:vehicle:towing"] === "yes" || /tow|wrecker/.test(n);
  const tire = g.shop === "tyres" || /tire|tyre/.test(n);
  return [tow && "towing", tire && "tire", (!tow || /repair|diesel|truck|service|mechanic/.test(n) || g.shop === "truck_repair") && "repair"].filter(Boolean).join("+"); };
const ok = els.filter((e) => phone(e) && addr(e));
const by = {}; for (const e of ok) by[kind(e)] = (by[kind(e)] || 0) + 1;
console.log("total", els.length, "with address+phone", ok.length, JSON.stringify(by));
const st = {}; for (const e of ok) { const s = t(e)["addr:state"] || "?"; st[s] = (st[s] || 0) + 1; } console.log("by state", JSON.stringify(st));
for (const e of ok.filter((_, i) => i % Math.ceil(ok.length / 25) === 0)) console.log(kind(e), "|", t(e).name, "|", t(e)["addr:city"], t(e)["addr:state"]);
