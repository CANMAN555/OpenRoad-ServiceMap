import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
await mkdir("probe/out", { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const log = [];
const P = (s) => { console.log(s); log.push(s); };
for (const u of ["https://www.fleetpride.com/robots.txt", "https://www.southerntiremart.com/robots.txt", "https://www.fleetpride.com/sitemap.xml", "https://www.southerntiremart.com/sitemap.xml", "https://www.southerntiremart.com/sitemap_index.xml"]) {
  try { const r = await fetch(u, { headers: { "user-agent": UA } }); const t = await r.text(); P(`GET ${u} ${r.status} ${t.length}`); await writeFile("probe/out/" + u.replace(/[^a-z0-9]+/gi, "_").slice(8, 80), t); } catch (e) { P(`GET ${u} ERR ${e.message}`); }
}
const b = await chromium.launch();
const pages = { fp: ["https://www.fleetpride.com/branch-locator", "https://www.fleetpride.com/locations"], stm: ["https://www.southerntiremart.com/locations", "https://www.southerntiremart.com/store-locator"] };
let n = 0;
for (const [tag, urls] of Object.entries(pages)) for (const url of urls) {
  const ctx = await b.newContext({ userAgent: UA }); const p = await ctx.newPage();
  p.on("response", async (r) => {
    const ct = r.headers()["content-type"] || ""; const u = r.url();
    if (/json|xml/.test(ct) || /api|locat|store|branch|dealer/i.test(u)) {
      if (/\.(png|jpg|svg|woff2?|css|gif)(\?|$)/.test(u)) return;
      try { const body = await r.body(); const f = `${tag}-${++n}.txt`; await writeFile("probe/out/" + f, `${r.request().method()} ${u}\n${r.request().postData() || ""}\n\n` + body.toString()); P(`${tag} ${r.status()} ${ct.split(";")[0]} ${body.length} ${u.slice(0, 200)} -> ${f}`); } catch {}
    }
  });
  try { const r = await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }); P(`PAGE ${url} ${r?.status()} final=${p.url()}`); await p.waitForTimeout(4000);
    await writeFile(`probe/out/${tag}-page-${url.split("/").pop()}.html`, await p.content()); } catch (e) { P(`PAGE ${url} ERR ${e.message.slice(0, 200)}`); }
  await ctx.close();
}
await b.close();
await writeFile("probe/out/log.txt", log.join("\n") + "\n");
