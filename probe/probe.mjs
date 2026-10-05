import { writeFile, mkdir } from "node:fs/promises";
await mkdir("probe/out", { recursive: true });
const MI = 1609.344;
const SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
function q(lat, lon, r, variant) {
  const A = `(around:${Math.round(r * MI)},${lat},${lon})`;
  const lines = [
    `nwr["shop"="truck_repair"]${A};`, `nwr["shop"="tyres"]${A};`, `nwr["shop"="truck"]${A};`,
    `nwr["shop"="car_repair"]["hgv"~"^(yes|designated)$"]${A};`,
    `nwr["shop"="car_repair"]["name"~"truck|diesel|fleet|semi|trailer",i]${A};`,
    `nwr["amenity"="fuel"]["hgv"~"^(yes|designated)$"]${A};`,
    `nwr["amenity"="fuel"]["name"~"Love's|Pilot|Flying J|TravelCenters|Petro Stopping|Sapp Bros|Road Ranger|Bosselman|Kenly 95|Iowa 80",i]${A};`,
    variant === "cur" ? `nwr["name"~"towing|wrecker",i]${A};` : `nwr["name"]["name"~"towing|wrecker",i]${A};`,
  ];
  return `[out:json][timeout:180];(\n${lines.join("\n")}\n);out center meta;`;
}
const log = [];
const P = (s) => { console.log(s); log.push(s); };
const t = async (label, url, opts) => {
  const s = Date.now();
  try { const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 200000);
    const r = await fetch(url, { ...opts, signal: ac.signal }); const txt = await r.text(); clearTimeout(tm);
    let n = ""; try { const j = JSON.parse(txt); n = j.elements ? j.elements.length + " el" : ""; if (j.remark) n += " remark=" + j.remark.slice(0, 120); } catch { n = txt.slice(0, 160).replace(/\s+/g, " "); }
    P(`${label}\t${r.status}\t${((Date.now() - s) / 1000).toFixed(1)}s\t${(txt.length / 1e6).toFixed(2)}MB\t${n}`);
  } catch (e) { P(`${label}\tERR\t${((Date.now() - s) / 1000).toFixed(1)}s\t${e.name} ${e.message}`); }
};
const UA = { "user-agent": "OpenRoadServiceMap-probe/1.0 (github.com/CANMAN555/OpenRoad-ServiceMap)" };
await t("nominatim Jasper", "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=Jasper%2C%20TN", { headers: UA });
await t("photon Jasper", "https://photon.komoot.io/api/?limit=5&lang=en&q=Jasper%2C%20TN", { headers: UA });
for (const ep of SERVERS) await t("status " + ep.split("/")[2], ep.replace("interpreter", "status"), { headers: UA });
const lat = 35.0742, lon = -85.6261; // Jasper, TN
for (const ep of SERVERS) for (const r of [5, 10, 50, 100, 250]) {
  const host = ep.split("/")[2];
  await t(`${host} r=${r}`, ep, { method: "POST", body: "data=" + encodeURIComponent(q(lat, lon, r, "cur")), headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" } });
  await new Promise((res) => setTimeout(res, 3000));
}
await writeFile("probe/out/overpass-timing.txt", log.join("\n") + "\n");
