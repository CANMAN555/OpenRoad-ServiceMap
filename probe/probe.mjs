// Temporary: find the data feeds behind TA, Freightliner and Volvo locators.
import { writeFile, mkdir } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
await mkdir("probe/out", { recursive: true });
async function get(url, name) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
    const t = await r.text();
    await writeFile("probe/out/" + name, t);
    console.log(name, r.status, t.length);
    return t;
  } catch (e) { console.log(name, "ERR", e.message); return ""; }
}
async function scripts(html, base, prefix) {
  const urls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], base).href).filter((u) => new URL(u).host === new URL(base).host);
  let i = 0;
  for (const u of urls.slice(0, 40)) {
    const js = await get(u, `${prefix}-js${i++}.js`);
    const hits = [...new Set([...js.matchAll(/["'`]((?:https?:)?\/\/[^"'`\s]*(?:api|json|locat|dealer|search)[^"'`\s]*|\/[a-z0-9_\-\/]*(?:api|json|locat|dealer)[a-z0-9_\-\/.?=&]*)["'`]/gi)].map((m) => m[1]))];
    if (hits.length) console.log(prefix, u, "\n  " + hits.slice(0, 60).join("\n  "));
  }
}
const ta = await get("https://www.ta-petro.com/location/all-locations", "ta-all.html");
await scripts(ta, "https://www.ta-petro.com/", "ta");
await get("https://www.ta-petro.com/location/ne/ta-omaha/", "ta-omaha.html");
await get("https://www.ta-petro.com/location/al/ta-tuscaloosa/", "ta-tuscaloosa.html");
await get("https://www.ta-petro.com/sitemap.xml", "ta-sitemap.xml");
const fl = await get("https://www.freightliner.com/dealer-search/", "fl-search.html");
await scripts(fl, "https://www.freightliner.com/", "fl");
await get("https://www.freightliner.com/dealers/united-states/NE/", "fl-ne.html");
await get("https://dealerlocator.volvotrucks.us/Volvo_DealerJson.ashx", "volvo.json");
const vf = await get("https://www.volvotrucks.us/find-a-dealer/", "volvo-find.html");
await scripts(vf, "https://www.volvotrucks.us/", "volvo");
