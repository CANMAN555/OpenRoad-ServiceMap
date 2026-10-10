// Post Board: fleet repair postings shown over the map. Moved here from the private test page.
// Storage and the PIN check live in postboard/store.js; the PIN screen is in postboard/gate.js.
(() => {
const pbRoot = document.getElementById("pb");
const STATUS = {
  omaha: "Needs routing back to Omaha",
  to_shop: "Heading to a shop",
  at_shop: "At shop, work in progress",
};
const ORDER = Object.keys(STATUS);
// "At shop, work in progress" is a checkbox on each posting, so the dropdowns only offer the first two.
const PICK = ["omaha", "to_shop"];

let db = null, user = null, me = null;
let units = [], posts = [], events = [];
let filter = "open";
const openHist = new Set();
const names = {};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const now = () => new Date().toISOString();
const byNum = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
const unit = (id) => units.find((u) => u.id === id);
const fmt = (iso) => iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
function ago(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " hr ago";
  return fmt(iso);
}
const who = (id) => id ? `<span class="who" data-uid="${esc(id)}">${esc(names[id] || "Someone")}</span>` : "";
const pill = (st, resolved) => resolved ? `<span class="pill resolved">Work complete · closed</span>` : `<span class="pill st-${st}">${esc(STATUS[st] || st)}</span>`;

let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 4000); }
async function write(fn, okMsg) {
  if (!db) return toast("Sign in to claude.ai to make changes.");
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) { toast(e?.code === "not_granted" ? "You can view this board but not change it." : "That change did not save: " + (e?.message || e)); }
}
const logEvent = (p, status, text) => db.collection("events").add({ postId: p.id, truckNumber: p.truckNumber || "", status, text, at: now(), by: me });

// Trucks routed back to Omaha go to H&M by default; trucks heading to a shop must say which shop.
const OMAHA_SHOP = "H&M Omaha Truck Shop";
const needsShop = (st) => st === "to_shop";
function setDest(el, v) { el.value = v; el.dataset.lat = el.dataset.lon = el.dataset.brand = ""; }
$("np-status").addEventListener("change", () => {
  const el = $("np-dest");
  if ($("np-status").value === "omaha") setDest(el, OMAHA_SHOP);
  else if (el.value.trim() === OMAHA_SHOP) { setDest(el, ""); el.focus(); }
});
$("np-status").innerHTML = PICK.map((k) => `<option value="${k}">${esc(STATUS[k])}</option>`).join("");
setDest($("np-dest"), OMAHA_SHOP);

