// BUG-C11: the daily import reads waiting website requests with the service key, in pages, opens one GitHub request
// for each, and marks each row "sent", so nothing is read twice or left behind. Supabase and GitHub are stubbed.
// Run with: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/import-vendor-requests.mjs", import.meta.url));
const STUB = `
  import { readFileSync, writeFileSync } from "node:fs";
  const file = process.env.STUB_STATE, load = () => JSON.parse(readFileSync(file, "utf8")), save = (s) => writeFileSync(file, JSON.stringify(s));
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)), s = load(), method = init.method || "GET";
    if (u.hostname === "db.test") {
      s.dbKeys.push(init.headers.apikey);
      if (method === "GET") {
        s.reads++;
        const after = Number(u.searchParams.get("id").slice(3)), limit = Number(u.searchParams.get("limit"));
        const rows = s.rows.filter((r) => r.status === "new" && r.id > after).sort((a, b) => a.id - b.id).slice(0, Math.min(limit, s.cap));
        save(s); return Response.json(rows);
      }
      const id = Number(u.searchParams.get("id").slice(3));
      if (u.searchParams.get("status") !== "eq.new") throw new Error("PATCH without status=eq.new");
      s.patches.push(id);
      if (s.failPatch.includes(id)) { s.failPatch = s.failPatch.filter((x) => x !== id); save(s); return new Response("boom", { status: 500 }); }
      Object.assign(s.rows.find((r) => r.id === id), JSON.parse(init.body)); save(s);
      return new Response(null, { status: 204 });
    }
    if (u.hostname === "api.github.com" && method === "GET") {
      const page = Number(u.searchParams.get("page"));
      return Response.json(s.issues.slice((page - 1) * 100, page * 100));
    }
    if (u.hostname === "api.github.com") {
      const issue = { html_url: "https://github.com/x/y/issues/" + (s.issues.length + 1), body: JSON.parse(init.body).body, user: { login: "github-actions[bot]" } };
      s.issues.push(issue); s.created++; save(s); return Response.json(issue, { status: 201 });
    }
    throw new Error("unexpected fetch " + url);
  };`;

const row = (id) => ({ id, status: "new", created_at: "2026-10-21T00:00:00Z", name: `Shop ${id}`, services: "Towing", address: "1 Main St",
  city: "Omaha", state: "NE", zip: "68102", phone: "4025550100", notes: "" });
async function setup(init) {
  const dir = await mkdtemp(join(tmpdir(), "import-"));
  await mkdir(join(dir, "postboard"));
  await writeFile(join(dir, "postboard/config.js"), 'window.PB = { supabaseUrl: "https://db.test", supabaseAnonKey: "sb_publishable_anon" };\n');
  await writeFile(join(dir, "stub.mjs"), STUB);
  await writeFile(join(dir, "state.json"), JSON.stringify({ cap: 1e9, issues: [], failPatch: [], ...init, dbKeys: [], patches: [], reads: 0, created: 0 }));
  const run = (env = {}) => new Promise((done) => execFile(process.execPath, ["--import", join(dir, "stub.mjs"), script], { cwd: dir,
    env: { PATH: process.env.PATH, STUB_STATE: join(dir, "state.json"), GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "x/y", SUPABASE_SERVICE_KEY: "sb_secret_test", IMPORT_PAGE_SIZE: "5", ...env } },
    (err, stdout) => done({ code: err ? err.code : 0, stdout })));
  const state = async () => { const s = JSON.parse(await readFile(join(dir, "state.json"), "utf8")); await writeFile(join(dir, "state.json"), JSON.stringify({ ...s, dbKeys: [], patches: [], reads: 0, created: 0 })); return s; };
  return { run, state };
}

test("without the service key the run fails and nothing is read", async () => {
  const t = await setup({ rows: [row(1)] });
  const r = await t.run({ SUPABASE_SERVICE_KEY: "" });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /::error::SUPABASE_SERVICE_KEY secret is not set/);
  const s = await t.state();
  assert.equal(s.reads + s.created + s.patches.length, 0);
});

// 2 pages of 5 plus 3 rows; once with the server answering whole pages, once with it capping every answer at 3 rows.
for (const cap of [1e9, 3]) {
  test(`every waiting request is imported once and marked sent (server cap ${cap === 3 ? 3 : "none"})`, async () => {
    const ids = Array.from({ length: 13 }, (_, i) => 10 + i * 7);
    const t = await setup({ rows: ids.map(row), cap });
    assert.equal((await t.run()).code, 0);
    let s = await t.state();
    assert.equal(s.created, 13);
    assert.deepEqual(s.patches, ids);
    assert.deepEqual(s.issues.map((i) => Number(/Website request #(\d+)/.exec(i.body)[1])), ids);
    assert.ok(s.rows.every((r) => r.status === "sent" && r.issue_url));
    assert.ok(s.dbKeys.every((k) => k === "sb_secret_test"));
    assert.equal((await t.run()).code, 0);
    s = await t.state();
    assert.equal(s.created + s.patches.length, 0);
  });
}

test("a request whose issue exists (on the second page of issues) is marked sent without a new issue", async () => {
  const issues = Array.from({ length: 150 }, (_, i) => ({ html_url: `https://github.com/x/y/issues/${i + 1}`,
    body: `Website request #${1000 + i}, sent from the map's Add a vendor form`, user: { login: "github-actions[bot]" } }));
  const t = await setup({ rows: [row(1120)], issues });
  assert.equal((await t.run()).code, 0);
  const s = await t.state();
  assert.equal(s.created, 0);
  assert.deepEqual(s.patches, [1120]);
  assert.equal(s.rows[0].issue_url, "https://github.com/x/y/issues/121");
});

test("a failed mark turns the run red, the others still go through, and the next run repairs it", async () => {
  const t = await setup({ rows: [1, 2, 3].map(row), failPatch: [2] });
  const r = await t.run();
  assert.equal(r.code, 1);
  assert.match(r.stdout, /::error::Could not mark website request #2 as sent/);
  let s = await t.state();
  assert.equal(s.created, 3);
  assert.deepEqual(s.rows.map((x) => x.status), ["sent", "new", "sent"]);
  assert.equal((await t.run()).code, 0);
  s = await t.state();
  assert.equal(s.created, 0);
  assert.deepEqual(s.patches, [2]);
  assert.equal(s.rows[1].issue_url, "https://github.com/x/y/issues/2");
});

test("an issue that someone else wrote, or that only mentions the request, does not count as its GitHub request", async () => {
  const issues = [
    { html_url: "https://github.com/x/y/issues/1", body: "Website request #7, sent from the map", user: { login: "someone" } },
    { html_url: "https://github.com/x/y/issues/2", body: "Same shop as Website request #7, sent from the map", user: { login: "github-actions[bot]" } },
  ];
  const t = await setup({ rows: [row(7)], issues });
  assert.equal((await t.run()).code, 0);
  const s = await t.state();
  assert.equal(s.created, 1);
  assert.equal(s.rows[0].issue_url, "https://github.com/x/y/issues/3");
});
