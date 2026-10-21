// Small helpers shared by the vendor update scripts.
import dns from "node:dns";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

export const UA = "Mozilla/5.0 (compatible; OpenRoadServiceMap/1.0; +https://github.com/CANMAN555/OpenRoad-ServiceMap)";

// Turns HTML character references some feeds leave in their text ("O&#x27;Donnell", "&nbsp;") into characters.
const NAMED = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : NAMED[e.toLowerCase()] ?? m);
export const clean = (s) => (s == null ? null : decode(String(s)).replace(/\s+/g, " ").trim() || null);
// Vendor requests are GitHub issues made of "### Label\n\nvalue" blocks. These are the issue form's labels, in order
// (.github/ISSUE_TEMPLATE/add-vendor.yml; tests/parse-blocks.test.mjs keeps the two in step), then the blocks of Claude's
// research comment (see researchOf; Sections may be left out).
export const REQUEST_LABELS = ["Business name", "Services", "Street address", "City", "State (2 letters)", "ZIP code", "Phone number", "Notes"];
export const RESEARCH_LABELS = ["Website", "Hours", "Hours source", "Sections"];
// Reads such a body. It counts only when its headings are exactly one of the layouts given, in order, so a field whose
// text holds a "### " line (which would add or replace a field) makes the request invalid instead of changing it.
// Returns { fields } or { error }. "_No response_" means the field was left empty.
export function parseBlocks(body, layouts) {
  const heads = [], fields = {};
  let cur = null, buf = [];
  // requestBlock() escapes a leading "#"; undo that once the headings are known, so "#1 Towing" stays "#1 Towing".
  const flush = () => { if (cur !== null) { const v = buf.join("\n").trim().replace(/^\\#/gm, "#"); fields[cur] = v === "_No response_" ? "" : v; } };
  String(body || "").replace(/\r\n?/g, "\n").split("\n").forEach((line, i) => {
    const m = /^### (.*)$/.exec(line);
    if (!m) return buf.push(line);
    flush(); cur = m[1].trim(); buf = []; heads.push({ label: cur, line: i + 1 });
  });
  flush();
  if (layouts.some((l) => l.length === heads.length && l.every((x, i) => x === heads[i].label))) return { fields };
  const longest = layouts.reduce((a, b) => (b.length > a.length ? b : a), []);
  const bad = heads.find((h, i) => h.label !== longest[i]);
  return { error: bad
    ? `The request does not match the form: line ${bad.line} starts with \`### ${bad.label.replace(/`/g, "'").slice(0, 80)}\`. A field may not contain a line that starts with "### ".`
    : `The request does not match the form: fields are missing after \`${(heads.at(-1)?.label ?? "the start").replace(/`/g, "'").slice(0, 80)}\`.` };
}
// Claude's research on a request (website, hours, sections) is a comment that starts with RESEARCH_MARK, written by the
// repository owner or a collaborator. The request's own text can be edited by whoever opened it, so it never holds
// research (BUG-C1). The newest such comment counts; comments must be in the order GitHub lists them (oldest first).
// Returns { fields }, { error } or null when there is none.
export const RESEARCH_MARK = "<!-- claude-research -->";
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
export function researchOf(comments) {
  const c = comments.filter((x) => TRUSTED.has(x.author_association) && String(x.body || "").startsWith(RESEARCH_MARK)).at(-1);
  return c ? parseBlocks(c.body.slice(RESEARCH_MARK.length), [RESEARCH_LABELS.slice(0, 3), RESEARCH_LABELS]) : null;
}
// One block for a request built outside the issue form. "#" at the start of a line is escaped so typed text can never
// become a heading, and single-line fields stay on one line.
export function requestBlock(label, value, { oneLine = false } = {}) {
  let v = String(value ?? "").trim();
  if (oneLine) v = v.replace(/\s*\n\s*/g, " ");
  v = v.replace(/^#/gm, "\\#");
  return `### ${label}\n\n${v || "_No response_"}\n`;
}
// "917523253" -> "91752-3253"; five-digit ZIPs and ZIP+4 with a dash pass through.
export const formatZip = (z) => { const c = clean(z); return c && /^\d{9}$/.test(c) ? `${c.slice(0, 5)}-${c.slice(5)}` : c; };

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

// Pin corrections found by scripts/check-pins.mjs: { "brand:id": { address, lat, lon, why } }.
// A correction is used only while the company still lists the same street address, so a store that
// moves gets the company's new coordinates instead of an old fix.
const sameAddress = (a, b) => String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "") === String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export async function applyPinFixes(name, stores) {
  let fixes = {};
  try { fixes = JSON.parse(await readFile("data/pin-fixes.json", "utf8")); } catch { return 0; }
  let n = 0;
  for (const s of stores) {
    const f = fixes[`${name}:${s.id}`];
    if (f && sameAddress(f.address, s.address)) { s.lat = f.lat; s.lon = f.lon; s.geo = "checked"; n++; }
  }
  if (n) console.log(`Applied ${n} checked pin locations to ${name}`);
  return n;
}

