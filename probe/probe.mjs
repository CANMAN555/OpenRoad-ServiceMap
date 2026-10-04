import { writeFile, mkdir } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
await mkdir("probe/out", { recursive: true });
async function get(url, name) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*" } });
    const t = await r.text();
    await writeFile("probe/out/" + name, t);
    console.log(name, r.status, t.length);
    return t;
  } catch (e) { console.log(name, "ERR", e.message); return ""; }
}
const base = "https://www.freightliner.com/umbraco/backoffice/dealers/geo-search?";
await get(base + new URLSearchParams({ north: 41.6, south: 40.9, east: -95.5, west: -96.4 }), "fl-omaha.json");
const all = await get(base + new URLSearchParams({ north: 72, south: 17, east: -64, west: -170 }), "fl-us.json");
await get("https://www.ta-petro.com/location/tx/ta-express-houston/", "ta-express.html");
await get("https://www.ta-petro.com/location/nv/petro-henderson/", "ta-petro.html");
