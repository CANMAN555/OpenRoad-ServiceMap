import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const urls = {
  "tk-locsm.xml": "https://timpte.com/location-sitemap.xml",
  "tk-typesm.xml": "https://timpte.com/type-sitemap.xml",
  "tk-service.html": "https://timpte.com/parts-and-service/service/",
  "tk-parts.html": "https://timpte.com/parts-and-service/parts/",
  "tk-contact.html": "https://timpte.com/learn-more/contact-us/",
  "tk-sidney.html": "https://timpte.com/timpte-sidney-ohio/",
  "tk-feed.xml": "https://timpte.com/location/timpte-of-council-bluffs/feed/",
  "tk-oembed.json": "https://timpte.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Ftimpte.com%2Flocation%2Ftimpte-of-council-bluffs%2F",
};
for (const [n, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = await r.text(); await writeFile("probe/out/" + n, t); console.log(n, r.status, t.length); }
  catch (e) { console.log(n, e.message); }
}
const b = await chromium.launch();
const p = await b.newPage({ userAgent: UA });
const log = [];
p.on("console", (m) => log.push("console " + m.type() + " " + m.text()));
p.on("pageerror", (e) => log.push("pageerror " + e.message));
p.on("request", (r) => { const u = r.url(); if (/timpte\.com/.test(u) && !/\.(png|jpg|svg|woff2?|css|gif|ttf)(\?|$)/.test(u)) log.push(`${r.method()} ${u} ${r.postData() || ""}`.slice(0, 400)); });
await p.goto("https://timpte.com/locations/?search-typesearch=zip&state=&zip=68501&products-to-search=dry-bulk-commodity-trailers", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(8000);
await writeFile("probe/out/tk-zip.html", await p.content());
await p.screenshot({ path: "probe/out/tk-zip.png", fullPage: false });
log.push("hasLocationsHidden " + (await p.evaluate(() => document.querySelector("#locations-container")?.className)));
log.push("inner " + (await p.evaluate(() => document.querySelector("#locations-content .inner")?.innerHTML.slice(0, 2000))));
log.push("globals " + (await p.evaluate(() => Object.keys(window).filter((k) => /loc|marker|dealer|timpte/i.test(k)).join(","))));
await writeFile("probe/out/tk-log.txt", log.join("\n"));
console.log(log.join("\n"));
await b.close();
