// Handles an "Add a vendor" request (a GitHub issue made from .github/ISSUE_TEMPLATE/add-vendor.yml, usually opened
// from the map's "Add a vendor" button). The person asking gives the name, section, address and phone; Claude finds
// the rest. A request goes through two rounds:
//   1. When it is opened: the street address must be found by the U.S. Census geocoder (or OpenStreetMap's), and the
//      vendor must not already be on the map (same phone within about a mile). If both pass, the request gets the
//      "needs-research" label.
//   2. Claude looks the business up online, finds its own website and store hours, adds them to the request as
//      "### Website", "### Hours" and "### Hours source", and labels it "checked-by-claude". This script then fetches
//      that website itself and the phone number must be on it.
// The vendor goes into data/added.json only when every check passes and the request comes from the repository owner
// (or carries the "approved" label). The result is written to comment.md for the workflow to post on the issue, the
// labels to set to labels.txt, and "added=true|false" to $GITHUB_OUTPUT.
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { LIVE_LAYERS, UA, censusGeocode, checkSite, clean, formatPhone, formatZip } from "./lib.mjs";

const out = async (added) => process.env.GITHUB_OUTPUT && appendFile(process.env.GITHUB_OUTPUT, `added=${added}\n`);
// Several events can arrive at once (Claude edits the request and labels it), so read the request as it is now.
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
let issue = event.issue;
if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
  const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues/${issue.number}`,
    { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": UA } });
  if (r.ok) issue = await r.json();
}
if (issue.state !== "open") { console.log("Request already closed."); await out(false); process.exit(0); }
const labels = new Set(issue.labels.map((l) => l.name));
const owner = (process.env.REPO_OWNER || "").toLowerCase();
// Requests sent from the map's form (no GitHub account) are opened by Claude under the owner's account and carry the
// "from-website" label, so they still wait for the owner's "approved" label.
const approved = labels.has("approved") || (issue.user.login.toLowerCase() === owner && !labels.has("from-website"));
const researched = labels.has("checked-by-claude");

// Issue forms come back as "### Label\n\nvalue" blocks; "_No response_" means the field was left empty.
const fields = {};
for (const part of String(issue.body || "").split(/^### /m).slice(1)) {
  const nl = part.indexOf("\n");
  const label = part.slice(0, nl).trim(), value = part.slice(nl + 1).trim();
  fields[label] = value === "_No response_" ? "" : value;
}
const f = (label) => clean(fields[label]) || "";
// Requested vendors join the Towing or Other Vendors section; an older "Repair shops & fuel" pick goes to Other Vendors.
const SECTIONS = { "Repair shops & fuel": "other", Towing: "towing", "Other Vendors": "other" };
const req = {
  name: f("Business name"),
  section: SECTIONS[f("Section")] || "",
  services: [...new Set(String(fields.Services || "").split(/[,\n]/).map((x) => clean(x.replace(/^- \[[xX ]\]\s*/, ""))).filter(Boolean))].slice(0, 8),
  address: f("Street address"), city: f("City"), state: f("State (2 letters)").toUpperCase(), zip: formatZip(f("ZIP code")),
  phone: formatPhone(f("Phone number")),
  // Filled in by Claude, never by the person asking.
  website: researched ? f("Website").replace(/^(?!https?:\/\/)(?=\S)/i, "https://") : "",
  hours: researched ? f("Hours") : "", hoursSource: researched ? f("Hours source") : "",
};

const lines = [], problems = [];
const say = (ok, text) => lines.push(`${ok ? "✅" : "❌"} ${text}`);
if (!req.name) problems.push("The business name is missing.");
if (!req.section) problems.push("Pick a section: Towing or Other Vendors.");
if (!req.address || !req.city || !/^[A-Z]{2}$/.test(req.state)) problems.push("The street address, city and 2-letter state are all needed.");
if (!/^\(\d{3}\) \d{3}-\d{4}$/.test(req.phone || "")) problems.push("The phone number must be a 10-digit U.S. number.");

let point = null, site = null;
if (!problems.length) {
  // Address on the map
  const geo = await censusGeocode([{ id: "x", street: req.address, city: req.city, state: req.state, zip: req.zip }]);
  let how = "U.S. Census geocoder";
  point = geo.get("x");
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

  // Not already on the map
  if (point) {
    const digits = req.phone.replace(/\D/g, "");
    let dupe = null;
    for (const k of [...LIVE_LAYERS, "towing", "truckshops", "added"]) {
      let d;
      try { d = JSON.parse(await readFile(`data/${k}.json`, "utf8")); } catch { continue; }
      for (const s of d.stores || []) {
        if (s.id === `req-${issue.number}`) continue;
        const ph = [s.phone, s.servicePhone].map((p) => String(p || "").replace(/\D/g, "").slice(-10));
        if (ph.includes(digits) && Math.abs(s.lat - point[0]) < 0.015 && Math.abs(s.lon - point[1]) < 0.02) { dupe = s.name; break; }
      }
      if (dupe) break;
    }
    if (dupe) { say(false, `Already on the map as "${dupe}" (same phone, same place).`); problems.push("This vendor is already on the map."); }
    else say(true, "Not already on the map.");
  }

  // Phone on the website Claude found
  if (!problems.length && researched) {
    site = req.website ? await checkSite(req.website, req.phone) : "Claude did not find a website";
    if (typeof site === "string") { say(false, `Website check: ${site}${req.website ? ` (${req.website})` : ""}.`); problems.push("The phone number could not be confirmed on the vendor's own website."); }
    else say(true, `Phone ${req.phone} found on the vendor's website: ${site.url}`);
    if (req.hours) say(true, `Hours: ${req.hours}${req.hoursSource ? ` (from ${req.hoursSource})` : ""}`);
  }
}

