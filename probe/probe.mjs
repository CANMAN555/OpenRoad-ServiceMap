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
const idx = await get("https://timpte.com/sitemap_index.xml", "timpte-sitemap.xml");
for (const [, u] of idx.matchAll(/<loc>([^<]+)<\/loc>/g)) await get(u, "timpte-sm-" + u.split("/").pop());
await get("https://timpte.com/wp-content/themes/plumbweb-child/_assets/_dist/locations-js.js", "timpte-locations-nover.js");
await get("https://timpte.com/wp-admin/admin-ajax.php?action=get_locations", "timpte-ajax1.txt");
await get("https://timpte.com/wp-json/", "timpte-wpjson.json");
