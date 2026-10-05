import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const urls = {
  "te-contact.html": "https://timpteequipmenttrailers.com/contact-us",
  "te-find.html": "https://timpteequipmenttrailers.com/find-a-dealer",
  "te-sitemap.xml": "https://timpteequipmenttrailers.com/sitemap.xml",
};
for (const [n, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = await r.text(); await writeFile("probe/out/" + n, t); console.log(n, r.status, t.length); }
  catch (e) { console.log(n, e.message); }
}
const b = await chromium.launch();
const p = await b.newPage({ userAgent: UA });
const log = [];
p.on("response", async (r) => {
  const u = r.url(); const ct = r.headers()["content-type"] || "";
  if (/json/.test(ct) || /dealer|location|graphql|api/i.test(u)) { log.push(`${r.status()} ${u}`); try { const t = await r.text(); if (t.length < 3e6 && /json/.test(ct)) await writeFile(`probe/out/te-resp-${log.length}.json`, u + "\n" + t); } catch {} }
});
await p.goto("https://timpteequipmenttrailers.com/find-a-dealer", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(5000);
await writeFile("probe/out/te-find-rendered.html", await p.content());
await p.screenshot({ path: "probe/out/te-find.png" });
await writeFile("probe/out/te-log.txt", log.join("\n"));
console.log(log.join("\n"));
await b.close();
