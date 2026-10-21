// BUG-C8: the website check fetches only public internet addresses: no IP literal, DNS answer or redirect may lead it to
// the runner's own machine, its cloud metadata service or a private network. No test here touches the internet.
// Run with: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";
import { guardedLookup, isPublicAddress, safeGet } from "../scripts/lib.mjs";

// A request function that must never be called.
const never = () => { throw new Error("a request was sent"); };
// A request function that answers each URL from a table, recording what was asked.
function fake(table, asked = []) {
  return (url, opts, onResponse) => {
    asked.push(url.href);
    const req = new EventEmitter();
    req.end = () => setImmediate(() => {
      const [status, headers = {}, body = ""] = table[url.href] || [404];
      const res = new PassThrough();
      Object.assign(res, { statusCode: status, headers });
      onResponse(res);
      res.end(body);
    });
    req.destroy = (e) => e && req.emit("error", e);
    return req;
  };
}

const PRIVATE = ["127.0.0.1", "10.1.2.3", "169.254.169.254", "100.64.0.1", "172.16.5.4", "192.168.1.1", "0.0.0.0", "224.0.0.1",
  "::1", "::", "fe80::1", "fc00::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a00:1"];
test("private, loopback, link-local, CGNAT, multicast and mapped addresses are not public", () => {
  for (const ip of PRIVATE) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPublicAddress(ip), true, ip);
  assert.equal(isPublicAddress("example.com"), false);
});

for (const url of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/", "http://0.0.0.0/",
  "http://2130706433/", "http://0x7f.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[fd00::1]/", "http://[fe80::1]/"]) {
  test(`an IP literal is refused before connecting: ${url}`, async () => {
    await assert.rejects(safeGet(url, { request: never }), { code: "EBLOCKED" });
  });
}

test("other schemes and ports are refused", async () => {
  for (const url of ["ftp://example.com/", "file:///etc/passwd", "http://example.com:8080/", "https://example.com:22/"])
    await assert.rejects(safeGet(url, { request: never }), /not http|not allowed/);
});

test("a public IP literal is fetched", async () => {
  const r = await safeGet("http://93.184.216.34/", { request: fake({ "http://93.184.216.34/": [200, {}, "hello"] }) });
  assert.equal(r.html, "hello");
});

test("a redirect to a private address is refused without following it", async () => {
  const asked = [];
  const request = fake({ "https://acme.example/": [302, { location: "http://127.0.0.1/admin" }] }, asked);
  await assert.rejects(safeGet("https://acme.example/", { request }), { code: "EBLOCKED" });
  assert.deepEqual(asked, ["https://acme.example/"]);
});

test("redirects are followed up to the limit", async () => {
  const request = fake({ "https://a.example/": [301, { location: "/b" }], "https://a.example/b": [200, {}, "ok"] });
  assert.deepEqual(await safeGet("https://a.example/", { request }), { url: "https://a.example/b", status: 200, html: "ok" });
  const loop = fake({ "https://a.example/": [302, { location: "/" }] });
  await assert.rejects(safeGet("https://a.example/", { request: loop }), /too many redirects/);
});

test("gzip pages are unpacked and big pages are cut at maxBytes", async () => {
  const request = fake({ "https://a.example/": [200, { "content-encoding": "gzip" }, gzipSync("call (402) 555-0100")],
    "https://a.example/big": [200, {}, "x".repeat(5000)] });
  assert.equal((await safeGet("https://a.example/", { request })).html, "call (402) 555-0100");
  assert.equal((await safeGet("https://a.example/big", { request, maxBytes: 1000 })).html.length, 1000);
});

test("the DNS guard refuses a name when any of its addresses is private", async () => {
  const resolve = (map) => (host, opts, cb) => cb(null, map[host].map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
  const look = (map, host, opts) => new Promise((res, rej) => guardedLookup(resolve(map))(host, opts, (e, ...a) => (e ? rej(e) : res(a))));
  const map = { "evil.test": ["93.184.216.34", "127.0.0.1"], "six.test": ["::ffff:10.0.0.1"], "ok.test": ["93.184.216.34", "2606:4700::1111"] };
  await assert.rejects(look(map, "evil.test", {}), { code: "EBLOCKED" });
  await assert.rejects(look(map, "six.test", { all: true }), { code: "EBLOCKED" });
  assert.deepEqual(await look(map, "ok.test", {}), ["93.184.216.34", 4]);
  assert.equal((await look(map, "ok.test", { all: true }))[0].length, 2);
});

// Node's own http client with the guard: a name that resolves to this machine never reaches the server listening here.
test("a name that resolves to 127.0.0.1 never connects", async () => {
  let hits = 0;
  const server = createServer((req, res) => { hits++; res.end("secret"); });
  await new Promise((r) => server.listen(80, "127.0.0.1", r).on("error", () => r()));
  try {
    const resolve = (host, opts, cb) => cb(null, [{ address: "127.0.0.1", family: 4 }]);
    await assert.rejects(safeGet("http://evil.test/", { resolve }), { code: "EBLOCKED" });
    assert.equal(hits, 0);
  } finally { server.close(); }
});
