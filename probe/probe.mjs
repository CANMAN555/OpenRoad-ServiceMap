import { writeFile, mkdir } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
await mkdir("probe/out", { recursive: true });
async function get(url, name) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile("probe/out/" + name, buf);
    console.log(name, r.status, buf.length);
  } catch (e) { console.log(name, "ERR", e.message); }
}
for (const s of ["timpte-of-council-bluffs", "load-runner-trailers", "51-trailer-sales", "timpte-mobile-services"]) await get(`https://timpte.com/location/${s}/`, `tl-${s}.html`);
await get("https://timpte.com/wp-json/wp/v2/types/location", "timpte-type-location.json");
await get("https://timpte.com/wp-json/wp/v2/location?per_page=3", "timpte-rest-location.json");
