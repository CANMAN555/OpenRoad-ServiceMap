// Downloads every TA, Petro and TA Express location from ta-petro.com and writes data/ta.json.
// The list of locations comes from the site's sitemap; each location page carries its address,
// coordinates, phones, fuel, truck service details and amenities. eShop 2.0 sites come from
// https://www.ta-petro.com/fleets/eshop-2. Run by .github/workflows/update-vendors.yml.
import { clean, fetchText, formatPhone, pool, span, writeData } from "./lib.mjs";

const SITE = "https://www.ta-petro.com";
const decode = (s) =>
  s == null ? s : s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const text = (s) => clean(decode((s || "").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, " ")));

async function locationUrls() {
  const xml = await fetchText(`${SITE}/sitemap.xml`);
  return [...new Set([...xml.matchAll(/<loc>\s*(https:\/\/www\.ta-petro\.com\/location\/[a-z]{2}\/[^<\s]+)\s*<\/loc>/g)].map((m) => m[1]))];
}

// "TA Cartersville – 146" lines on the eShop 2.0 page -> Set of store numbers.
async function eshop2Sites() {
  const html = await fetchText(`${SITE}/fleets/eshop-2`);
  const body = text(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<\/(p|li|div|h\d|br)>/g, "\n"));
  const nums = new Set();
  for (const [, n] of (body || "").matchAll(/(?:TA|Petro)[A-Za-z .'-]*?\s[–-]\s(\d{1,4})\b/g)) nums.add(Number(n));
  return nums;
}

function strongField(html, label) {
  const m = new RegExp(`<strong>\\s*${label}:?\\s*</strong>(?:<br\\s*/?>)?([\\s\\S]*?)</p>`, "i").exec(html);
  return m ? text(m[1]) : null;
}

function parse(html, url, eshop2) {
  const h1 = /<h1>([\s\S]*?)<span>\s*#?(\d+)\s*<\/span>/.exec(html);
  if (!h1) return null;
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .find((j) => j && j.geo);
  if (!ld) return null;
  const name = text(h1[1]);
  const id = Number(h1[2]);
  const brand = /^TA Express\b/i.test(name) ? "TA Express" : /^Petro\b/i.test(name) ? "Petro" : /^TA\b/i.test(name) ? "TA" : "Affiliate";
  const lists = {};
  for (const m of html.matchAll(/alt="[^"]*icon">\s*([^<]+?)\s*<\/button>[\s\S]*?<ul>([\s\S]*?)<\/ul>/g)) {
    lists[clean(m[1])] = [...m[2].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => text(x[1])).filter(Boolean);
  }
  const maintenance = lists["Truck Maintenance Options"] || [];
  const bays = Number(strongField(html, "Truck Service Bays")) || null;
  const inBay = strongField(html, "In-bay Service Hours");
  const servicePhone = formatPhone(strongField(html, "Truck Service"));
  const hasShop = Boolean(bays || inBay || maintenance.length);
  const a = ld.address || {};
  const fuel = [...new Set(((ld.hasOfferCatalog || {}).itemListElement || []).map((o) => clean(o.name)).filter(Boolean))];
  const food = [...new Set([...html.matchAll(/<div class="img-title-wrapper[\s\S]*?<strong>([^<]+)<\/strong>/g)].map((m) => text(m[1])))];
  return {
    id,
    name,
    brand,
    address: clean(a.streetAddress),
    city: clean(a.addressLocality),
    state: clean(a.addressRegion),
    zip: clean(a.postalCode),
    phone: formatPhone(a.telephone),
    lat: Number(ld.geo.latitude),
    lon: Number(ld.geo.longitude),
    highway: strongField(html, "Highway"),
    fuel,
    shop: {
      onSite: hasShop,
      bays,
      hours: inBay ? inBay.replace(/(\d{1,2}:\d{2} [AP]M) - (\d{1,2}:\d{2} [AP]M)/g, (_, x, y) => span(x, y) || `${x} - ${y}`) : null,
      phone: servicePhone,
      services: maintenance.filter((s) => !/^eShop$/i.test(s)),
      eshop: eshop2.has(id) ? "eShop 2.0" : maintenance.some((s) => /^eShop$/i.test(s)) ? "eShop" : null,
    },
    era: /800-824-SHOP/.test(html) ? "800-824-SHOP (7467)" : null,
    parking: lists["Truck Parking Options"] || [],
    amenities: lists["Other Amenities"] || [],
    food,
    url,
  };
}

const [urls, eshop2] = await Promise.all([locationUrls(), eshop2Sites()]);
console.log(`${urls.length} location pages in sitemap; eShop 2.0 sites: ${[...eshop2].join(", ")}`);
let missing = 0;
const stores = (await pool(urls, 4, async (url) => {
  try {
    const s = parse(await fetchText(url), url, eshop2);
    if (!s) console.warn("Could not parse", url);
    return s;
  } catch (e) {
    missing++;
    console.warn("Skipped", url, e.message);
    return null;
  }
})).filter((s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.lat !== 0);

stores.sort((x, y) => x.id - y.id);
const count = (f) => stores.reduce((o, s) => ((o[f(s)] = (o[f(s)] || 0) + 1), o), {});
const payload = {
  source: "https://www.ta-petro.com/location/all-locations",
  fetched_at: new Date().toISOString(),
  count: stores.length,
  counts: { brand: count((s) => s.brand), shop: count((s) => (s.shop.onSite ? "shop" : "no shop")), eshop: count((s) => s.shop.eshop || "none") },
  eshop2_sites: [...eshop2].sort((x, y) => x - y),
  stores,
};
console.log(JSON.stringify(payload.counts), `skipped ${missing}`);
await writeData("ta", payload, 250);