/* ---------- render ---------- */
function openPostFor(unitId) {
  // A trailer only carries a truck's open repair while it is still hooked to that truck.
  return posts.filter((p) => !p.resolved && (p.truckId === unitId || (p.trailerId === unitId && unit(unitId)?.truckId === p.truckId)))
    .sort((a, b) => String(b.reportedAt).localeCompare(String(a.reportedAt)))[0];
}
// Sending to on a posting shows just the company name, then "City, ST".
// Shop picks are saved as "Name, street, City, ST"; Love's names also carry the city and stop type, which are dropped here.
function destParts(p) {
  const d = (p.destination || "").trim();
  const m = d.match(/^(.*?)(?:, ([^,]+))?, ([^,]+), ([A-Z]{2})$/);
  if (!m) return { name: d, place: "" };
  let [, name, , city, st] = m;
  if (!name) return { name: d, place: "" };
  name = name.replace(/\s*\((Travel Stop|Country Store|Truck Service|Car Stop|Service Center)\)$/, "");
  if (name.toLowerCase().endsWith(" " + city.toLowerCase())) name = name.slice(0, -city.length - 1);
  return { name, place: `${city}, ${st}` };
}
function destView(p) {
  const { name, place } = destParts(p);
  const body = name || place ? `${name ? `<span class="dn">${esc(name)}</span>` : ""}${place ? `<span class="${name ? "dp" : "dn"}">${esc(place)}</span>` : ""}` : `<span class="none">Sending to: not set</span>`;
  return `<button type="button" class="dest-view" data-act="destedit" data-id="${p.id}" title="${esc(p.destination || "")}" aria-label="Sending to ${esc(p.destination || "not set")}, click to change" ${p.resolved ? "disabled" : ""}>${body}</button>`;
}
function editDest(id) {
  const el = $("dest-" + id); if (!el) return null;
  const v = document.querySelector(`.dest-view[data-id="${id}"]`); if (v) v.hidden = true;
  el.hidden = false; el.focus(); return el;
}
// Posts made before the Truck / Trailer / Both choice only have "complaint".
function complaintHtml(p) {
  if (!p.complaintFor) return `<div class="complaint">${esc(p.complaint)}</div>`;
  const rows = [];
  if (p.truckComplaint) rows.push(`<div class="complaint"><b>Truck complaint:</b> ${esc(p.truckComplaint)}</div>`);
  if (p.trailerComplaint) rows.push(`<div class="complaint"><b>Trailer complaint:</b> ${esc(p.trailerComplaint)}</div>`);
  // Work order numbers often come after the post, so they stay editable on the posting until it is closed.
  const wo = (which, label) => `<label>${label} <input type="text" id="wo-${which}-${p.id}" data-act="wo" data-which="${which}" data-id="${p.id}" value="${esc(p[which + "WO"] || "")}" data-saved="${esc(p[which + "WO"] || "")}" placeholder="none yet" maxlength="40" ${p.resolved ? "disabled" : ""}></label>`;
  const wos = [p.complaintFor !== "trailer" ? wo("truck", "Truck WO #") : "", p.complaintFor !== "truck" ? wo("trailer", "Trailer WO #") : ""].filter(Boolean);
  rows.push(`<div class="wo-row">${wos.join("")}</div>`);
  return rows.join("");
}
function historyFor(unitId) {
  const list = posts.filter((p) => p.truckId === unitId || p.trailerId === unitId);
  if (!list.length) return `<div class="sub">No complaints on record.</div>`;
  return `<ul class="hist">${list.map((p) => `<li><span class="when">${esc(fmt(p.reportedAt))}</span> ${esc(p.complaint)} ${p.resolved ? "· work complete, closed" : "· " + esc(STATUS[p.status] || "")}${p.trailerNumber && p.truckId === unitId ? ` · trailer ${esc(p.trailerNumber)}` : ""}${p.truckNumber && p.trailerId === unitId ? ` · truck ${esc(p.truckNumber)}` : ""}</li>`).join("")}</ul>`;
}
function renderFleet() {
  const trucks = units.filter((u) => u.kind === "truck").sort(byNum);
  const trailers = units.filter((u) => u.kind === "trailer").sort(byNum);
  $("fleet-count").textContent = `${trucks.length} truck${trucks.length === 1 ? "" : "s"} · ${trailers.length} trailer${trailers.length === 1 ? "" : "s"}`;
  const free = trailers.filter((t) => !t.truckId || !unit(t.truckId));
  const unitRow = (u) => {
    const open = openPostFor(u.id);
    const n = posts.filter((p) => p.truckId === u.id || p.trailerId === u.id).length;
    let hook = "";
    if (u.kind === "truck") {
      const tr = u.trailerId && unit(u.trailerId);
      hook = tr
        ? `<div class="hook">Pulling trailer <span class="num">${esc(tr.number)}</span></div>`
        : "";
    } else {
      const tk = u.truckId && unit(u.truckId);
      hook = `<div class="sub">${tk ? `Connected to truck <span class="num">${esc(tk.number)}</span>` : "Not connected to a truck"}</div>`;
    }
    return `<li class="unit">
      <div class="head"><span class="kind">${u.kind}</span><span class="num">${esc(u.number)}</span>${u.demo ? `<span class="demo">DEMO</span>` : ""}${open ? pill(open.status) : ""}
        <span style="margin-left:auto;display:flex;gap:6px">
          <button class="btn ghost" data-act="uhist" data-id="${u.id}" aria-expanded="${openHist.has(u.id)}">History (${n})</button>
          <button class="btn ghost danger" data-act="remove" data-id="${u.id}">Delete</button>
        </span></div>
      ${hook}
      ${openHist.has(u.id) ? historyFor(u.id) : ""}
    </li>`;
  };
  $("trucks").innerHTML = trucks.length ? trucks.map(unitRow).join("") : `<li class="empty">Click Add unit to add your first truck. Its trailer, open repairs and complaint history show here.</li>`;
  $("trailers").innerHTML = trailers.length ? trailers.map(unitRow).join("") : `<li class="empty">Click Add unit to add trailers, then hook one to a truck.</li>`;

  const sel = $("np-truck"), keep = sel.value;
  sel.innerHTML = `<option value="">Choose a truck</option>` + trucks.map((t) => `<option value="${t.id}">Truck ${esc(t.number)}</option>`).join("");
  if (trucks.some((t) => t.id === keep)) sel.value = keep;
  showTrailer();
}
// The form's trailer choice is held here until the posting is made; posting it is what links truck and trailer in Fleet.
// undefined = use the truck's current trailer, null = no trailer, otherwise a trailer id.
let npTrailer, npTrailerNum = "";
function formTrailer(t) {
  if (!t) return null;
  if (npTrailer === undefined) return (t.trailerId && unit(t.trailerId)) || null;
  if (npTrailer === null) return null;
  return unit(npTrailer) || { id: npTrailer, number: npTrailerNum, truckId: null };
}
function showTrailer() {
  const t = unit($("np-truck").value), tr = formTrailer(t);
  $("np-trailer").textContent = tr ? "Trailer " + tr.number : "None";
  $("np-link").textContent = tr ? "Change trailer" : "Link trailer";
  const b = $("np-truck-btn"); b.textContent = t ? "Truck " + t.number : "Choose a truck"; b.classList.toggle("empty", !t);
  if (pk && !document.contains(pk.anchor)) {
    // The fleet list re-drew under an open picker: re-attach it to the new button, or close it.
    const again = pk.anchor.dataset.id && document.querySelector(`[data-act="hookpick"][data-id="${pk.anchor.dataset.id}"]`);
    if (again) { pk.anchor = again; again.setAttribute("aria-expanded", "true"); pkPlace(); } else { pop.hidden = true; pk = null; }
  }
  if (pk) pkRender();
}
// Hook a trailer to a truck (or none), taking it off any other truck first and logging the change.
async function linkTrailer(t, tr) {
  const old = t.trailerId && unit(t.trailerId);
  if (old && (!tr || old.id !== tr.id)) {
    await db.doc("units/" + old.id).update({ truckId: null });
    await db.collection("links").add({ truckId: t.id, truckNumber: t.number, trailerId: old.id, trailerNumber: old.number, action: "dropped", at: now(), by: me });
  }
  if (tr) {
    const prev = tr.truckId && tr.truckId !== t.id && unit(tr.truckId);
    if (prev) {
      await db.doc("units/" + prev.id).update({ trailerId: null });
      await db.collection("links").add({ truckId: prev.id, truckNumber: prev.number, trailerId: tr.id, trailerNumber: tr.number, action: "dropped", at: now(), by: me });
    }
    await db.doc("units/" + tr.id).update({ truckId: t.id });
    await db.collection("links").add({ truckId: t.id, truckNumber: t.number, trailerId: tr.id, trailerNumber: tr.number, action: "hooked", at: now(), by: me });
  }
  await db.doc("units/" + t.id).update({ trailerId: tr ? tr.id : null });
}
/* ---------- searchable picker (Truck unit # and Link trailer) ---------- */
const pop = document.createElement("div");
pop.className = "pick-pop"; pop.hidden = true;
pop.innerHTML = `<input type="text" id="pick-search" autocomplete="off" role="combobox" aria-controls="pick-list" aria-expanded="true" aria-autocomplete="list"><ul class="pick-list" id="pick-list" role="listbox"></ul>`;
pbRoot.appendChild(pop);
const pkSearch = pop.querySelector("input"), pkList = pop.querySelector("ul");
let pk = null, pkItems = [], pkActive = -1;
function pkPlace() {
  const r = pk.anchor.getBoundingClientRect(), w = Math.min(Math.max(r.width, 260), innerWidth - 32);
  const below = innerHeight - r.bottom - 12, above = r.top - 12, up = below < 260 && above > below;
  pop.style.width = w + "px"; pop.style.left = Math.min(Math.max(16, r.left), innerWidth - w - 16) + "px";
  if (up) { pop.style.top = "auto"; pop.style.bottom = innerHeight - r.top + 4 + "px"; } else { pop.style.bottom = "auto"; pop.style.top = r.bottom + 4 + "px"; }
  pkList.style.maxHeight = Math.max(120, Math.min(360, (up ? above : below) - 50)) + "px";
}
function pkHighlight() {
  pkList.querySelectorAll("li[data-i]").forEach((li) => li.setAttribute("aria-selected", +li.dataset.i === pkActive ? "true" : "false"));
  if (pkActive >= 0) { pkSearch.setAttribute("aria-activedescendant", "pick-" + pkActive); document.getElementById("pick-" + pkActive)?.scrollIntoView({ block: "nearest" }); }
}
function pkRender() {
  if (!pk) return;
  pkItems = pk.items(norm(pkSearch.value), pkSearch.value.trim());
  const sel = pkItems.findIndex((it) => it.selected);
  pkActive = pkSearch.value.trim() ? (pkItems.length ? 0 : -1) : Math.max(sel, pkItems.length ? 0 : -1);
  pkList.innerHTML = pkItems.map((it, i) => `<li role="option" id="pick-${i}" data-i="${i}" aria-selected="false"><span class="ck">${it.selected ? "✓" : ""}</span><span class="t">${esc(it.label)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ""}</li>`).join("")
    || `<li class="empty-row">${esc(pk.empty)}</li>`;
  pkHighlight();
}
function pkOpen(cfg) {
  if (pk) pkClose();
  pk = cfg; pkSearch.value = ""; pkSearch.placeholder = cfg.placeholder; pkSearch.setAttribute("aria-label", cfg.placeholder);
  pop.hidden = false; cfg.anchor.setAttribute("aria-expanded", "true");
  pkPlace(); pkRender(); pkSearch.focus();
}
function pkClose(focusBack) {
  if (!pk) return;
  const a = pk.anchor; pk = null; pop.hidden = true; a.setAttribute("aria-expanded", "false");
  if (focusBack) a.focus();
}
function pkPick(i) { const it = pkItems[i]; if (!it || !pk) return; const cfg = pk; pkClose(true); cfg.onPick(it); }
pkSearch.addEventListener("input", pkRender);
pkSearch.addEventListener("keydown", (e) => {
  const n = pkItems.length;
  if (e.key === "ArrowDown" && n) { e.preventDefault(); pkActive = (pkActive + 1) % n; pkHighlight(); }
  else if (e.key === "ArrowUp" && n) { e.preventDefault(); pkActive = (pkActive - 1 + n) % n; pkHighlight(); }
  else if (e.key === "Enter") { e.preventDefault(); if (pkActive >= 0) pkPick(pkActive); }
  else if (e.key === "Escape") { e.preventDefault(); pkClose(true); }
  else if (e.key === "Tab") pkClose();
});
pkList.addEventListener("pointerdown", (e) => { e.preventDefault(); const li = e.target.closest("li[data-i]"); if (li) pkPick(+li.dataset.i); });
document.addEventListener("pointerdown", (e) => { if (pk && !pop.contains(e.target) && !pk.anchor.contains(e.target)) pkClose(); });
addEventListener("resize", () => pk && pkPlace());
addEventListener("scroll", (e) => { if (pk && !pop.contains(e.target)) pkPlace(); }, true);

