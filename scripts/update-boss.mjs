// Downloads every Boss Truck Shop location page listed on bosstruckshops.com (the locations sitemap
// plus the Service Centers List page) and writes data/boss.json.
// Run by .github/workflows/update-vendors.yml.
import { clean, fetchText, formatPhone, pool, writeData } from "./lib.mjs";

const SITE = "https://bosstruckshops.com";
const decode = (s) =>
  clean(String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8211;|&ndash;/g, "–").replace(/&#8217;|&rsquo;/g, "’").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&nbsp;/g, " "));
const all = (re, s) => [...s.matchAll(re)];

const urls = new Set();
for (const src of [`${SITE}/locations-sitemap.xml`, `${SITE}/service-centers-list/`]) {
  try {
    const t = await fetchText(src);
    for (const m of t.matchAll(/https:\/\/bosstruckshops\.com\/locations\/[a-z0-9-]+\//g)) urls.add(m[0]);
  } catch (e) { console.log("skip", src, e.message); }
}
console.log("location pages:", urls.size);

function parse(url, h) {
  const map = /id="location-map"([^>]*)>/.exec(h);
  if (!map) return null;
  const attr = (n) => (new RegExp(`data-${n}="([^"]*)"`).exec(map[1]) || [])[1];
  const lat = Number(attr("location-lat")), lon = Number(attr("location-lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) return null;
  const title = decode(attr("location-title")) || decode((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(h) || [])[1]);
  const fullAddr = decode(attr("address")) || decode((/class="text-small text-address">([\s\S]*?)<\/p>/.exec(h) || [])[1]);
  const hoursCol = (/class="inner-column hours">([\s\S]*?)<\/section>/.exec(h) || [])[1] || "";
  const heads = all(/class="text-heading">([\s\S]*?)<\/p>/g, hoursCol).map((m) => decode(m[1]));
  const smalls = all(/<p class="text-small">([\s\S]*?)<\/p>/g, hoursCol).map((m) => decode(m[1]));
  const telAttr = (/data-phone="([^"]*)"/.exec(h) || [])[1];
  const phone = formatPhone(telAttr || heads.find((x) => /\d{3}\D*\d{3}\D*\d{4}/.test(x)));
  const hours = heads.filter((x) => !/^\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}$/.test(x));
  const qty = (label) => {
    const m = new RegExp(`${label}<\\/h3>\\s*<p class="quantity">([^<]*)<`, "i").exec(h);
    return m ? clean(m[1]) : null;
  };
  // "services & repairs" blocks: heading + list of items (tire brands, brake work, engine work ...)
  const groups = all(/<h4 class="heading-h4">([\s\S]*?)<\/h4>[\s\S]*?<ul class="list-sub-items">([\s\S]*?)<\/ul>/g, h).map((m) => ({
    name: decode(m[1]),
    items: all(/<li>([\s\S]*?)<\/li>/g, m[2]).map((x) => decode(x[1])).filter(Boolean),
  })).filter((g) => g.name);
  // Address "7482 Bosselman Avenue, Grand Island, NE, USA" -> street / city / state
  const parts = (fullAddr || "").split(",").map((x) => x.trim()).filter((x) => x && !/^(USA|United States)$/i.test(x));
  let state = null, zip = null;
  const last = parts[parts.length - 1] || "";
  const sz = /^([A-Z]{2})(?:\s+(\d{5}))?$/.exec(last);
  if (sz) { state = sz[1]; zip = sz[2] || null; parts.pop(); }
  const city = parts.length > 1 ? parts.pop() : null;
  if (!state) {
    const t = /,\s*([A-Z]{2})\b/.exec(title || "");
    if (t) state = t[1];
  }
  return {
    id: url.replace(/\/$/, "").split("/").pop(),
    name: title,
    address: parts.join(", ") || null,
    city: city || (title || "").split(",")[0] || null,
    state,
    zip,
    phone,
    lat,
    lon,
    hours,
    exit: smalls.find((x) => /\b(exit|mm|mile marker)\b/i.test(x)) || null,
    locatedAt: (smalls.find((x) => /^located/i.test(x)) || "").replace(/^located (at|in|inside)\s*/i, "") || null,
    notes: smalls.filter((x) => !/\b(exit|mm|mile marker)\b/i.test(x) && !/^located/i.test(x)),
    bays: qty("SERVICE BAYS"),
    roadTrucks: qty("ROADSIDE ASSISTANCE TRUCKS"),
    services: groups,
    url,
  };
}

const stores = (await pool([...urls], 4, async (u) => {
  try { return parse(u, await fetchText(u)); } catch (e) { console.log("skip", u, e.message); return null; }
})).filter(Boolean);
stores.sort((a, b) => (a.state || "").localeCompare(b.state || "") || (a.city || "").localeCompare(b.city || ""));
const payload = {
  source: `${SITE}/service-centers-list/`,
  fetched_at: new Date().toISOString(),
  count: stores.length,
  stores,
};
await writeData("boss", payload, 30);
