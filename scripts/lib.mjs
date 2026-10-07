// Small helpers shared by the vendor update scripts.
import { mkdir, writeFile } from "node:fs/promises";

export const UA = "Mozilla/5.0 (compatible; OpenRoadServiceMap/1.0; +https://github.com/CANMAN555/OpenRoad-ServiceMap)";

export const clean = (s) => (s == null ? null : String(s).replace(/\s+/g, " ").trim() || null);

export function formatPhone(p) {
  const d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d === "5555555555") return null; // placeholder some feeds use
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : clean(p);
}

// GET with retries and backoff; these sites occasionally answer 5xx for a few seconds.
export async function fetchText(url, { tries = 5, accept = "*/*" } = {}) {
  let last;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: accept } });
      if (r.ok) return await r.text();
      if (r.status === 404) throw Object.assign(new Error("HTTP 404"), { notFound: true });
      last = "HTTP " + r.status;
    } catch (e) {
      if (e.notFound) throw e;
      last = e.message;
    }
    await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
  }
  throw new Error(`${url}: ${last}`);
}

// "08:00AM" / "8:00 AM" / "17:30" -> "8 a.m." / "5:30 p.m."
export function clock(t) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AP]M)?\s*$/i.exec(t || "");
  if (!m) return null;
  const min = m[2];
  const ap = m[3] ? m[3].toUpperCase() : +m[1] >= 12 && +m[1] < 24 ? "PM" : "AM";
  const h = +m[1] % 12 || 12;
  return `${h}${min === "00" ? "" : ":" + min} ${ap === "AM" ? "a.m." : "p.m."}`;
}
export const span = (a, b) => {
  const s = clock(a), e = clock(b);
  if (!s || !e) return null;
  if (s === e && /^12 a\.m\.$/.test(s)) return "24 hours";
  return `${s} – ${e}`;
};

export async function writeData(name, payload, min) {
  if (payload.stores.length < min) throw new Error(`Only ${payload.stores.length} ${name} locations (expected at least ${min}); not writing.`);
  await mkdir("data", { recursive: true });
  await writeFile(`data/${name}.json`, JSON.stringify(payload) + "\n");
  console.log(`Wrote data/${name}.json with ${payload.stores.length} locations`);
}

export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n], n);
    }
  }));
  return out;
}

// Street-level coordinates from the U.S. Census Bureau's free batch geocoder.
// list: [{id, street, city, state, zip}] -> Map(id -> [lat, lon]) for the addresses it matched.
export async function censusGeocode(list) {
  const out = new Map();
  const csvField = (v) => `"${String(v || "").replace(/"/g, "'")}"`;
  for (let i = 0; i < list.length; i += 200) {
    const csv = list.slice(i, i + 200).map((s) => [s.id, s.street, s.city, s.state, s.zip].map(csvField).join(",")).join("\n");
    for (let attempt = 0; attempt < 4; attempt++) {
      const form = new FormData();
      form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
      form.append("benchmark", "Public_AR_Current");
      try {
        const r = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: form, headers: { "User-Agent": UA } });
        if (!r.ok) throw new Error("HTTP " + r.status);
        for (const line of (await r.text()).split("\n")) {
          const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
          if (cols[2] !== "Match" || !cols[5]) continue;
          const [lon, lat] = cols[5].split(",").map(Number);
          // The array is [lat, lon] for existing callers; .exact and .matched say how sure the Census is.
          if (Number.isFinite(lat) && Number.isFinite(lon)) out.set(cols[0], Object.assign([lat, lon], { exact: cols[3] === "Exact", matched: cols[4] }));
        }
        break;
      } catch (e) {
        console.warn(`Census geocoder (batch ${i / 200 + 1}, try ${attempt + 1}):`, e.message);
        await new Promise((res) => setTimeout(res, 10000 * (attempt + 1)));
      }
    }
  }
  return out;
}
