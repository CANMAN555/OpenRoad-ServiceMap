import { writeFile, mkdir } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
await mkdir("probe/out", { recursive: true });
async function get(url, name, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, Accept: "*/*", ...(opts.headers || {}) } });
    const t = await r.text();
    await writeFile("probe/out/" + name, t);
    console.log(name, r.status, t.length);
    return t;
  } catch (e) { console.log(name, "ERR", e.message); return ""; }
}
await get("https://www.ta-petro.com/fleets/eshop-2", "ta-eshop2.html");
await get("https://www.ta-petro.com/location/ne/petro-council-bluffs/", "ta-petro-cb.html");
await get("https://www.freightliner.com/webpack-chunks/chunk.scripts_components_dealers_js.928d272295ef42271c47.js", "fl-dealers-a.js");
await get("https://www.freightliner.com/static/webpack-chunks/chunk.scripts_components_dealers_js.928d272295ef42271c47.js", "fl-dealers-b.js");
await get("https://www.freightliner.com/webpack-chunks/chunk.scripts_components_dealerMap_js.72c1eb9ffebfa77394f5.js", "fl-dealermap-a.js");
await get("https://www.freightliner.com/static/webpack-chunks/chunk.scripts_components_dealerMap_js.72c1eb9ffebfa77394f5.js", "fl-dealermap-b.js");
await get("https://www.freightliner.com/umbraco/backoffice/dealers/geo-search?lat=41.25&lng=-95.93&radius=100", "fl-geo-get.json");
await get("https://www.freightliner.com/umbraco/backoffice/dealers/geo-search", "fl-geo-post.json", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: 41.25, lng: -95.93, radius: 100 }) });
await get("https://www.freightliner.com/dealer/", "fl-dealer.html");
await get("https://www.freightliner.com/sitemap.xml", "fl-sitemap.xml");