export async function writeData(name, payload, min) {
  if (payload.stores.length < min) throw new Error(`Only ${payload.stores.length} ${name} locations (expected at least ${min}); not writing.`);
  await applyPinFixes(name, payload.stores);
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
        const text = await r.text();
        // The geocoder sometimes answers 200 with an error page instead of results; retry those.
        if (!/"Match"|"No_Match"|"Tie"/.test(text)) throw new Error("unexpected answer: " + text.slice(0, 120).replace(/\s+/g, " "));
        for (const line of text.split("\n")) {
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

// Companies that already have their own layer on the map. New vendor layers leave out any location that is the same
// shop as one of their pins: within about 500 feet AND sharing a distinctive word of the name ("TransEdge Truck
// Centers" next to a Volvo pin named "Transedge Truck Centers"), or sharing the phone number within about a mile.
// A different business next door, like an independent tire shop across the lot from a Love's, stays.
export const LIVE_LAYERS = ["loves", "ta", "freightliner", "volvo", "boss", "utility", "prestige", "timpte", "thermoking", "carrier", "fleetpride", "stm", "pomps", "bauer"];
const GENERIC = new Set("truck trucks trucking center centers centre service services svc tire tires repair repairs shop inc llc co corp company the and of at commercial sales parts equipment trailer trailers fleet diesel heavy duty auto group sc ctr travel stop stops mobile road".split(" "));
const words = (name) => new Set(String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !GENERIC.has(w) && !/^\d+$/.test(w)));
export async function liveMatcher(extra = []) {
  const pts = [];
  const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);
  for (const k of [...LIVE_LAYERS, ...extra]) {
    let d;
    try { d = JSON.parse(await readFile(`data/${k}.json`, "utf8")); } catch { continue; }
    for (const s of d.stores) if (Number.isFinite(s.lat)) pts.push([s.lat, s.lon, new Set([digits(s.phone), digits(s.servicePhone)].filter((n) => n.length === 10)), words(s.name)]);
  }
  const within = (lat, lon, a, b, deg) => Math.abs(a - lat) < deg && Math.abs((b - lon) * Math.cos(lat * Math.PI / 180)) < deg;
  return (s) => {
    // City names in store names ("Rush Truck Centers – Dallas") don't make two businesses the same shop.
    const city = words(s.city), ph = digits(s.phone), w = [...words(s.name)].filter((x) => !city.has(x));
    return pts.some(([a, b, phones, names]) =>
      (within(s.lat, s.lon, a, b, 0.0015) && w.some((x) => names.has(x))) || (phones.has(ph) && within(s.lat, s.lon, a, b, 0.015)));
  };
}

// ---------- fetching a vendor's website (BUG-C8) ----------
// The website comes from a vendor request, so it may point at the runner's own network (127.0.0.1, 169.254.169.254, a
// private LAN) or at a name or redirect that leads there. Only public addresses are fetched: an IP written in the URL is
// checked before connecting, and a host name is checked at connect time against every address DNS returns (Node then
// connects to one of those, so there is no second lookup to trick). Each redirect hop is a new request with the same checks.
const v4 = (ip) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
const V4_BLOCKED = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]]
  .map(([a, bits]) => [v4(a), 2 ** (32 - bits)]);
