// Post Board storage. The board code talks to a small database interface (collections of documents with live
// snapshots). Two backends fill it in:
//   - Supabase, when postboard/config.js has a project URL and anon key: one shared board for everyone with the PIN.
//     The PIN is checked by the database on every call (see postboard/supabase.sql), so reading the page source
//     does not reveal the data or the PIN.
//   - This browser only, when no Supabase project is set: each browser keeps its own board in localStorage.
(() => {
  const CFG = window.PB_CONFIG || {};
  const COLS = ["units", "posts", "events", "links"];
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // ---------- shared in-memory cache with Firestore-style snapshots ----------
  function makeDb(backend) {
    const cache = Object.fromEntries(COLS.map((c) => [c, new Map()]));
    const subs = [];
    const notify = (col) => subs.filter((s) => s.col === col).forEach((s) => s.fire());
    const query = (col, ob, lim) => ({
      orderBy: (f, d = "asc") => query(col, [f, d], lim),
      limit: (n) => query(col, ob, n),
      onSnapshot(next, err) {
        const sub = { col, err, fire() {
          let docs = [...cache[col].entries()].map(([id, v]) => ({ id, exists: true, data: () => clone(v) }));
          if (ob) docs.sort((a, b) => { const x = a.data()[ob[0]] ?? "", y = b.data()[ob[0]] ?? ""; return (x < y ? -1 : x > y ? 1 : 0) * (ob[1] === "desc" ? -1 : 1); });
          if (lim) docs = docs.slice(0, lim);
          next({ docs, size: docs.length, empty: !docs.length });
        } };
        subs.push(sub); setTimeout(() => sub.fire(), 0);
        return () => subs.splice(subs.indexOf(sub), 1);
      },
    });
    const apply = (rows) => {
      const touched = new Set();
      for (const r of rows) {
        if (!cache[r.col]) continue;
        if (r.deleted) cache[r.col].delete(r.id); else cache[r.col].set(r.id, r.data);
        touched.add(r.col);
      }
      touched.forEach(notify);
    };
    const fail = (e) => subs.forEach((s) => s.err && s.err(e));
    const write = async (col, id, data, merge) => {
      const prev = cache[col].get(id);
      const next = merge ? { ...(prev || {}), ...data } : data;
      apply([{ col, id, data: next }]);  // show the change right away
      try { await backend.put(col, id, data, merge); }
      catch (e) { apply([prev ? { col, id, data: prev } : { col, id, deleted: true }]); throw e; }
    };
    const docRef = (path) => {
      const [col, id] = path.split("/");
      return {
        update: (d) => write(col, id, d, true),
        set: (d) => write(col, id, d, false),
        delete: async () => {
          const prev = cache[col].get(id);
          apply([{ col, id, deleted: true }]);
          try { await backend.del(col, id); } catch (e) { if (prev) apply([{ col, id, data: prev }]); throw e; }
        },
      };
    };
    const db = {
      collection: (col) => Object.assign(query(col), {
        add: async (d) => { const id = newId(); await write(col, id, d, false); return { id }; },
        doc: (id) => docRef(col + "/" + id),
      }),
      doc: docRef,
    };
    backend.start(apply, fail);
    return db;
  }

  // ---------- Supabase backend: PIN-checked database functions, polled every few seconds ----------
  function supabase(pin) {
    const rpc = async (fn, args) => {
      const r = await fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: { apikey: CFG.supabaseAnonKey, Authorization: "Bearer " + CFG.supabaseAnonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...args }),
      });
      if (!r.ok) throw new Error("The board's database answered " + r.status + ".");
      const out = await r.json();
      if (out && out.error) { const e = new Error(out.error === "locked" ? "Too many wrong PINs. Try again in 10 minutes." : out.error === "bad_pin" ? "Wrong PIN." : out.error); e.code = out.error; throw e; }
      return out;
    };
    let seq = 0, timer = null, applyFn, failFn, polling = false, down = false;
    const poll = async () => {
      if (polling) return; polling = true;
      try {
        const out = await rpc("pb_changes", { since: seq });
        seq = Math.max(seq, out.seq || 0); applyFn(out.rows || []);
        if (down) { down = false; dispatchEvent(new Event("pb-online")); }
      } catch (e) {
        // Report a lost connection once, not on every poll; a wrong or changed PIN always reports.
        if (!down || e.code) failFn(e);
        down = true;
        if (e.code) clearInterval(timer);
      } finally { polling = false; }
    };
    return {
      kind: "shared",
      login: () => rpc("pb_login", {}),
      start(apply, fail) {
        applyFn = apply; failFn = fail; poll();
        timer = setInterval(() => { if (!document.hidden) poll(); }, 3000);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
      },
      put: async (col, id, data, merge) => { await rpc("pb_put", { col, id, data, merge }); poll(); },
      del: async (col, id) => { await rpc("pb_del", { col, id }); poll(); },
      stop: () => clearInterval(timer),
    };
  }

  // ---------- This-browser-only backend ----------
  // SHA-256 of the PIN. Only a light lock: anyone who reads the page source can get around it.
  const LOCAL_PIN_SHA256 = CFG.localPinSha256 || "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";
  function local(pin) {
    const KEY = "pb-local-board";
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
    const save = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} };
    let applyFn;
    return {
      kind: "local",
      async login() {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
        const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
        if (hex !== LOCAL_PIN_SHA256) { const e = new Error("Wrong PIN."); e.code = "bad_pin"; throw e; }
        return "ok";
      },
      start(apply) {
        applyFn = apply;
        const all = load();
        apply(Object.entries(all).flatMap(([col, docs]) => Object.entries(docs).map(([id, data]) => ({ col, id, data }))));
        // Another tab of this browser changed the board.
        addEventListener("storage", (e) => { if (e.key === KEY) { const a = load(); apply(COLS.flatMap((col) => Object.entries(a[col] || {}).map(([id, data]) => ({ col, id, data })))); } });
      },
      async put(col, id, data, merge) { const all = load(); all[col] ||= {}; all[col][id] = merge ? { ...(all[col][id] || {}), ...data } : data; save(all); },
      async del(col, id) { const all = load(); if (all[col]) delete all[col][id]; save(all); },
    };
  }

  // People are named by what they type on the PIN screen; ids look like "n:Manny".
  function makeUser(name) {
    const me = "n:" + name;
    return {
      id: async () => me,
      profiles: async (ids) => Object.fromEntries(ids.map((id) => [id, { id, isMe: id === me, name: String(id).startsWith("n:") ? id.slice(2) : (CFG.legacyNames || {})[id] || "" }])),
    };
  }

  window.PBStore = {
    shared: Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey),
    // Checks the PIN, then returns { db, user, kind }. Throws with .code "bad_pin" or "locked".
    async open(pin, name) {
      const backend = this.shared ? supabase(pin) : local(pin);
      const res = await backend.login();
      if (res !== "ok") { const e = new Error(res === "locked" ? "Too many wrong PINs. Try again in 10 minutes." : "Wrong PIN."); e.code = res; throw e; }
      return { db: makeDb(backend), user: makeUser(name), kind: backend.kind };
    },
  };
})();