let added = false, store = null, setLabels = [];
if (!problems.length && researched) {
  store = { id: `req-${issue.number}`, name: req.name, section: req.section, services: req.services, address: req.address, city: req.city,
    state: req.state, zip: req.zip, phone: req.phone, website: req.website, hours: req.hours || null, hoursSource: req.hoursSource || null,
    lat: +point[0].toFixed(6), lon: +point[1].toFixed(6), verified: new Date().toISOString().slice(0, 10), verifiedUrl: site.url, request: issue.html_url };
  if (approved) {
    let data = { source: "Vendor requests checked online", stores: [] };
    try { data = JSON.parse(await readFile("data/added.json", "utf8")); } catch {}
    data.stores = data.stores.filter((s) => s.id !== store.id).concat(store);
    data.fetched_at = new Date().toISOString(); data.count = data.stores.length;
    await writeFile("data/added.json", JSON.stringify(data) + "\n");
    added = true;
  }
} else if (!problems.length) setLabels = ["needs-research"];

const label = { towing: "Towing", other: "Other Vendors" }[req.section] || "?";
const text = [
  `**${req.name || "Vendor"}** → ${label}`, "",
  ...lines, "",
  added ? "**Added to the map.** It shows up within a few minutes (reload the page)."
    : store ? "Every check passed. **Waiting for the map owner** to add the `approved` label before the pin goes up."
    : !problems.length ? "**Next:** Claude looks the business up online, finds its own website and store hours, and makes sure the phone number is on that website. Claude checks new requests once a day."
    : `**Not added.** ${problems.join(" ")}${researched ? "" : "\n\nEdit this request to fix it and the checks run again."}`,
].join("\n") + "\n";

// Skip the comment when it would repeat the last one word for word (for example an edit that changed nothing).
let last = "";
if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
  try {
    const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues/${issue.number}/comments?per_page=100`,
      { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": UA } });
    const list = r.ok ? await r.json() : [];
    last = list.filter((c) => c.user?.login === "github-actions[bot]").pop()?.body || "";
  } catch {}
}
if (last.trim() !== text.trim()) await writeFile("comment.md", text);
if (setLabels.length) await writeFile("labels.txt", setLabels.join(",") + "\n");
await out(added);
console.log(text);
