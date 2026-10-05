import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const urls = {
  "tk-nc.html": "https://www.thermoking.com/dealers/north-america/us/nc",
  "tk-us.html": "https://www.thermoking.com/dealers/north-america/us",
  "tk-na.html": "https://www.thermoking.com/dealers/north-america",
  "tk-sitemap.xml": "https://www.thermoking.com/sitemap.xml",
  "ca-apu.html": "https://www.carrier.com/truck-trailer/en/north-america/products/na-truck-trailer/apu",
  "ca-locator.html": "https://www.carrier.com/truck-trailer/en/north-america/dealer-locator/",
};
for (const [n, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: { "user-agent": UA }, redirect: "follow" }); const t = await r.text(); await writeFile("probe/out/" + n, r.url + "\n" + t); console.log(n, r.status, r.url, t.length); }
  catch (e) { console.log(n, e.message); }
}
const b = await chromium.launch();
for (const [tag, url] of [["tkp", "https://www.thermoking.com/dealers/north-america/us/nc"], ["cap", "https://www.carrier.com/truck-trailer/en/north-america/dealer-locator/"]]) {
  const p = await b.newPage({ userAgent: UA });
  const log = [];
  p.on("response", async (r) => {
    const u = r.url(); const ct = r.headers()["content-type"] || "";
    if (/google|gtm|analytics|facebook|doubleclick|bing|adsrvr|hotjar|linkedin/.test(u)) return;
    if (/json|xml/.test(ct) || /dealer|locat|api|search/i.test(u)) { log.push(`${r.status()} ${r.request().method()} ${u} ${r.request().postData() || ""}`.slice(0, 600)); try { const t = await r.text(); if (/json/.test(ct) && t.length < 5e6) await writeFile(`probe/out/${tag}-resp-${log.length}.json`, u + "\n" + t); } catch {} }
  });
  try { await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }); } catch (e) { log.push("goto " + e.message); }
  await p.waitForTimeout(5000);
  log.push("final " + p.url());
  await writeFile(`probe/out/${tag}-rendered.html`, await p.content());
  await p.screenshot({ path: `probe/out/${tag}.png` });
  await writeFile(`probe/out/${tag}-log.txt`, log.join("\n"));
  console.log(tag, "\n" + log.join("\n"));
  await p.close();
}
await b.close();
