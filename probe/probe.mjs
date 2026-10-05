import { writeFile, mkdir } from "node:fs/promises";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
// Strip anything that looks like an access token before saving, so nothing secret is committed.
const redact = (t) => t.replace(/pk\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "pk.REDACTED").replace(/(key|token|apikey|api_key)(["'=:\s]+)[A-Za-z0-9_\-]{16,}/gi, "$1$2REDACTED").replace(/AIza[0-9A-Za-z_\-]{30,}/g, "AIzaREDACTED");
const log = [];
const P = (s) => { console.log(s); log.push(s); };
const urls = {
  "fp-robots.txt": "https://branches.fleetpride.com/robots.txt",
  "fp-sitemap.xml": "https://branches.fleetpride.com/sitemap.xml",
  "fp-index.html": "https://branches.fleetpride.com/",
  "fp-dallas.html": "https://branches.fleetpride.com/tx/dallas/",
  "stm-ids.json": "https://stmtires.com/wp-json/stm/v1/getAllLocationEntityIds",
  "stm-all.html": "https://stmtires.com/all-locations/",
  "stm-249.html": "https://stmtires.com/locations/store-249/",
  "stm-main.js": "https://stmtires.com/wp-content/themes/duffcapital_external/dist/front/main.da6df6fa.js",
};
for (const [n, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = redact(await r.text()); await writeFile("probe/out/" + n, t); P(`${n} ${r.status} ${t.length} ${u}`); }
  catch (e) { P(`${n} ERR ${e.message}`); }
}
// Follow the first branch link found on the Dallas page.
try {
  const { readFile } = await import("node:fs/promises");
  const d = await readFile("probe/out/fp-dallas.html", "utf8");
  const links = [...new Set([...d.matchAll(/href="([^"]*\/tx\/dallas\/[^"#?]+)"/g)].map((m) => m[1]))];
  P("fp dallas links: " + links.slice(0, 10).join(" "));
  if (links[0]) { const u = new URL(links[0], "https://branches.fleetpride.com/tx/dallas/").href; const r = await fetch(u, { headers: { "user-agent": UA } }); const t = redact(await r.text()); await writeFile("probe/out/fp-branch.html", t); P(`fp-branch.html ${r.status} ${t.length} ${u}`); }
} catch (e) { P("fp branch ERR " + e.message); }
await writeFile("probe/out/log.txt", log.join("\n") + "\n");
