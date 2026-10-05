import { writeFile, mkdir } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
await mkdir("probe/out", { recursive: true });
async function get(url, name, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, Accept: "*/*", ...(opts.headers || {}) } });
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile("probe/out/" + name, buf);
    console.log(name, r.status, r.headers.get("content-type"), buf.length);
    return buf.toString("utf8");
  } catch (e) { console.log(name, "ERR", e.message); return ""; }
}
const loc = await get("https://prestigetrailers.com/wp-content/themes/prestige-wp/dist/js/dealerLocator-7763edbb.js", "prestige-locator.js");
const main = await get("https://prestigetrailers.com/wp-content/themes/prestige-wp/dist/js/main-c87870f2.js?ver=7.0.6", "x.js");
const urls = [...new Set([...(loc + main).matchAll(/https:\/\/dealers\.prestigetrailers\.com\/api\/[^"'`\s]+/g)].map((m) => m[0]))];
console.log("prestige api urls (keys hidden)", urls.map((u) => u.replace(/apikey=[^&]+/, "apikey=…")));
let i = 0;
for (const u of urls) await get(u.replace(/\$\{[^}]+\}/g, ""), `prestige-api-${i++}.json`);
await get("https://timpte.com/wp-content/themes/plumbweb-child/_assets/_dist/main.js?ver=1790977620", "timpte-main.js");
await get("https://timpte.com/wp-json/wp/v2/types", "timpte-types.json");
