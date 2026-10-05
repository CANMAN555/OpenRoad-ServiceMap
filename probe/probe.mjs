import { writeFile, mkdir } from "node:fs/promises";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const urls = {
  "tj-main.js": "https://timpte.com/wp-content/themes/plumbweb-child/_assets/_dist/main.js?ver=1790977620",
  "tj-types.json": "https://timpte.com/wp-json/wp/v2/types",
  "tj-tax.json": "https://timpte.com/wp-json/wp/v2/cust-tax-type?per_page=100",
  "tj-search.json": "https://timpte.com/wp-json/wp/v2/search?search=timpte&per_page=100&subtype=any",
  "tj-ajax.txt": "https://timpte.com/wp-admin/admin-ajax.php?action=get_locations",
};
for (const [n, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = await r.text(); await writeFile("probe/out/" + n, t); console.log(n, r.status, t.length); }
  catch (e) { console.log(n, e.message); }
}
