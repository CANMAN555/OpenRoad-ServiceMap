import { writeFile, mkdir } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
await mkdir("probe/out", { recursive: true });
async function get(url, name, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, Accept: "*/*", ...(opts.headers || {}) } });
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile("probe/out/" + name, buf);
    console.log(name, r.status, r.headers.get("content-type"), buf.length);
    return buf.toString("utf8");
  } catch (e) { console.log(name, "ERR", e.message); return ""; }
}
const links = (html, re) => [...new Set([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((u) => re.test(u)))];
const boss = await get("https://bosstruckshops.com/service-centers-list/", "boss-list.html");
console.log("boss files", links(boss, /\.(xlsx?|csv|pdf|json)(\?|$)/i));
await get("https://bosstruckshops.com/locations/grand-island-ne-boss-truck-shop/", "boss-gi.html");
await get("https://bosstruckshops.com/wp-sitemap.xml", "boss-sitemap.xml");
await get("https://bosstruckshops.com/sitemap_index.xml", "boss-sitemap2.xml");
await get("https://www.utilitytrailer.com/dealers", "util.html");
const pr = await get("https://prestigetrailers.com/shopping-tools-find-dealer/", "prestige.html");
console.log("prestige js", links(pr, /\.js|json|dealer|api/i).slice(0, 40));
await get("https://timpte.com/locations/", "timpte-loc.html");
await get("https://timpteequipmenttrailers.com/find-a-dealer/", "timpte-eq.html");
