// Turns "Add a vendor" requests sent from the map (saved in Supabase by vr_submit, see addvendor/vendor-requests.sql)
// into GitHub requests that Claude checks. Each one becomes an issue in the same "### Label" layout the issue form
// makes (typed text can't add a heading of its own, see requestBlock), labeled "needs-research" (Claude looks it
// up next) and "from-website" (the owner still approves it). The row is then marked "sent" with the issue's link, so
// it is not read again (BUG-C11).
// The table is read with the service key (Actions secret SUPABASE_SERVICE_KEY), never the public key, and in pages
// by id until a page comes back empty, so Supabase's cap on rows per answer can't leave requests behind.
// A request already turned into an issue is recognized by the "Website request #<id>" line that starts every issue this
// workflow opens: no second issue is opened,
// and its row is marked "sent" (this repairs a run where the issue was opened but marking the row failed).
import { readFile } from "node:fs/promises";
import { requestBlock as block } from "./lib.mjs";

const cfgText = await readFile("postboard/config.js", "utf8");
const url = (/supabaseUrl:\s*"([^"]+)"/.exec(cfgText) || [])[1];
if (!url) { console.log("No Supabase project in postboard/config.js; nothing to import."); process.exit(0); }
const key = process.env.SUPABASE_SERVICE_KEY;
if (!key) { console.log("::error::SUPABASE_SERVICE_KEY secret is not set. Add it in the repository's Settings > Secrets and variables > Actions."); process.exit(1); }
const PAGE = Number(process.env.IMPORT_PAGE_SIZE) || 500;
const db = (path, init = {}) => fetch(url.replace(/\/$/, "") + "/rest/v1/" + path, {
  ...init, headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: "Bearer " + key } : {}), "Content-Type": "application/json", ...(init.headers || {}) },
});

const repo = process.env.GITHUB_REPOSITORY, gh = (path, init = {}) => fetch(`https://api.github.com/repos/${repo}${path}`, {
  ...init, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "OpenRoad-ServiceMap", ...(init.headers || {}) },
});
// Every website request already on GitHub, open or closed: request id -> issue link. Only issues this workflow opened
// count, by their first line, so another issue that mentions "Website request #5" can't mark request 5 as sent.
const done = new Map();
for (let page = 1; ; page++) {
  const r = await gh(`/issues?labels=from-website&state=all&per_page=100&page=${page}`);
  if (!r.ok) { console.log(`::error::Listing the GitHub requests failed: HTTP ${r.status}`); process.exit(1); }
  const list = await r.json();
  for (const i of list) {
    const m = /^Website request #(\d+), sent from the map/.exec(i.body || "");
    if (m && i.user?.login === "github-actions[bot]" && !done.has(Number(m[1]))) done.set(Number(m[1]), i.html_url);
  }
  if (list.length < 100) break;
}

let last = 0, failed = 0, opened = 0, marked = 0;
for (;;) {
  const r = await db(`vr_requests?select=id,created_at,name,services,address,city,state,zip,phone,notes&status=eq.new&id=gt.${last}&order=id&limit=${PAGE}`);
  if (!r.ok) { console.log(`::error::Reading vr_requests failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1); }
  const rows = await r.json();
  if (!rows.length) break;
  for (const q of rows) {
    let link = done.get(q.id);
    if (!link) {
      const phone = `(${q.phone.slice(0, 3)}) ${q.phone.slice(3, 6)}-${q.phone.slice(6)}`;
      const body = [
        `Website request #${q.id}, sent from the map's Add a vendor form on ${q.created_at.slice(0, 10)}.`, "",
        // Same fields and order as the issue form (the services decide the sections).
        ...[["Business name", q.name], ["Services", String(q.services || "").replace(/\s*\n\s*/g, ", ")], ["Street address", q.address], ["City", q.city],
          ["State (2 letters)", q.state], ["ZIP code", q.zip], ["Phone number", phone]].map(([l, v]) => block(l, v, { oneLine: true })),
        block("Notes", q.notes),
      ].join("\n");
      const res = await gh("/issues", { method: "POST", body: JSON.stringify({ title: `Add vendor: ${q.name}`, body, labels: ["add-vendor", "from-website", "needs-research"] }) });
      if (!res.ok) { console.log(`::error::Could not open website request #${q.id}: HTTP ${res.status}`); failed++; continue; }
      link = (await res.json()).html_url;
      done.set(q.id, link); opened++;
      console.log(`Opened ${link} for website request #${q.id}`);
    }
    // Only a row still "new" is marked; one the owner set to "skipped" in the meantime is left as it is.
    const p = await db(`vr_requests?id=eq.${q.id}&status=eq.new&select=id`, { method: "PATCH", body: JSON.stringify({ status: "sent", issue_url: link }), headers: { Prefer: "return=representation" } });
    if (p.ok && (await p.json()).length) marked++;
    else if (p.ok) console.log(`::warning::Website request #${q.id} was no longer "new" in the database, so it was left as it is (its GitHub request: ${link}).`);
    else { console.log(`::error::Could not mark website request #${q.id} as sent: HTTP ${p.status}`); failed++; }
  }
  last = rows.at(-1).id;
}
console.log(`Opened ${opened} request(s), marked ${marked} as sent, ${failed} failed.`);
if (failed) process.exit(1);
