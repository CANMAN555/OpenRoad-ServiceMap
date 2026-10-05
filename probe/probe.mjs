import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
await mkdir("probe/out", { recursive: true });
const b = await chromium.launch();
const p = await b.newPage();
const log = [];
p.on("request", (r) => { if (!/\.(png|jpg|svg|woff2?|css|gif)(\?|$)/.test(r.url())) log.push(`${r.method()} ${r.url()} ${r.postData() || ""}`.slice(0, 600)); });
p.on("response", async (r) => {
  const u = r.url();
  if (/admin-ajax|wp-json|location|\.json/i.test(u) && !/\.js(\?|$)/.test(u)) {
    try { const t = await r.text(); await writeFile(`probe/out/tl-resp-${log.length}.txt`, u + "\n" + t.slice(0, 200000)); } catch {}
  }
});
await p.goto("https://timpte.com/locations/", { waitUntil: "networkidle", timeout: 60000 });
await p.selectOption("#search-type", "state").catch((e) => console.log("search-type", e.message));
await p.waitForTimeout(500);
await p.selectOption("#state", { label: "Nebraska" }).catch((e) => console.log("state", e.message));
await p.selectOption("#products-to-search", "dry-bulk-commodity-trailers").catch((e) => console.log("prod", e.message));
await p.click('#locations-search input[type="submit"]').catch((e) => console.log("submit", e.message));
await p.waitForTimeout(6000);
await writeFile("probe/out/tl-after.html", await p.content());
await writeFile("probe/out/tl-requests.txt", log.join("\n"));
console.log(log.filter((l) => !/google|gtm|analytics|facebook|doubleclick/.test(l)).join("\n"));
await b.close();