// Truck unit #: search the fleet's trucks.
$("np-truck-btn").addEventListener("click", () => {
  if (pk && pk.anchor === $("np-truck-btn")) return pkClose(true);
  pkOpen({
    anchor: $("np-truck-btn"), placeholder: "Search truck #", empty: units.some((u) => u.kind === "truck") ? "No truck matches that number." : "No trucks yet. Add one in Fleet.",
    items: (q) => units.filter((u) => u.kind === "truck" && (!q || norm(u.number).includes(q))).sort(byNum).map((x) => {
      const tr = x.trailerId && unit(x.trailerId), open = openPostFor(x.id);
      return { id: x.id, label: "Truck " + x.number, selected: x.id === $("np-truck").value, sub: [tr ? "Trailer " + tr.number : "", open ? STATUS[open.status] : ""].filter(Boolean).join(" · ") };
    }),
    onPick: (it) => { $("np-truck").value = it.id; $("np-truck").dispatchEvent(new Event("change")); },
  });
});

// Link trailer: search the fleet's trailers; picking one hooks it to the chosen truck.
$("np-link").addEventListener("click", () => {
  const t = unit($("np-truck").value);
  if (!t) { toast("Pick the truck unit # first, then link its trailer."); $("np-truck-btn").focus(); return; }
  if (pk && pk.anchor === $("np-link")) return pkClose(true);
  pkOpen(trailerPicker($("np-link"), () => unit($("np-truck").value), true));
});
function trailerPicker(anchor, getTruck, forForm) {
  const current = (t) => forForm ? formTrailer(t) : (t.trailerId && unit(t.trailerId)) || null;
  return {
    anchor, placeholder: "Search trailer #", empty: "No trailers yet. Type a trailer number to add one.",
    items: (q, raw) => {
      const t = getTruck(); if (!t) return [];
      const list = units.filter((u) => u.kind === "trailer" && (!q || norm(u.number).includes(q))).sort(byNum).map((x) => {
        const on = x.truckId && unit(x.truckId);
        return { x, label: "Trailer " + x.number, selected: x.id === current(t)?.id, sub: on ? (on.id === t.id ? "connected to this truck" : `connected to truck ${on.number}, posting moves it here`) : "not connected to a truck" };
      });
      if (!q) list.unshift({ none: true, label: "No trailer", selected: !current(t) });
      if (q && !list.length) list.push({ add: raw, label: `Add trailer ${raw} and link it`, sub: "adds it to the fleet" });
      return list;
    },
    onPick: (it) => {
      const t = getTruck(); if (!t) return;
      if (forForm) {
        if (it.add) return write(async () => {
          const ref = await db.collection("units").add({ kind: "trailer", number: it.add, trailerId: null, truckId: null, createdAt: now(), createdBy: me });
          npTrailer = ref.id; npTrailerNum = it.add; showTrailer();
        }, `Added trailer ${it.add}. It connects to truck ${t.number} when you post.`);
        npTrailer = it.x ? it.x.id : null; npTrailerNum = it.x ? it.x.number : ""; showTrailer();
        return;
      }
      if (it.add) return write(async () => {
        const ref = await db.collection("units").add({ kind: "trailer", number: it.add, trailerId: null, truckId: null, createdAt: now(), createdBy: me });
        await linkTrailer(t, { id: ref.id, number: it.add, truckId: null });
      }, `Added trailer ${it.add} and linked it to truck ${t.number}.`);
      const tr = it.x || null;
      if ((t.trailerId || null) === (tr ? tr.id : null)) return;
      write(() => linkTrailer(t, tr), tr ? `Truck ${t.number} is pulling trailer ${tr.number}.` : `Truck ${t.number} has no trailer now.`);
    },
  };
}
function renderCounts() {
  const open = posts.filter((p) => !p.resolved);
  const chips = [["open", "All open", open.length], ...ORDER.map((k) => [k, STATUS[k], open.filter((p) => p.status === k).length]), ["resolved", "Closed (work complete)", posts.length - open.length]];
  $("counts").innerHTML = chips.map(([k, label, n]) => `<button type="button" class="count" data-filter="${k}" aria-pressed="${filter === k}">${ORDER.includes(k) ? `<span class="pill st-${k}" style="border:0;padding:0"></span>` : ""}${esc(label)} <b>${n}</b></button>`).join("");
}
let postsDirty = false;
function renderPosts() {
  const a = document.activeElement;
  if (a && a.matches("#posts input[type=text]")) { postsDirty = true; return; }
  postsDirty = false;
  const list = posts.filter((p) => filter === "open" ? !p.resolved : filter === "resolved" ? p.resolved : !p.resolved && p.status === filter);
  $("posts-count").textContent = `${list.length} shown`;
  if (!list.length) {
    $("posts").innerHTML = `<li class="empty">${posts.length ? "Nothing here for this filter." : "No repair posts yet. Click Create posting to add the first one."}</li>`;
    return;
  }
  $("posts").innerHTML = list.map((p) => {
    const hist = events.filter((e) => e.postId === p.id);
    return `<li class="post ${p.resolved ? "is-resolved" : "st-" + p.status}">
      <button type="button" class="post-x" data-act="pdel" data-id="${p.id}" aria-label="Delete posting for truck ${esc(p.truckNumber)}" title="Delete posting">&times;</button>
      <div class="head"><span class="kind">Truck</span><span class="num">${esc(p.truckNumber)}</span>
        ${p.trailerNumber ? `<span class="kind">Trailer</span><span class="num">${esc(p.trailerNumber)}</span>` : ""}
        ${pill(p.status, p.resolved)}</div>
      ${complaintHtml(p)}
      <div class="meta"><span>Reported ${esc(fmt(p.reportedAt))} ${p.reportedBy ? "by " + who(p.reportedBy) : ""}</span>${p.updatedAt && p.updatedAt !== p.reportedAt ? `<span>Updated ${esc(ago(p.updatedAt))} ${p.updatedBy ? "by " + who(p.updatedBy) : ""}</span>` : ""}</div>
      <div class="controls">
        <select aria-label="Status for truck ${esc(p.truckNumber)}" id="st-${p.id}" data-act="status" data-id="${p.id}" ${p.resolved || p.status === "at_shop" ? "disabled" : ""}>${PICK.map((k) => `<option value="${k}" ${k === (p.status === "at_shop" ? p.prevStatus || "to_shop" : p.status) ? "selected" : ""}>${esc(STATUS[k])}</option>`).join("")}</select>
        <span class="dest-cell">${destView(p)}<input type="text" hidden id="dest-${p.id}" ${p.resolved ? "disabled" : ""} class="dest" data-act="dest" data-id="${p.id}" value="${esc(p.destination)}" data-lat="${p.destLat ?? ""}" data-lon="${p.destLon ?? ""}" data-saved="${esc(p.destination)}" placeholder="Sending to" aria-label="Sending to" maxlength="200"></span>
        ${p.destLat != null ? `<a class="btn ghost" href="https://www.google.com/maps/dir/?api=1&destination=${p.destLat},${p.destLon}" target="_blank" rel="noopener">Directions</a>` : ""}
        <label class="chk"><input type="checkbox" id="shop-${p.id}" data-act="atshop" data-id="${p.id}" ${p.status === "at_shop" ? "checked" : ""} ${p.resolved ? "disabled" : ""}> At shop, work in progress</label>
        <label class="chk ${p.resolved ? "done" : ""}"><input type="checkbox" id="res-${p.id}" data-act="resolve" data-id="${p.id}" ${p.resolved ? "checked" : ""}> ${p.resolved ? "Work complete (uncheck to reopen)" : "Work complete"}</label>
        <button class="btn ghost" data-act="phist" data-id="${p.id}" aria-expanded="${openHist.has(p.id)}">Updates (${hist.length})</button>
      </div>
      ${openHist.has(p.id) ? `<ul class="hist">${hist.map((e) => `<li><span class="when">${esc(fmt(e.at))}</span> ${esc(e.text)} ${e.by ? "· " + who(e.by) : ""}</li>`).join("") || "<li>No updates yet.</li>"}</ul>` : ""}
    </li>`;
  }).join("");
}
// decoding: event id -> when its row arrived. The ticker is rebuilt on every snapshot (a single posting fires several),
// so rows still inside their 4-second arrival carry on from where they were instead of being cut off.
let shownIds = [], tickTimer;
const decoding = new Map(), DECODE_MS = 4000;
const tickRow = (e, cls, age = 0) => `<div class="tick ${/closed|Work complete/.test(e.text || "") ? "done" : "st-" + esc(e.status)} ${cls}" data-id="${esc(e.id)}"${age ? ` style="animation-delay:-${Math.round(age)}ms"` : ""}><span class="dot"></span><span class="tunit">TRUCK ${esc(e.truckNumber)}</span><span class="txt">${esc(e.text)}</span><span class="when">${esc(ago(e.at))}${e.by ? " · " + who(e.by) : ""}</span></div>`;
function renderLatest() {
  const top = events.slice(0, 5), ids = top.map((e) => e.id), box = $("ticker");
  if (!top.length) { box.innerHTML = `<div class="tick-empty">No repair updates yet. Every new posting and change shows up here for everyone.</div>`; shownIds = []; return; }
  const fresh = shownIds.length ? ids.filter((id) => !shownIds.includes(id)) : [];
  const leaving = shownIds.length ? shownIds.filter((id) => !ids.includes(id)).map((id) => events.find((e) => e.id === id)).filter(Boolean) : [];
  const t0 = performance.now();
  fresh.forEach((id) => decoding.set(id, t0));
  for (const [id, at] of decoding) if (t0 - at >= DECODE_MS || !ids.includes(id)) decoding.delete(id);
  box.innerHTML = top.map((e) => (decoding.has(e.id) ? tickRow(e, "new", t0 - decoding.get(e.id)) : tickRow(e, ""))).join("") + leaving.map((e) => tickRow(e, "leaving")).join("");
  box.classList.remove("push"); if (fresh.length) { void box.offsetWidth; box.classList.add("push"); }
  shownIds = ids;
  clearTimeout(tickTimer);
  if (leaving.length) tickTimer = setTimeout(() => { box.querySelectorAll(".tick.leaving").forEach((r) => r.remove()); }, 550);
  box.querySelectorAll(".tick.new").forEach((row) => row.querySelectorAll(".tunit, .txt").forEach((el) => decode(el, decoding.get(row.dataset.id))));
}
// Easter egg: a new row arrives as scrambled code and decodes, left to right, into plain English.
const GLYPHS = "01{}[]<>/\\=;:#$&*+_ABCDEFabcdef0x";
function decode(el, start = performance.now()) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const final = el.textContent, dur = DECODE_MS;
  el.classList.add("coding");
  const step = (t) => {
    if (!el.isConnected) return;
    const done = Math.floor(((t - start) / dur) * final.length);
    if (done >= final.length) { el.textContent = final; el.classList.remove("coding"); return; }
    let out = final.slice(0, Math.max(0, done));
    for (let i = Math.max(0, done); i < final.length; i++) out += final[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = out;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
async function fillNames() {
  if (!user) return;
  const ids = [...new Set([...document.querySelectorAll("[data-uid]")].map((n) => n.dataset.uid))];
  if (!ids.length) return;
  const ps = await user.profiles(ids);
  for (const id of ids) names[id] = (ps[id] && ps[id].isMe) ? "you" : (ps[id] && ps[id].name) || "Someone";
  document.querySelectorAll("[data-uid]").forEach((n) => (n.textContent = names[n.dataset.uid]));
}
function render() { renderFleet(); renderCounts(); renderPosts(); renderLatest(); fillNames(); }

/* ---------- actions ---------- */
$("add-unit").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const kind = $("unit-kind").value, number = $("unit-num").value.trim();
  if (!number) return;
  if (units.some((u) => u.kind === kind && String(u.number).toLowerCase() === number.toLowerCase())) return toast(`${kind === "truck" ? "Truck" : "Trailer"} ${number} is already on the board.`);
  write(() => db.collection("units").add({ kind, number, trailerId: null, truckId: null, createdAt: now(), createdBy: me }), `Added ${kind} ${number}.`);
  $("unit-num").value = "";
});
$("np-truck").addEventListener("change", () => { npTrailer = undefined; showTrailer(); });
$("new-post").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const t = unit($("np-truck").value), forWhat = document.querySelector("input[name=np-for]:checked").value;
  const c1 = $("np-complaint").value.trim(), c2 = $("np-complaint2").value.trim();
  const truckComplaint = forWhat === "trailer" ? "" : c1, trailerComplaint = forWhat === "trailer" ? c1 : forWhat === "both" ? c2 : "";
  if (!t) { $("np-truck-btn").focus(); return toast("Pick the truck unit # first."); }
  const tr = formTrailer(t);
  if (forWhat !== "truck" && !tr) { $("np-link").focus(); return toast("Link the trailer on this truck first, then post the trailer complaint."); }
  if (forWhat !== "trailer" && !truckComplaint) { $("np-complaint").focus(); return toast("Write the truck complaint."); }
  if (forWhat !== "truck" && !trailerComplaint) { (forWhat === "both" ? $("np-complaint2") : $("np-complaint")).focus(); return toast("Write the trailer complaint."); }
  const w1 = $("np-wo1").value.trim(), w2 = $("np-wo2").value.trim();
  const truckWO = forWhat === "trailer" ? "" : w1, trailerWO = forWhat === "trailer" ? w1 : forWhat === "both" ? w2 : "";
  const complaint = [truckComplaint && (forWhat === "both" ? "Truck: " + truckComplaint : truckComplaint), trailerComplaint && (forWhat === "truck" ? "" : "Trailer: " + trailerComplaint)].filter(Boolean).join(" / ");
  if (needsShop($("np-status").value) && !$("np-dest").value.trim()) { $("np-dest").focus(); return toast("Fill in Sending to before posting a truck that is heading to a shop."); }
  const status = $("np-status").value, at = now();
  const p = { truckId: t.id, truckNumber: t.number, trailerId: tr ? tr.id : null, trailerNumber: tr ? tr.number : "", complaintFor: forWhat, complaint, truckComplaint, trailerComplaint, truckWO, trailerWO, ...destOf($("np-dest")), status, resolved: false, reportedAt: at, reportedBy: me, updatedAt: at, updatedBy: me };
  write(async () => {
    // Posting updates Fleet: the truck now shows the trailer from its newest posting.
    if ((t.trailerId || null) !== (tr ? tr.id : null)) await linkTrailer(t, tr && unit(tr.id) ? unit(tr.id) : tr);
    const ref = await db.collection("posts").add(p);
    await logEvent({ id: ref.id, ...p }, status, `Reported: ${complaint.slice(0, 80)}${complaint.length > 80 ? "…" : ""} · ${STATUS[status]}${p.destination ? " · sending to " + p.destination : ""}`);
  }, forWhat === "truck" ? `Posted truck ${t.number}.` : forWhat === "trailer" ? `Posted trailer ${tr.number} on truck ${t.number}.` : `Posted truck ${t.number} and trailer ${tr.number}.`);
  npTrailer = undefined;
  $("np-complaint").value = ""; $("np-complaint2").value = ""; $("np-wo1").value = ""; $("np-wo2").value = ""; $("np-status").value = "omaha"; setDest($("np-dest"), OMAHA_SHOP); $("np-dest").dataset.lat = $("np-dest").dataset.lon = "";
  filter = "open";
  showForm(false);
});
// The new-posting form stays hidden until "Create posting" is clicked.
function showForm(on) {
  $("new-post").hidden = !on;
  $("np-open").setAttribute("aria-expanded", on);
  $("np-open").textContent = on ? "Close" : "Create posting";
  $("np-open").classList.toggle("ghost", on); $("np-open").classList.toggle("orange", !on);
  if (on) $("np-truck-btn").focus(); else { if (pk) pkClose(); npTrailer = undefined; showTrailer(); }
}
// Fleet arrow: fold the Fleet box to a thin strip so Repair posts takes the full width; click again to bring it back.
function setFleetMin(min) {
  document.querySelector(".wrap").classList.toggle("fleet-min", min);
  const t = $("fleet-toggle");
  t.setAttribute("aria-expanded", !min);
  t.title = min ? "Show Fleet" : "Hide Fleet and widen Repair posts";
  t.querySelector("span").textContent = min ? "›" : "‹";
  t.querySelector(".sr").textContent = min ? "Show Fleet" : "Hide Fleet";
  if (min && pk) pkClose();
  try { localStorage.setItem("pb-fleet-min", min ? "1" : ""); } catch {}
}
$("fleet-toggle").addEventListener("click", (e) => { e.stopPropagation(); setFleetMin(!document.querySelector(".wrap").classList.contains("fleet-min")); });
$("fleet").addEventListener("click", () => { if (document.querySelector(".wrap").classList.contains("fleet-min")) setFleetMin(false); });
try { if (localStorage.getItem("pb-fleet-min")) setFleetMin(true); } catch {}
// The add-unit boxes stay hidden until "Add unit" is clicked; they stay open for adding several units in a row.
function showUnitForm(on) {
  $("add-unit").hidden = !on;
  $("unit-open").setAttribute("aria-expanded", on);
  $("unit-open").textContent = on ? "Close" : "Add unit";
  $("unit-open").classList.toggle("ghost", on); $("unit-open").classList.toggle("orange", !on);
  if (on) $("unit-num").focus();
}
$("unit-open").addEventListener("click", () => showUnitForm($("add-unit").hidden));
$("np-open").addEventListener("click", () => showForm($("new-post").hidden));
$("np-cancel").addEventListener("click", () => showForm(false));
// Truck / Trailer / Both: relabel the complaint box, and add a second box for Both.
function setComplaintFor() {
  const v = document.querySelector("input[name=np-for]:checked").value;
  $("np-c1-label").textContent = v === "trailer" ? "Trailer complaint" : "Truck complaint";
  $("np-complaint").placeholder = v === "trailer" ? "What the driver reported about the trailer" : "What the driver reported about the truck";
  $("np-c2-wrap").hidden = v !== "both";
  $("np-wo1-label").textContent = v === "trailer" ? "Trailer WO #" : "Truck WO #";
}
document.querySelectorAll("input[name=np-for]").forEach((r) => r.addEventListener("change", setComplaintFor));
$("counts").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-filter]"); if (!b) return;
  filter = b.dataset.filter; renderCounts(); renderPosts(); fillNames();
});