// "::ffff:127.0.0.1" -> eight 16-bit groups.
function v6Groups(ip) {
  let s = ip.toLowerCase().replace(/%.*$/, "");
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) { const n = v4(tail[1]); s = s.slice(0, -tail[1].length) + (n >>> 16).toString(16) + ":" + (n & 0xffff).toString(16); }
  const [head, rest] = s.split("::");
  const a = head ? head.split(":") : [], b = rest ? rest.split(":") : [];
  const g = rest === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill("0"), ...b];
  return g.map((x) => parseInt(x, 16));
}
export function isPublicAddress(ip) {
  const kind = net.isIP(String(ip || "").replace(/%.*$/, ""));
  if (kind === 4) { const n = v4(ip); return !V4_BLOCKED.some(([a, size]) => n >= a && n < a + size); }
  if (kind !== 6) return false;
  const g = v6Groups(ip);
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) carry an IPv4 address.
  const v4Tail = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return g[5] === 0 && g[6] === 0 && g[7] <= 1 ? false : isPublicAddress(v4Tail());
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicAddress(v4Tail());
  if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00) return false; // unique-local, link-local, multicast
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false; // documentation
  return true;
}
const blocked = (what) => Object.assign(new Error(`${what} is not a public internet address`), { code: "EBLOCKED" });
// A DNS lookup for http(s).request that fails when any address for the name is not public.
export function guardedLookup(resolve = dns.lookup) {
  return (host, opts, cb) => {
    if (typeof opts === "function") { cb = opts; opts = {}; }
    resolve(host, { all: true, family: opts.family || 0 }, (err, list) => {
      if (err) return cb(err);
      if (!list.length || list.some((a) => !isPublicAddress(a.address))) return cb(blocked(host));
      opts.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
    });
  };
}
// GET a web page from a public address only. Resolves { url, status, html } for the final hop, or rejects.
// request and resolve are swapped out by the tests; the scripts use the defaults.
export function safeGet(url, { timeoutMs = 20000, maxBytes = 2e6, maxRedirects = 5, request, resolve } = {}, hops = 0) {
  return new Promise((done, fail) => {
    let u;
    try { u = new URL(url); } catch { return fail(new Error(`bad URL: ${url}`)); }
    if (!/^https?:$/.test(u.protocol)) return fail(new Error(`not http(s): ${u.protocol}`));
    if (u.port && u.port !== "80" && u.port !== "443") return fail(new Error(`port ${u.port} is not allowed`));
    const host = u.hostname.replace(/^\[|\]$/g, "");
    // Node skips the lookup function for a host that is already an IP address, so check that address here.
    if (net.isIP(host) && !isPublicAddress(host)) return fail(blocked(host));
    const send = request || (u.protocol === "https:" ? https.request : http.request);
    const req = send(u, { method: "GET", lookup: guardedLookup(resolve), headers: { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Encoding": "gzip, deflate, br" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); clearTimeout(timer);
        if (hops >= maxRedirects) return fail(new Error("too many redirects"));
        let next;
        try { next = new URL(res.headers.location, u).href; } catch { return fail(new Error("bad redirect")); }
        return safeGet(next, { timeoutMs, maxBytes, maxRedirects, request, resolve }, hops + 1).then(done, fail);
      }
      const enc = String(res.headers["content-encoding"] || "").toLowerCase();
      const body = enc === "gzip" || enc === "x-gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate())
        : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
      const parts = [];
      let size = 0, finished = false;
      const finish = () => { if (finished) return; finished = true; clearTimeout(timer); done({ url: u.href, status: res.statusCode, html: Buffer.concat(parts).toString("utf8") }); };
      body.on("data", (c) => {
        if (finished) return;
        // A page past maxBytes is cut there; the phone number is near the top of a homepage or in its footer well before that.
        parts.push(c.subarray(0, maxBytes - size)); size += c.length;
        if (size >= maxBytes) { finish(); req.destroy(); }
      });
      body.on("end", finish);
      body.on("error", (e) => { if (!finished) { finished = true; clearTimeout(timer); fail(e); } });
    });
    const timer = setTimeout(() => req.destroy(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
    req.on("error", (e) => { clearTimeout(timer); fail(e); });
    req.end();
  });
}
async function getPage(url) {
  try {
    const r = await safeGet(url);
    return r.status >= 200 && r.status < 300 ? { url: r.url, html: r.html } : null;
  } catch { return null; }
}
// "(864) 419-1067" matches 864-419-1067, 864.419.1067, 8644191067, +1 864 419 1067 and tel: links.
const phoneIn = (html, d) => new RegExp(`\\(?${d.slice(0, 3)}\\)?[\\s.\\-\\u00a0]*${d.slice(3, 6)}[\\s.\\-\\u00a0]*${d.slice(6)}(?!\\d)`).test(html);
// Lowercase words a visitor reads on a page, plus its title and description.
const pageText = (html) => html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<meta[^>]+content="([^"]*)"[^>]*>/gi, " $1 ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").toLowerCase();

