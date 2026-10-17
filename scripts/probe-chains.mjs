// One-off probe, round 3: what a Rush Truck Centers location page carries.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const get = async (u) => { const r = await fetch(u, { headers: { "User-Agent": UA } }); return [r.status, await r.text()]; };
const [, t] = await get("https://www.rushtruckcenters.com/locations/10140000-abilene");
for (const re of [/"@type":\s*"(?:AutoDealer|LocalBusiness|Store|AutomotiveBusiness)"/, /latitude|data-lat|"lat"/i, /tel:/, /streetAddress|address/i, /Towing|Mobile Service|Collision/i]) {
  const i = t.search(re); console.log(re, i < 0 ? "(none)" : t.slice(Math.max(0, i - 300), i + 700).replace(/\s+/g, " "));
}
const [, d] = await get("https://www.rushtruckcenters.com/dealership-directory/all-locations");
console.log("DIRECTORY", d.length, d.slice(d.search(/Abilene/) - 400, d.search(/Abilene/) + 900).replace(/\s+/g, " "));