// In-page confirm box (the browser's own confirm() does not work inside this page).
function confirmBox(title, text, okLabel, onOk, returnTo) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="m-title" aria-describedby="m-text">
    <h2 id="m-title"></h2><p id="m-text"></p>
    <div class="modal-actions"><button type="button" class="btn ghost" id="m-cancel">Cancel</button><button type="button" class="btn danger-fill" id="m-ok"></button></div></div>`;
  back.querySelector("#m-title").textContent = title;
  back.querySelector("#m-text").textContent = text;
  back.querySelector("#m-ok").textContent = okLabel;
  pbRoot.appendChild(back);
  const close = () => { back.remove(); document.removeEventListener("keydown", key, true); if (returnTo && document.contains(returnTo)) returnTo.focus(); };
  const key = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { const f = [back.querySelector("#m-cancel"), back.querySelector("#m-ok")], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + 2) % 2].focus(); }
  };
  document.addEventListener("keydown", key, true);
  back.querySelector("#m-cancel").addEventListener("click", close);
  back.querySelector("#m-ok").addEventListener("click", () => { close(); onOk(); });
  back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
  back.querySelector("#m-cancel").focus();
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-act]"); if (!b) return;
  const id = b.dataset.id, u = unit(id);
  switch (b.dataset.act) {
    case "destedit": editDest(id); break;
    case "uhist": case "phist":
      openHist.has(id) ? openHist.delete(id) : openHist.add(id); render(); break;
    case "hookpick":
      if (!u) return;
      if (pk && pk.anchor === b) return pkClose(true);
      pkOpen(trailerPicker(b, () => unit(id)));
      break;
    case "drop": {
      const tr = u && u.trailerId && unit(u.trailerId);
      write(async () => {
        await db.doc("units/" + u.id).update({ trailerId: null });
        if (tr) await db.doc("units/" + tr.id).update({ truckId: null });
        await db.collection("links").add({ truckId: u.id, truckNumber: u.number, trailerId: tr ? tr.id : null, trailerNumber: tr ? tr.number : "", action: "dropped", at: now(), by: me });
      }, `Trailer ${tr ? tr.number : ""} dropped. Its complaint history stays on record.`);
      break;
    }
    case "pdel": {
      const p = posts.find((x) => x.id === id); if (!p) return;
      confirmBox(`Delete the posting for truck ${p.truckNumber}?`, `This removes the posting and its updates from the board for everyone, including the Latest updates ticker. It can't be undone.`, "Delete posting", () => write(async () => {
        for (const e of events.filter((x) => x.postId === id)) await db.doc("events/" + e.id).delete();
        await db.doc("posts/" + id).delete();
      }, `Deleted the posting for truck ${p.truckNumber}.`), b);
      break;
    }
    case "remove": {
      if (!u) return;
      const kind = u.kind === "truck" ? "truck" : "trailer";
      confirmBox(`Delete ${kind} ${u.number}?`, `This takes ${kind} ${u.number} off the fleet list for everyone. Its repair postings and complaint history stay on record.`, `Delete ${kind}`, () => write(async () => {
        const cur = unit(id); if (!cur) return;
        const other = cur.kind === "truck" ? cur.trailerId && unit(cur.trailerId) : cur.truckId && unit(cur.truckId);
        if (other) await db.doc("units/" + other.id).update(cur.kind === "truck" ? { truckId: null } : { trailerId: null });
        await db.doc("units/" + cur.id).delete();
      }, `Deleted ${kind} ${u.number}. Its repair postings are kept.`), b);
      break;
    }
  }
});
document.addEventListener("change", (ev) => {
  const el = ev.target, id = el.dataset && el.dataset.id, p = posts.find((x) => x.id === id);
  if (!p) return;
  if (el.dataset.act === "status" && el.value !== p.status) {
    const st = el.value, destEl = $("dest-" + id);
    const cur = (p.destination || "").trim();
    if (needsShop(st) && (!cur || cur === OMAHA_SHOP)) {
      // No shop yet: clear the box and wait for one; the status saves together with the shop.
      el.value = p.status;
      if (destEl) { setDest(destEl, ""); destEl.dataset.pending = st; editDest(id); }
      return toast("Type the shop in Sending to. The status changes to Heading to a shop once a shop is picked.");
    }
    const d = st === "omaha" ? { destination: OMAHA_SHOP, destLat: null, destLon: null, destBrand: null } : {};
    if (destEl && d.destination) { setDest(destEl, d.destination); destEl.dataset.saved = d.destination; }
    write(async () => {
      await db.doc("posts/" + id).update({ status: st, ...d, updatedAt: now(), updatedBy: me });
      await logEvent(p, st, STATUS[st] + ((d.destination ?? p.destination) ? " · " + (d.destination ?? p.destination) : ""));
    });
  } else if (el.dataset.act === "dest" && el.value.trim() !== (el.dataset.saved || "")) {
    const pending = el.dataset.pending; delete el.dataset.pending;
    if (!el.value.trim() && (pending || (needsShop(p.status) && !p.resolved))) { el.value = el.dataset.saved || ""; return toast(pending ? "No shop entered, so the status stayed the same." : "A truck heading to a shop needs a Sending to shop. Change the status first to clear it."); }
    const d = destOf(el);
    if (pending) {
      el.dataset.saved = d.destination;
      return write(async () => {
        await db.doc("posts/" + id).update({ status: pending, ...d, updatedAt: now(), updatedBy: me });
        await logEvent(p, pending, STATUS[pending] + " · " + d.destination);
      });
    }
    el.dataset.saved = d.destination;
    write(async () => {
      await db.doc("posts/" + id).update({ ...d, updatedAt: now(), updatedBy: me });
      await logEvent(p, p.status, d.destination ? "Sending to " + d.destination : "Shop cleared");
    });
  } else if (el.dataset.act === "wo" && el.value.trim() !== (el.dataset.saved || "")) {
    const which = el.dataset.which, v = el.value.trim(), name = which === "truck" ? "Truck" : "Trailer";
    el.dataset.saved = v;
    write(async () => {
      await db.doc("posts/" + id).update({ [which + "WO"]: v, updatedAt: now(), updatedBy: me });
      await logEvent(p, p.status, v ? `${name} WO # ${v}` : `${name} WO # cleared`);
    });
  } else if (el.dataset.act === "atshop") {
    // Checked: the truck is at the shop. Unchecked: back to the status it had before.
    const st = el.checked ? "at_shop" : PICK.includes(p.prevStatus) ? p.prevStatus : "to_shop";
    write(async () => {
      await db.doc("posts/" + id).update({ status: st, prevStatus: el.checked ? p.status : null, updatedAt: now(), updatedBy: me });
      await logEvent(p, st, el.checked ? STATUS.at_shop + (p.destination ? " · " + p.destination : "") : "Not at the shop anymore · " + STATUS[st]);
    });
  } else if (el.dataset.act === "resolve") {
    const r = el.checked;
    write(async () => {
      await db.doc("posts/" + id).update({ resolved: r, resolvedAt: r ? now() : null, updatedAt: now(), updatedBy: me });
      await logEvent(p, p.status, r ? "Work complete, posting closed" : "Posting reopened");
    });
  }
});
document.addEventListener("focusout", (ev) => {
  if (!ev.target.matches("#posts input[type=text]")) return;
  if (ev.target.matches("input.dest")) postsDirty = true; // swap the box back to the name / city view
  setTimeout(() => { if (postsDirty && !document.activeElement?.matches("#posts input[type=text]")) { renderPosts(); fillNames(); } }, 150);
});
/* ---------- "Sending to" suggestions: the map's cities (Census) and the 12 companies' shops ---------- */
const STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
const norm = (t) => String(t).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function typoDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
const stateList = Object.entries(STATES).map(([ab, name]) => ({ ab, name, n: norm(name), a: ab.toLowerCase() }));
function matchState(t) {
  if (!t) return null;
  const exact = stateList.find((x) => x.a === t || x.n === t);
  if (exact) return exact.ab;
  if (t.length >= 3) { const pre = stateList.filter((x) => x.n.startsWith(t)); if (pre.length === 1) return pre[0].ab; }
  if (t.length >= 5) { const f = stateList.filter((x) => typoDistance(t, x.n, 2) <= (t.length >= 7 ? 2 : 1)); if (f.length === 1) return f[0].ab; }
  return null;
}
function splitQuery(q) {
  const comma = q.lastIndexOf(",");
  if (comma > 0) { const st = matchState(norm(q.slice(comma + 1))); if (st) return { city: norm(q.slice(0, comma)), st }; }
  const words = norm(q).split(" ");
  for (const k of [2, 1]) {
    if (words.length <= k) continue;
    const st = matchState(words.slice(-k).join(" "));
    if (st) return { city: words.slice(0, -k).join(" "), st };
  }
  return { city: norm(q), st: null };
}
let places = null, shops = null, brandNames = {}, geoLoading = null;
// The map's 12 company files, turned into the "Sending to" shop list with the board's naming rules.
const SHOP_BRANDS = { loves: "Love's", ta: "TA / Petro", freightliner: "Freightliner", volvo: "Volvo Trucks", boss: "Boss Truck Shops", utility: "Utility Trailer", prestige: "Prestige Trailers", timpte: "Timpte", thermoking: "Thermo King", carrier: "Carrier Transicold", fleetpride: "FleetPride", stm: "Southern Tire Mart" };
async function loadShops() {
  const lists = await Promise.all(Object.keys(SHOP_BRANDS).map((k) => fetch(`data/${k}.json`).then((r) => r.json()).then((d) => [k, d.stores]).catch(() => [k, []])));
  const rows = [];
  for (const [key, stores] of lists) for (const s of stores) {
    if (s.lat == null || s.lon == null || !s.city) continue;
    // Speedco shops belong to Love's; Freightliner's dealer list repeats them, so the Love's row is kept instead.
    if (key === "freightliner" && s.speedco) continue;
    let name = s.name || SHOP_BRANDS[key];
    if (key === "loves") name = s.type === "Truck Service" ? `Love's Speedco #${s.id} ` + name.replace(/^SC\s+/, "") : `Love's #${s.id} ${name}` + (s.type ? ` (${s.type})` : "");
    else if (key === "ta" && s.brand && !/^(TA|Petro)/.test(name)) name = `${s.brand} ${name}`;
    rows.push([key, name, s.address || "", s.city, s.state || "", s.phone || "", s.lat, s.lon]);
  }
  return { brands: SHOP_BRANDS, shops: rows };
}
function loadGeo() {
  geoLoading ||= Promise.all([fetch("data/places.json").then((r) => r.json()), loadShops()])
    .then(([pl, sh]) => {
      places = pl.places.map(([name, st, lat, lon, pop]) => ({ name, st, lat, lon, pop, n: norm(name) }));
      brandNames = sh.brands;
      shops = sh.shops.map(([b, name, address, city, st, phone, lat, lon]) => ({ b, name, address, city, st, phone, lat, lon, cn: norm(city), all: norm([sh.brands[b], name, city, st, STATES[st] || ""].join(" ")) }));
    })
    .catch(() => { geoLoading = null; toast("City and shop suggestions did not load. You can still type the shop by hand."); });
  return geoLoading;
}
const miles = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 7917.6 * Math.asin(Math.sqrt(x)); };
// Saved as "Company, City, ST" (Love's: "Love's Speedco #912, Council Bluffs, IA"); the street stays in the suggestion list only.
const shortName = (x) => x.b === "loves" ? x.name.replace(/\s*\([^)]*\)$/, "").replace(new RegExp("\\s+" + x.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"), "") : x.name;
const shopLabel = (x) => `${shortName(x)}, ${x.city}, ${x.st}`;
const shopItem = (x, dist) => ({ value: shopLabel(x), lat: x.lat, lon: x.lon, brand: x.b, t: x.name, sub: [x.address, `${x.city}, ${x.st}`, dist != null ? dist.toFixed(0) + " mi" : ""].filter(Boolean).join(" · "), tag: "Shop" });
function suggestDest(q) {
  const { city, st } = splitQuery(q), tokens = city.split(" ").filter(Boolean);
  if (!city && !st) return [];
  // Shops: same city first, then any shop whose company, name or city has a word starting with each typed word.
  const shopHits = [];
  for (const x of shops) {
    if (st && x.st !== st) continue;
    const t = !city ? 1 : x.cn === city ? 0 : x.cn.startsWith(city) ? 1 : tokens.every((w) => (" " + x.all).includes(" " + w)) ? 2 : -1;
    if (t >= 0) shopHits.push([t, x]);
  }
  shopHits.sort((a, b) => a[0] - b[0] || a[1].city.localeCompare(b[1].city));
  // Cities, biggest first, with a typo pass like the map's search boxes.
  const tier = (p) => (p.n === city ? 0 : p.n.startsWith(city) ? 1 : -1);
  let cityHits = [];
  if (city) {
    for (const p of places) { if (st && p.st !== st) continue; const t = tier(p); if (t >= 0) cityHits.push([t, p]); }
    if (cityHits.length < 4 && city.length >= 5) {
      const max = city.length >= 7 ? 2 : 1;
      for (const p of places) {
        if ((st && p.st !== st) || tier(p) >= 0) continue;
        if (typoDistance(city, p.n, max) <= max) cityHits.push([2, p]);
        if (cityHits.length > 50) break;
      }
    }
    cityHits.sort((a, b) => a[0] - b[0] || b[1].pop - a[1].pop);
  }
  const out = [];
  const cities = cityHits.slice(0, shopHits.length ? 4 : 8);
  if (cities.length) out.push({ hd: "Cities" }, ...cities.map(([, p]) => ({ value: `${p.name}, ${p.st}`, lat: p.lat, lon: p.lon, city: p, t: `${p.name}, ${p.st}`, sub: (STATES[p.st] || p.st) + " · pick to see shops nearby" })));
  const sh = shopHits.slice(0, 8 - cities.length + 2);
  if (sh.length) out.push({ hd: "Shops from the map" }, ...sh.map(([, x]) => shopItem(x)));
  return out;
}
function nearbyShops(p) {
  const near = shops.map((x) => [miles(p.lat, p.lon, x.lat, x.lon), x]).filter(([d]) => d <= 50).sort((a, b) => a[0] - b[0]).slice(0, 10);
  return near.length ? [{ hd: `Shops within 50 mi of ${p.name}, ${p.st}` }, ...near.map(([d, x]) => shopItem(x, d))] : [{ hd: `No map shops within 50 mi of ${p.name}, ${p.st}` }];
}
function destOf(el) {
  const v = el.value.trim(), lat = parseFloat(el.dataset.lat), lon = parseFloat(el.dataset.lon);
  return { destination: v, destLat: v && isFinite(lat) ? lat : null, destLon: v && isFinite(lon) ? lon : null, destBrand: v && el.dataset.brand ? el.dataset.brand : null };
}
const acList = document.createElement("ul");
acList.className = "ac-list"; acList.id = "dest-list"; acList.setAttribute("role", "listbox"); acList.hidden = true;
pbRoot.appendChild(acList);
let acInput = null, acItems = [], acActive = -1, acTimer;
function acClose() { acList.hidden = true; if (acInput) { acInput.setAttribute("aria-expanded", "false"); acInput.removeAttribute("aria-activedescendant"); } acActive = -1; }
function acPlace() {
  const r = acInput.getBoundingClientRect(), below = innerHeight - r.bottom - 8, above = r.top - 8;
  acList.style.left = r.left + "px";
  // Open upward when the box is near the bottom of the screen.
  if (below < 220 && above > below) { acList.style.top = "auto"; acList.style.bottom = innerHeight - r.top + 2 + "px"; acList.style.maxHeight = Math.min(340, above) + "px"; }
  else { acList.style.bottom = "auto"; acList.style.top = r.bottom + 2 + "px"; acList.style.maxHeight = Math.min(340, below) + "px"; } acList.style.width = Math.max(r.width, Math.min(380, innerWidth - r.left - 16)) + "px"; }
function acShow(items) {
  acItems = items;
  if (!items.length || !acInput || document.activeElement !== acInput) return acClose();
  acList.innerHTML = items.map((it, i) => it.hd ? `<li class="hd" role="presentation">${esc(it.hd)}</li>` : `<li role="option" id="dest-opt-${i}" data-i="${i}" aria-selected="false"><span class="t">${it.brand ? `<span class="bdot">${esc(brandNames[it.brand] || "")}</span>` : ""}${esc(it.t)}</span><span class="sub">${esc(it.sub)}</span></li>`).join("");
  acPlace(); acList.hidden = false; acInput.setAttribute("aria-expanded", "true"); acActive = -1;
}
function acMove(step) {
  const idx = acItems.map((it, i) => (it.hd ? -1 : i)).filter((i) => i >= 0);
  if (!idx.length) return;
  const at = idx.indexOf(acActive);
  acActive = idx[(at + step + idx.length) % idx.length];
  [...acList.children].forEach((li) => li.setAttribute("aria-selected", +li.dataset.i === acActive ? "true" : "false"));
  acInput.setAttribute("aria-activedescendant", "dest-opt-" + acActive);
  acList.querySelector(`[data-i="${acActive}"]`)?.scrollIntoView({ block: "nearest" });
}
function acPick(i) {
  const it = acItems[i]; if (!it || it.hd) return;
  acInput.value = it.value; acInput.dataset.lat = it.lat; acInput.dataset.lon = it.lon; acInput.dataset.brand = it.brand || "";
  if (it.city) return acShow(nearbyShops(it.city)); // picked a city: offer the shops around it next
  acClose();
  if (acInput.dataset.act === "dest") acInput.dispatchEvent(new Event("change", { bubbles: true }));
}
document.addEventListener("focusin", (e) => {
  if (!e.target.matches("input.dest")) return;
  acInput = e.target;
  if (acInput.value.trim() === OMAHA_SHOP) setTimeout(() => acInput.select(), 0); // typing replaces the H&M default
  acInput.setAttribute("role", "combobox"); acInput.setAttribute("aria-autocomplete", "list"); acInput.setAttribute("aria-controls", "dest-list"); acInput.setAttribute("aria-expanded", "false");
  loadGeo();
});
document.addEventListener("input", (e) => {
  if (!e.target.matches("input.dest")) return;
  const el = e.target; el.dataset.lat = el.dataset.lon = el.dataset.brand = "";
  clearTimeout(acTimer);
  if (el.value.trim().length < 2) return acClose();
  acTimer = setTimeout(() => loadGeo().then(() => { if (shops && document.activeElement === el) acShow(suggestDest(el.value)); }), 90);
});
document.addEventListener("keydown", (e) => {
  if (!e.target.matches("input.dest") || acList.hidden) return;
  if (e.key === "ArrowDown") { e.preventDefault(); acMove(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); acMove(-1); }
  else if (e.key === "Enter" && acActive >= 0) { e.preventDefault(); acPick(acActive); }
  else if (e.key === "Escape") acClose();
});
acList.addEventListener("pointerdown", (e) => { const li = e.target.closest("li[data-i]"); e.preventDefault(); if (li) acPick(+li.dataset.i); });
document.addEventListener("focusout", (e) => { if (e.target.matches("input.dest")) setTimeout(acClose, 120); });
addEventListener("scroll", () => { if (!acList.hidden) acPlace(); }, true);
addEventListener("resize", () => { if (!acList.hidden) acPlace(); });

setInterval(() => { renderLatest(); fillNames(); }, 30000);

/* ---------- live data ---------- */
function setConn(live, text) { $("conn").classList.toggle("live", live); $("conn-text").textContent = text; }
function lockForms(msg) {
  document.querySelectorAll("#add-unit button, #new-post button, #np-open, #unit-open").forEach((b) => (b.disabled = true));
  const n = $("notice"); n.textContent = msg; n.hidden = false;
}
const snapErr = (e) => {
  if (e?.code === "bad_pin" || e?.code === "locked") { window.PBGate?.lock(e.message); return; }
  setConn(false, "Offline"); toast("Can't reach the board right now. Changes will show again when the connection is back.");
};
// Called by the PIN screen once the PIN checks out.
function startBoard(store) {
  ({ db, user } = store);
  me = null; user.id().then((id) => { me = id; render(); });
  setConn(true, store.kind === "local" ? "Saved on this computer" : "Live");
  $("notice").hidden = true;
  db.collection("units").onSnapshot((s) => { units = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, snapErr);
  db.collection("posts").orderBy("reportedAt", "desc").limit(1000).onSnapshot((s) => { posts = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, snapErr);
  db.collection("events").orderBy("at", "desc").limit(1000).onSnapshot((s) => { events = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, snapErr);
}
addEventListener("pb-online", () => setConn(true, "Live"));
window.PostBoard = { start: startBoard };
})();
