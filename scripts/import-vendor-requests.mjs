// Turns "Add a vendor" requests sent from the map (saved in Supabase by vr_submit, see addvendor/vendor-requests.sql)
// into GitHub requests that Claude checks. Each one becomes an issue in the same "### Label" layout the issue form
// makes, labeled "needs-research" (Claude looks it up next) and "from-website" (the owner still approves it).
// A request already turned into an issue is recognized by the "Website request #<id>" line and skipped.
import { readFile } from "node:fs/promises";

const cfgText = await readFile("postboard/config.js", "utf8");
const url = (/supabaseUrl:\s*"([^"]+)"/.exec(cfgText) || [])[1], key = (/supabaseAnonKey:\s*"([^"]+)"/.exec(cfgText) || [])[1];
if (!url || !key) { console.log("No Supabase project in postboard/config.js; nothing to import."); process.exit(0); }

const r = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/vr_pending", {
  method: "POST", body: "{}",
  headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: "Bearer " + key } : {}), "Content-Type": "application/json" },
});
if (!r.ok) { console.log(`vr_pending answered ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(r.status === 404 ? 0 : 1); }
const pending = await r.json();
console.log(`${pending.length} request(s) waiting in the database`);

const repo = process.env.GITHUB_REPOSITORY, gh = (path, init = {}) => fetch(`https://api.github.com/repos/${repo}${path}`, {
  ...init, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "OpenRoad-ServiceMap", ...(init.headers || {}) },
});
// Every website request already on GitHub, open or closed.
const done = new Set();
for (let page = 1; page < 20; page++) {
  const list = await (await gh(`/issues?labels=from-website&state=all&per_page=100&page=${page}`)).json();
  for (const i of list) { const m = /Website request #(\d+)/.exec(i.body || ""); if (m) done.add(Number(m[1])); }
  if (list.length < 100) break;
}

const block = (label, value) => `### ${label}\n\n${String(value || "").trim() || "_No response_"}\n`;
for (const q of pending) {
  if (done.has(q.id)) continue;
  const phone = `(${q.phone.slice(0, 3)}) ${q.phone.slice(3, 6)}-${q.phone.slice(6)}`;
  const body = [
    `Website request #${q.id}, sent from the map's Add a vendor form on ${q.created_at.slice(0, 10)}.`, "",
    block("Business name", q.name), block("Section", q.section), block("Services", q.services),
    block("Street address", q.address), block("City", q.city), block("State (2 letters)", q.state), block("ZIP code", q.zip),
    block("Phone number", phone), block("Notes", q.notes),
  ].join("\n");
  const res = await gh("/issues", { method: "POST", body: JSON.stringify({ title: `Add vendor: ${q.name}`, body, labels: ["add-vendor", "from-website", "needs-research"] }) });
  console.log(res.ok ? `Opened ${(await res.json()).html_url} for website request #${q.id}` : `Could not open website request #${q.id}: ${res.status}`);
}
