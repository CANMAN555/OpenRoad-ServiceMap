import { writeFile, mkdir } from "node:fs/promises";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const urls = {
  "ca-index.html": "https://locator.ttdealers.carrier.com/",
  "ca-main.js": "https://locator.ttdealers.carrier.com/ClientApplication/src/main.00198465d18a2deef474.js",
  "tk-full-sitemap.xml": "https://www.thermoking.com/dealers/sitemap.xml",
};
for (const [n, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = await r.text(); await writeFile("probe/out/" + n, t); console.log(n, r.status, t.length); }
  catch (e) { console.log(n, e.message); }
}
