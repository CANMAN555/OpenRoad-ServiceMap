import { writeFile, mkdir } from "node:fs/promises";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
// Strip anything that looks like an access token before saving, so nothing secret is committed.
const redact = (t) => t.replace(/pk\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "pk.REDACTED").replace(/(key|token|apikey|api_key)(["'=:\s]+)[A-Za-z0-9_\-]{16,}/gi, "$1$2REDACTED").replace(/AIza[0-9A-Za-z_\-]{30,}/g, "AIzaREDACTED");
const log = [];
const P = (s) => { console.log(s); log.push(s); };
const urls = {
  "fp-sitemap-index.xml": "https://branches.fleetpride.com/sitemap/sitemap_index.xml",
  "fp-api-domain.json": "https://maps.branches.fleetpride.com/api/getAsyncLocations?template=domain&level=domain",
  "fp-api-search.json": "https://maps.branches.fleetpride.com/api/getAsyncLocations?template=search&level=search&radius=5000&lat=39.8&lng=-98.5&limit=2000",
  "stm-e-653.json": "https://stmtires.com/wp-json/stm/v1/getLocationByEntityId?entityId=653",
  "stm-e-STMP-726.json": "https://stmtires.com/wp-json/stm/v1/getLocationByEntityId?entityId=STMP-726",
  "stm-e-STM-106.json": "https://stmtires.com/wp-json/stm/v1/getLocationByEntityId?entityId=STM-106",
  "stm-search-memphis.json": "https://stmtires.com/wp-json/stm/v1/searchLocations?lat=35.06&long=-89.93",
};
for (const [n, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = redact(await r.text()); await writeFile("probe/out/" + n, t); P(`${n} ${r.status} ${t.length} ${u}`); }
  catch (e) { P(`${n} ERR ${e.message}`); }
}
// Every page listed in the FleetPride sitemap index, and how many branch pages there are.
try {
  const { readFile } = await import("node:fs/promises");
  const idx = await readFile("probe/out/fp-sitemap-index.xml", "utf8");
  const maps = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  P("fp sitemaps: " + maps.join(" "));
  let pages = [];
  for (const m of maps) { const t = await (await fetch(m, { headers: { "user-agent": UA } })).text(); pages.push(...[...t.matchAll(/<loc>([^<]+\.html)<\/loc>/g)].map((x) => x[1])); }
  pages = [...new Set(pages)];
  P(`fp branch pages: ${pages.length}`); await writeFile("probe/out/fp-pages.txt", pages.join("\n"));
} catch (e) { P("fp sitemap ERR " + e.message); }
await writeFile("probe/out/log.txt", log.join("\n") + "\n");
