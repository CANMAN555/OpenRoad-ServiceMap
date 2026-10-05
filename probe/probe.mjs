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
await get("https://timpte.com/wp-content/themes/plumbweb-child/_assets/_dist/locations-js.js?ver=1790977616", "timpte-locations.js");
await get("https://prestigetrailers.com/wp-content/themes/prestige-wp/dist/js/main-c87870f2.js?ver=7.0.6", "prestige-main.js");
await get("https://bosstruckshops.com/locations-sitemap.xml", "boss-locations-sitemap.xml");
await get("https://www.lodeking.com/shopping-tools-find-dealer", "lodeking-dealer.html");
