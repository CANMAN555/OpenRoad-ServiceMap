// BUG-local-board-write-failure: local storage errors must reject and preserve existing board data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const PIN_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";
const source = await readFile(new URL("../postboard/store.js", import.meta.url), "utf8");

function setup({ raw = null, getError = null, setError = null } = {}) {
  let stored = raw;
  const localStorage = {
    getItem() {
      if (getError) throw getError;
      return stored;
    },
    setItem(_key, value) {
      if (setError) throw setError;
      stored = value;
    },
  };
  const context = {
    window: { PB_CONFIG: { localPinSha256: PIN_HASH } },
    localStorage,
    crypto: { subtle: { digest: async () => Uint8Array.from(PIN_HASH.match(/../g), (x) => parseInt(x, 16)).buffer } },
    TextEncoder,
    addEventListener() {},
    setTimeout,
    setInterval,
    clearInterval,
    console,
  };
  vm.runInNewContext(source, context);
  return { store: context.window.PBStore, getStored: () => stored };
}

async function openBoard(t) {
  return t.store.open("1234", "Test User");
}

test("an absent localStorage key opens an empty board", async () => {
  const t = setup();
  const { db } = await openBoard(t);
  let docs;
  db.collection("posts").onSnapshot((snapshot) => { docs = snapshot.docs; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(docs.length, 0);
});

test("localStorage read errors reject opening with context", async () => {
  const t = setup({ getError: new Error("storage disabled") });
  await assert.rejects(openBoard(t), /Could not read local Post Board storage: storage disabled/);
});

test("malformed stored JSON rejects opening without changing the stored value", async () => {
  const t = setup({ raw: "{broken json" });
  await assert.rejects(openBoard(t), /Could not parse local Post Board storage/);
  assert.equal(t.getStored(), "{broken json");
});

test("a failed optimistic post write rejects and rolls back the cache", async () => {
  const raw = JSON.stringify({ posts: { old: { text: "keep" } } });
  const t = setup({ raw, setError: new Error("quota exceeded") });
  const { db } = await openBoard(t);
  let rows = [];
  db.collection("posts").onSnapshot((snapshot) => { rows = Array.from(snapshot.docs, (doc) => [doc.id, doc.data().text]); });
  await new Promise((resolve) => setTimeout(resolve, 0));

  await assert.rejects(db.collection("posts").add({ text: "new" }), /Could not save local Post Board storage: quota exceeded/);
  assert.deepEqual(rows, [["old", "keep"]]);
  assert.equal(t.getStored(), raw);
});

test("a failed local delete rejects and restores the cached document", async () => {
  const raw = JSON.stringify({ posts: { keep: { text: "still here" } } });
  const t = setup({ raw, setError: new Error("storage disabled") });
  const { db } = await openBoard(t);
  let rows = [];
  db.collection("posts").onSnapshot((snapshot) => { rows = Array.from(snapshot.docs, (doc) => [doc.id, doc.data().text]); });
  await new Promise((resolve) => setTimeout(resolve, 0));

  await assert.rejects(db.collection("posts").doc("keep").delete(), /Could not save local Post Board storage: storage disabled/);
  assert.deepEqual(rows, [["keep", "still here"]]);
  assert.equal(t.getStored(), raw);
});
