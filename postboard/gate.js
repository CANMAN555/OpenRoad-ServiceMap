// Post Board PIN screen. The board opens only after the PIN checks out (postboard/store.js asks the database,
// or this browser when no shared database is set up). The PIN is kept for this browser tab session only.
(() => {
  const $ = (id) => document.getElementById(id);
  const gate = $("pb-gate"), board = $("pb-board"), form = $("pb-gate-form"), pinIn = $("pb-pin"), nameIn = $("pb-name"), msg = $("pb-gate-msg"), go = $("pb-go");
  let open = false;
  const get = (store, k) => { try { return store.getItem(k) || ""; } catch { return ""; } };
  const put = (store, k, v) => { try { v ? store.setItem(k, v) : store.removeItem(k); } catch {} };
  nameIn.value = get(localStorage, "pb-name");

  async function unlock(pin, name, quiet) {
    go.disabled = true; msg.textContent = quiet ? "" : "Checking…";
    try {
      const store = await window.PBStore.open(pin, name);
      put(sessionStorage, "pb-pin", pin); put(localStorage, "pb-name", name);
      gate.hidden = true; board.hidden = false; open = true;
      window.PostBoard.start(store);
    } catch (e) {
      put(sessionStorage, "pb-pin", "");
      msg.textContent = e.code === "bad_pin" ? "That PIN is not right. Try again." : e.message || "The board could not open. Try again.";
      pinIn.value = ""; if (!quiet) pinIn.focus();
    } finally { go.disabled = false; }
  }

  pinIn.addEventListener("input", () => { pinIn.value = pinIn.value.replace(/\D/g, "").slice(0, 4); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pin = pinIn.value.trim(), name = nameIn.value.trim().replace(/\s+/g, " ");
    if (!/^\d{4}$/.test(pin)) { msg.textContent = "Enter the 4-digit PIN."; pinIn.focus(); return; }
    if (!name) { msg.textContent = "Enter your name. It shows on the updates you post."; nameIn.focus(); return; }
    unlock(pin, name.slice(0, 40), false);
  });

  window.PBGate = {
    // The Post Board button was pressed: open straight away if this tab already entered the PIN.
    show() {
      if (open) return;
      const pin = get(sessionStorage, "pb-pin"), name = get(localStorage, "pb-name");
      if (pin && name) unlock(pin, name, true);
      else setTimeout(() => (nameIn.value ? pinIn : nameIn).focus(), 50);
    },
    // Wrong or changed PIN while the board is open, or the Lock button: back to the PIN screen.
    lock(text) {
      put(sessionStorage, "pb-pin", "");
      try { sessionStorage.setItem("pb-msg", text || ""); } catch {}
      location.hash = "post-board"; location.reload();
    },
  };
  try { const t = sessionStorage.getItem("pb-msg"); if (t) { msg.textContent = t; sessionStorage.removeItem("pb-msg"); } } catch {}
  $("pb-lock").addEventListener("click", () => window.PBGate.lock("Locked. Enter the PIN to open the board again."));
})();
