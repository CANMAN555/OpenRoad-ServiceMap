import { test } from "node:test";
import assert from "node:assert/strict";
import { censusGeocode, fetchText, fetchWithTimeout } from "../scripts/lib.mjs";

function withFetch(fake, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  return Promise.resolve().then(fn).finally(() => { globalThis.fetch = original; });
}

const waitForAbort = (signal) => new Promise((_, reject) => {
  signal.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
});

test("fetchWithTimeout aborts a stalled request and includes URL and deadline", async () => {
  await withFetch((_url, { signal }) => waitForAbort(signal), async () => {
    const started = Date.now();
    await assert.rejects(fetchWithTimeout("https://slow.example/data", {}, 20), /https:\/\/slow\.example\/data timed out after 20 ms/);
    assert.ok(Date.now() - started < 1000);
  });
});

test("fetchText bounds response-body reads, retries only the configured attempts, and reports the timeout", async () => {
  const state = { attempts: 0 };
  await withFetch((_url, { signal }) => {
    state.attempts++;
    return Promise.resolve({ ok: true, text: () => waitForAbort(signal) });
  }, async () => {
    await assert.rejects(fetchText("https://slow.example/page", { tries: 2, timeoutMs: 10, retryDelayMs: 0 }), /timed out after 10 ms/);
    assert.equal(state.attempts, 2);
  });
});

test("a successful fetch clears its timeout", async () => {
  const state = {};
  await withFetch((_url, init) => {
    state.signal = init.signal;
    return Promise.resolve({ ok: true, text: async () => "available" });
  }, async () => {
    assert.equal(await fetchText("https://fast.example/page", { tries: 1, timeoutMs: 10 }), "available");
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(state.signal.aborted, false);
  });
});

test("Census POST response-body reads are bounded by the configured deadline", async () => {
  const state = {};
  await withFetch((url, init) => {
    state.request = { url, method: init.method, signal: init.signal, body: init.body };
    return Promise.resolve({ ok: true, text: () => waitForAbort(init.signal) });
  }, async () => {
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args);
    let points;
    try {
      points = await censusGeocode([{ id: "x", street: "1 Main St", city: "Omaha", state: "NE", zip: "68102" }],
        { timeoutMs: 10, tries: 1, retryDelayMs: 0 });
    } finally {
      console.warn = warn;
    }
    assert.equal(points.size, 0);
    assert.equal(state.request.method, "POST");
    assert.ok(state.request.body instanceof FormData);
    assert.equal(state.request.signal.aborted, true);
    assert.match(warnings[0][1], /timed out after 10 ms/);
  });
});

test("Census POST parses a successful response", async () => {
  await withFetch(async (url, init) => {
    assert.equal(init.method, "POST");
    assert.ok(init.body instanceof FormData);
    return new Response('"x","1 Main St, Omaha, NE, 68102","Match","Exact","1 MAIN ST, OMAHA, NE, 68102","-95.93,41.25"\\n');
  }, async () => {
    const points = await censusGeocode([{ id: "x", street: "1 Main St", city: "Omaha", state: "NE", zip: "68102" }], {
      tries: 1, timeoutMs: 100, retryDelayMs: 0,
    });
    assert.deepEqual(Array.from(points.get("x")), [41.25, -95.93]);
  });
});
