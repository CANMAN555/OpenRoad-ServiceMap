import { writeFile, mkdir } from "node:fs/promises";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const urls = {
  "tj-locjs.js": "https://timpte.com/wp-content/themes/plumbweb-child/_assets/_dist/locations-js.js?ver=1790977616",
  "tj-wpjson.json": "https://timpte.com/wp-json/",
  "tj-loc.json": "https://timpte.com/wp-json/wp/v2/location?per_page=100",
  "tj-loc2.json": "https://timpte.com/wp-json/wp/v2/location?per_page=100&page=2",
  "tj-ne.html": "https://timpte.com/locations/?search-typesearch=state&state=Nebraska&zip=&products-to-search=dry-bulk-commodity-trailers",
};
for (const [n, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = await r.text(); await writeFile("probe/out/" + n, t); console.log(n, r.status, t.length); }
  catch (e) { console.log(n, e.message); }
}