// Semi-truck shops only (Manny, 2026-10-18): a shop that also works on cars or pickups is left out of Other Vendors.
// The name may not say auto/car, and the shop's own website must talk about semis or heavy trucks and not about cars.
const CAR_NAME = /\b(auto|autos|automotive|car|cars|collision|4x4|off-?road|performance|auto ?body|body ?works|lube & oil)\b/i;
const CAR_SITE = /\b(cars(?! ?haul)|car (?:repair|service)|your car|suvs?|minivans?|sedans?|passenger (?:cars?|vehicles?)|auto repair|automotive (?:repair|service)|foreign (?:and|&) domestic|domestic (?:and|&) (?:foreign|import)|pickup trucks?|duramax|power ?stroke|lift kits?|jeeps?|motorcycles?|f-?250|f-?350)\b/;
const SEMI_SITE = /\b(semis?|semi-?trucks?|tractor[- ](?:trailers?|trucks?)|class 8|18[- ]wheelers?|big rigs?|over[- ]the[- ]road|otr|peterbilt|kenworth|freightliner|mack|western star|international trucks?|navistar|commercial (?:trucks?|vehicles?)|heavy[- ]duty (?:trucks?|vehicles?|diesel|repair)|heavy trucks?|fleets?|dot inspections?|reefers?|trailer repair|trucks? ?(?:and|&|\/) ?trailers?)\b/;
export function semiOnly(name, text) {
  const n = CAR_NAME.exec(name || "");
  if (n) return `name says "${n[0]}"`;
  // "We do not work on cars", "No cars, no pickups" and "Do you work on cars?" say the opposite, so sentences with a
  // "no" and questions are skipped.
  const said = String(text || "").split(/(?<=[.!?;:])\s/).filter((x) => !/\?$/.test(x) && !/\b(no|not|never|don't|won't|doesn't|except)\b/.test(x)).join(" ");
  const c = CAR_SITE.exec(said);
  if (c) return `website mentions "${c[0]}"`;
  if (!SEMI_SITE.test(text || "")) return "website does not mention semis or heavy trucks";
  return null;
}

// Is this business current? Its own website, fetched now, must show the same phone number.
// Returns { url, text } (the page that shows it, and the homepage's readable text), or the reason it could not be confirmed.
export async function checkSite(website, phone) {
  if (!website) return "no website";
  let site = website;
  if (!/^https?:\/\//i.test(site)) site = "https://" + site;
  const d = String(phone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d.length !== 10) return "phone is not a 10-digit number";
  // Some small-business sites only answer on http:// or without "www.".
  const home = (await getPage(site)) || (await getPage(site.replace(/^https:/i, "http:"))) || (await getPage(site.replace(/\/\/www\./i, "//")));
  if (!home) return "site down";
  const text = pageText(home.html);
  if (phoneIn(home.html, d)) return { url: home.url, text };
  // Many sites keep the number on a contact page.
  const base = new URL(home.url);
  const links = [...home.html.matchAll(/href="([^"#]*(?:contact|location|about)[^"#]*)"/gi)].map((m) => { try { return new URL(m[1], base).href; } catch { return null; } })
    .filter((u) => u && new URL(u).host === base.host);
  for (const u of [...new Set(links)].slice(0, 3)) {
    const pg = await getPage(u);
    if (pg && phoneIn(pg.html, d)) return { url: pg.url, text: text + " " + pageText(pg.html) };
  }
  return "phone not on site";
}
