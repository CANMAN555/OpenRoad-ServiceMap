// Handles an "Add a vendor" request (a GitHub issue made from .github/ISSUE_TEMPLATE/add-vendor.yml, usually opened
// from the map's "Add a vendor" button). The request is checked online before anything is added:
//   1. the vendor's own website, fetched now, must show the same phone number;
//   2. the street address must be found by the U.S. Census geocoder (or OpenStreetMap's, as a backup);
//   3. it must not already be on the map (same phone within about a mile).
// When every check passes and the request comes from the repository owner (or carries the "approved" label), the
// vendor is added to data/added.json and shows on the map in the section picked. The result is written to
// comment.md for the workflow to post on the issue, and "added=true|false" to $GITHUB_OUTPUT.
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { LIVE_LAYERS, UA, censusGeocode, checkSite, clean, formatPhone, formatZip } from "./lib.mjs";

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = event.issue;
const owner = (process.env.REPO_OWNER || "").toLowerCase();
const approved = issue.user.login.toLowerCase() === owner || issue.labels.some((l) => l.name === "approved");

// Issue forms come back as "### Label\n\nvalue" blocks; "_No response_" means the field was left empty.
const fields = {};
for (const part of String(issue.body || "").split(/^### /m).slice(1)) {
  const nl = part.indexOf("\n");
  const label = part.slice(0, nl).trim(), value = part.slice(nl + 1).trim();
  fields[label] = value === "_No response_" ? "" : value;
}
const f = (label) => clean(fields[label]) || "";
const SECTIONS = { "Repair shops & fuel": "shops", Towing: "towing", "Other Vendors": "other" };
const req = {
  name: f("Business name"),
  section: SECTIONS[f("Section")] || "",
  services: [...new Set(String(fields.Services || "").split(/[,\n]/).map((x) => clean(x.replace(/^- \[[xX ]\]\s*/, ""))).filter(Boolean))].slice(0, 8),
  address: f("Street address"), city: f("City"), state: f("State (2 letters)").toUpperCase(), zip: formatZip(f("ZIP code")),
  phone: formatPhone(f("Phone number")), website: f("Website").replace(/^(?!https?:\/\/)(?=\S)/i, "https://"), hours: f("Hours"), notes: f("Notes"),
};

const lines = [], problems = [];
const say = (ok, text) => lines.push(`${ok ? "✅" : "❌"} ${text}`);
if (!req.name) problems.push("The business name is missing.");
if (!req.section) problems.push("Pick a section: Repair shops & fuel, Towing or Other Vendors.");
if (!req.address || !req.city || !/^[A-Z]{2}$/.test(req.state)) problems.push("The street address, city and 2-letter state are all needed.");
if (!/^\(\d{3}\) \d{3}-\d{4}$/.test(req.phone || "")) problems.push("The phone number must be a 10-digit U.S. number.");
if (!req.website) problems.push("The vendor's website is needed to confirm the phone number.");

let store = null;
if (!problems.length) {
  // 1. Phone on the vendor's own website
  const site = await checkSite(req.website, req.phone);
  if (typeof site === "string") { say(false, `Website check: ${site} (${req.website}).`); problems.push("The phone number could not be confirmed on the vendor's website."); }
  else say(true, `Phone ${req.phone} found on ${site.url}`);

  // 2. Address on the map
  const geo = await censusGeocode([{ id: "x", street: req.address, city: req.city, state: req.state, zip: req.zip }]);
  let point = geo.get("x"), how = "U.S. Census geocoder";
  if (!point) {
    const q = new URLSearchParams({ street: req.address, city: req.city, state: req.state, postalcode: req.zip || "", countrycodes: "us", format: "jsonv2", limit: "1" });
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?" + q, { headers: { "User-Agent": UA } });
      const [hit] = r.ok ? await r.json() : [];
      if (hit) { point = [Number(hit.lat), Number(hit.lon)]; how = "OpenStreetMap geocoder"; }
    } catch {}
  }
  if (point) say(true, `Address found by the ${how}: ${req.address}, ${req.city}, ${req.state} ${req.zip || ""}`.trim());
  else { say(false, `Address not found: ${req.address}, ${req.city}, ${req.state}`); problems.push("The street address could not be found. Check the spelling and ZIP code."); }

  // 3. Not already on the map
  if (point) {
    const digits = req.phone.replace(/\D/g, "");
    let dupe = null;
    for (const k of [...LIVE_LAYERS, "towing", "truckshops", "added"]) {
      let d;
      try { d = JSON.parse(await readFile(`data/${k}.json`, "utf8")); } catch { continue; }
      for (const s of d.stores || []) {
        const ph = [s.phone, s.servicePhone].map((p) => String(p || "").replace(/\D/g, "").slice(-10));
        if (ph.includes(digits) && Math.abs(s.lat - point[0]) < 0.015 && Math.abs(s.lon - point[1]) < 0.02) { dupe = s.name; break; }
      }
      if (dupe) break;
    }
    if (dupe) { say(false, `Already on the map as "${dupe}" (same phone, same place).`); problems.push("This vendor is already on the map."); }
    else say(true, "Not already on the map.");
  }

  if (!problems.length) {
    store = { id: `req-${issue.number}`, name: req.name, section: req.section, services: req.services, address: req.address, city: req.city,
      state: req.state, zip: req.zip, phone: req.phone, website: req.website, hours: req.hours || null, lat: +point[0].toFixed(6), lon: +point[1].toFixed(6),
      verified: new Date().toISOString().slice(0, 10), verifiedUrl: site.url, request: issue.html_url };
  }
}

let added = false;
if (store && approved) {
  let data = { source: "Vendor requests checked online", stores: [] };
  try { data = JSON.parse(await readFile("data/added.json", "utf8")); } catch {}
  data.stores = data.stores.filter((s) => s.id !== store.id).concat(store);
  data.fetched_at = new Date().toISOString(); data.count = data.stores.length;
  await writeFile("data/added.json", JSON.stringify(data) + "\n");
  added = true;
}

const label = { shops: "Repair shops & fuel", towing: "Towing", other: "Other Vendors" }[req.section] || "?";
const out = [
  `**${req.name || "Vendor"}** → ${label}`, "",
  ...lines, "",
  added ? "**Added to the map.** It shows up within a few minutes (reload the page)."
    : store ? "Every check passed. **Waiting for the map owner** to add the `approved` label before the pin goes up."
    : `**Not added.** ${problems.join(" ")}\n\nEdit this issue to fix it and the checks run again.`,
];
await writeFile("comment.md", out.join("\n") + "\n");
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `added=${added}\n`);
console.log(out.join("\n"));
