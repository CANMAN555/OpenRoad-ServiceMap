// BUG-C1: a vendor request's research (website, hours, sections) is read only from a research comment by the owner or
// a collaborator, never from the request text, which whoever opened the request can edit at any time.
// Run with: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { REQUEST_LABELS, RESEARCH_LABELS, RESEARCH_MARK, researchOf } from "../scripts/lib.mjs";

const VALID = {
  "Business name": "Acme Truck Repair", Services: "Truck repair, Tires", "Street address": "1 Main St", City: "Omaha",
  "State (2 letters)": "NE", "ZIP code": "68102", "Phone number": "(402) 555-0100", Notes: "_No response_",
};
const blocks = (vals, labels) => labels.map((l) => `### ${l}\n\n${vals[l]}\n`).join("\n");
const research = (website, assoc = "OWNER") => ({
  author_association: assoc, user: { login: "CANMAN555" },
  body: `${RESEARCH_MARK}\nClaude checked this vendor online.\n\n` +
    blocks({ Website: website || "_No response_", Hours: "Mon-Fri 8-5", "Hours source": "https://acme.example/hours", Sections: "Other Vendors" }, RESEARCH_LABELS),
});
const filler = (n) => Array.from({ length: n }, (_, i) => ({ author_association: "NONE", user: { login: "someone" }, body: `comment ${i}` }));

test("a collaborator's research comment is read, with or without Sections", () => {
  assert.equal(researchOf([research("https://acme.example", "COLLABORATOR")]).fields.Website, "https://acme.example");
  const c = research("https://acme.example");
  c.body = c.body.replace(/\n### Sections[\s\S]*$/, "\n");
  assert.equal(researchOf([c]).fields.Hours, "Mon-Fri 8-5");
});

test("a research comment from someone outside the repository is ignored", () => {
  assert.equal(researchOf([research("https://evil.example", "NONE")]), null);
  assert.equal(researchOf([research("https://evil.example", "CONTRIBUTOR")]), null);
  assert.equal(researchOf([research("https://acme.example"), research("https://evil.example", "NONE")]).fields.Website, "https://acme.example");
});

test("the newest research comment wins", () => {
  assert.equal(researchOf([research("https://old.example"), research("https://new.example")]).fields.Website, "https://new.example");
});

test("a research comment with an extra heading is rejected", () => {
  const c = research("https://acme.example");
  c.body += "\n### Phone number\n\n(555) 555-0199\n";
  assert.ok(researchOf([c]).error);
});

// The whole script, with GitHub, the Census geocoder and nothing else answered by a stub. Returns comment.md.
async function run(issue, pages) {
  const dir = await mkdtemp(join(tmpdir(), "av-"));
  await writeFile(join(dir, "event.json"), JSON.stringify({ issue }));
  await writeFile(join(dir, "fixture.json"), JSON.stringify({ issue, pages }));
  await writeFile(join(dir, "stub.mjs"), `
    import { readFileSync } from "node:fs";
    const { issue, pages } = JSON.parse(readFileSync(${JSON.stringify(join(dir, "fixture.json"))}, "utf8"));
    globalThis.fetch = async (url) => {
      const u = new URL(String(url));
      if (u.hostname === "api.github.com" && u.pathname.endsWith("/comments")) return Response.json(pages[u.searchParams.get("page") - 1] || []);
      if (u.hostname === "api.github.com") return Response.json(issue);
      if (u.hostname === "geocoding.geo.census.gov")
        return new Response('"x","1 Main St, Omaha, NE, 68102","Match","Exact","1 MAIN ST, OMAHA, NE, 68102","-95.93,41.25"\\n');
      throw new Error("unexpected fetch " + url);
    };`);
  const script = new URL("../scripts/add-vendor.mjs", import.meta.url).pathname;
  await promisify(execFile)(process.execPath, ["--import", join(dir, "stub.mjs"), script], { cwd: dir,
    env: { PATH: process.env.PATH, GITHUB_EVENT_PATH: join(dir, "event.json"), GITHUB_TOKEN: "test", GITHUB_REPOSITORY: "x/y", REPO_OWNER: "CANMAN555" } });
  await assert.rejects(readFile(join(dir, "data/added.json")));
  return readFile(join(dir, "comment.md"), "utf8");
}
const issue = (body) => ({ number: 9, state: "open", html_url: "https://github.com/x/y/issues/9", user: { login: "someone" },
  labels: [{ name: "add-vendor" }, { name: "checked-by-claude" }], body });

test("add-vendor.mjs ignores a research comment written by the person asking", async () => {
  const md = await run(issue(blocks(VALID, REQUEST_LABELS)), [filler(100), [research("https://evil.example", "NONE")]]);
  assert.match(md, /research comment was not found/);
});

test("add-vendor.mjs turns away research written into the request text", async () => {
  const vals = { ...VALID, Website: "https://evil.example", Hours: "24/7", "Hours source": "x", Sections: "Towing" };
  const md = await run(issue(blocks(vals, REQUEST_LABELS.concat(RESEARCH_LABELS))), [[research("https://acme.example")]]);
  assert.match(md, /does not match the form: line \d+ starts with `### Website`/);
});

test("add-vendor.mjs reads every page of comments and uses the newest research", async () => {
  // Page 1 has an older research comment with a website; the newer one on page 2 found none.
  const md = await run(issue(blocks(VALID, REQUEST_LABELS)), [[research("https://old.example"), ...filler(99)], [research("")]]);
  assert.match(md, /Website check: Claude did not find a website\./);
});

test("add-vendor.mjs never fetches a website on a private address", async () => {
  const md = await run(issue(blocks(VALID, REQUEST_LABELS)), [[...filler(100)], [research("http://169.254.169.254/latest/meta-data/")]]);
  assert.match(md, /Website check: site down \(http:\/\/169\.254\.169\.254\/latest\/meta-data\/\)\./);
});
