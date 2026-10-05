// Downloads the Prestige Trailers dealer list (the feed behind prestigetrailers.com's Find a Dealer
// page), keeps public U.S. dealers and writes data/prestige.json.
// The feed URL carries a site key, so it is read from Prestige's own page script at run time and
// never stored in this repository. Only business fields are kept (no staff names or emails).
// Run by .github/workflows/update-vendors.yml.
import { clean, fetchText, formatPhone, writeData } from "./lib.mjs";

const PAGE = "https://prestigetrailers.com/shopping-tools-find-dealer/";
const US = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));

async function feedUrl() {
  const html = await fetchText(PAGE);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), PAGE).href)
    .filter((u) => u.includes("prestigetrailers.com"));
  // The theme's main bundle and the store-locator script both reference the feed.
  scripts.sort((a, b) => /main-|locator/.test(b) - /main-|locator/.test(a));
  for (const s of scripts) {
    try {
      const m = /https:\/\/dealers\.prestigetrailers\.com\/api\/dealers\?[^"'`\s]+/.exec(await fetchText(s, { tries: 2 }));
      if (m) return m[0];
    } catch {}
  }
  throw new Error("Could not find the Prestige dealer feed in the site scripts");
}

const list = JSON.parse(await fetchText(await feedUrl(), { accept: "application/json" }));
const site = (w) => { w = clean(w); return w ? (/^https?:\/\//i.test(w) ? w : "https://" + w.replace(/^\/+/, "")) : null; };
const stores = list
  .filter((d) => d && d.public !== false && US.has(clean(d.province)) && Number.isFinite(+d.lat) && Number.isFinite(+d.lng) && +d.lat !== 0)
  .map((d) => ({
    id: clean(d.id),
    name: clean(d.name),
    address: clean(d.address),
    city: clean(d.city),
    state: clean(d.province),
    zip: clean(d.postcode),
    phone: formatPhone(d.phone),
    tollFree: formatPhone(d.tollfree),
    servicePhone: /\d{7}/.test(String(d.service || "").replace(/\D/g, "")) ? formatPhone(d.service) : null,
    lat: +d.lat,
    lon: +d.lng,
    website: site(d.website),
  }));
stores.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
await writeData("prestige", { source: PAGE, fetched_at: new Date().toISOString(), count: stores.length, stores }, 10);
