import { writeFile, mkdir } from "node:fs/promises";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const urls = {
  "tm-embed-cb.html": "https://timpte.com/location/timpte-of-council-bluffs/embed/",
  "tm-embed-51.html": "https://timpte.com/location/51-trailer-sales/embed/",
  "tm-feed.xml": "https://timpte.com/feed/?post_type=location",
  "tm-search.html": "https://timpte.com/?s=trailer&post_type=location",
  "tm-archive.html": "https://timpte.com/location/",
  "tm-typesm.xml": "https://timpte.com/type-sitemap.xml",
};
for (const [n, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = await r.text(); await writeFile("probe/out/" + n, t); console.log(n, r.status, t.length); }
  catch (e) { console.log(n, e.message); }
}
