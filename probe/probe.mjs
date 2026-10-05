import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
await mkdir("probe/out", { recursive: true });
<<<<<<< HEAD
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
=======
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const log = [];
const P = (s) => { console.log(s); log.push(s); };
for (const u of ["https://www.fleetpride.com/robots.txt", "https://www.southerntiremart.com/robots.txt", "https://www.fleetpride.com/sitemap.xml", "https://www.southerntiremart.com/sitemap.xml", "https://www.southerntiremart.com/sitemap_index.xml"]) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = await r.text(); P(`GET ${u} ${r.status} ${t.length}`); await writeFile("probe/out/" + u.replace(/[^a-z0-9]+/gi, "_").slice(8, 80), t); } catch (e) { P(`GET ${u} ERR ${e.message}`); }
}
const b = await chromium.launch();
const pages = { fp: ["https://www.fleetpride.com/branch-locator", "https://www.fleetpride.com/locations"], stm: ["https://www.southerntiremart.com/locations", "https://www.southerntiremart.com/store-locator"] };
let n = 0;
for (const [tag, urls] of Object.entries(pages)) for (const url of urls) {
  const ctx = await b.newContext({ userAgent: UA }); const p = await ctx.newPage();
  p.on("response", async (r) => {
    const ct = r.headers()["content-type"] || ""; const u = r.url();
    if (/json|xml/.test(ct) || /api|locat|store|branch|dealer/i.test(u)) {
      if (/\.(png|jpg|svg|woff2?|css|gif)(\?|$)/.test(u)) return;
      try { const body = await r.body(); const f = `${tag}-${++n}.txt`; await writeFile("probe/out/" + f, `${r.request().method()} ${u}\n${r.request().postData() || ""}\n\n` + body.toString()); P(`${tag} ${r.status()} ${ct.split(";")[0]} ${body.length} ${u.slice(0, 200)} -> ${f}`); } catch {}
    }
  });
  try { const r = await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }); P(`PAGE ${url} ${r?.status()} final=${p.url()}`); await p.waitForTimeout(4000);
    await writeFile(`probe/out/${tag}-page-${url.split("/").pop()}.html`, await p.content()); } catch (e) { P(`PAGE ${url} ERR ${e.message.slice(0, 200)}`); }
  await ctx.close();
}
await b.close();
await writeFile("probe/out/log.txt", log.join("\n") + "\n");
>>>>>>> c93a76b (Probe FleetPride and Southern Tire Mart locators)
