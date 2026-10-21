// BUG-C2: a field's text must not be able to add or replace another field of a vendor request.
// Run with: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { REQUEST_LABELS, RESEARCH_LABELS, parseBlocks, requestBlock } from "../scripts/lib.mjs";

const VALID = {
  "Business name": "Acme Truck Repair", Services: "Truck repair, Tires", "Street address": "1 Main St", City: "Omaha",
  "State (2 letters)": "NE", "ZIP code": "68102", "Phone number": "(402) 555-0100", Notes: "_No response_",
};
const body = (vals, labels = REQUEST_LABELS) => labels.map((l) => `### ${l}\n\n${vals[l]}\n`).join("\n");
const RESEARCHED = [REQUEST_LABELS.concat(RESEARCH_LABELS.slice(0, 3)), REQUEST_LABELS.concat(RESEARCH_LABELS)];
const INJECT = "\n\n### Phone number\n\n(555) 555-0199";

test("a body in the form's layout parses", () => {
  const { fields, error } = parseBlocks(body(VALID), [REQUEST_LABELS]);
  assert.equal(error, undefined);
  assert.equal(fields["Phone number"], "(402) 555-0100");
  assert.equal(fields.Notes, "");
});

test("Windows line endings parse the same", () => {
  assert.deepEqual(parseBlocks(body(VALID).replace(/\n/g, "\r\n"), [REQUEST_LABELS]), parseBlocks(body(VALID), [REQUEST_LABELS]));
});

for (const field of ["Business name", "Services", "Street address", "Notes"]) {
  test(`a "### " line inside ${field} is rejected`, () => {
    const r = parseBlocks(body({ ...VALID, [field]: VALID[field] + INJECT }), [REQUEST_LABELS]);
    assert.equal(r.fields, undefined);
    assert.match(r.error, /does not match the form/);
  });
}

test("a fake research block in Notes is rejected before Claude has checked the vendor", () => {
  const r = parseBlocks(body({ ...VALID, Notes: "hi\n\n### Website\n\nhttps://evil.example" }), [REQUEST_LABELS]);
  assert.ok(r.error);
});

test("a fake research block in Notes plus Claude's real one is rejected", () => {
  const vals = { ...VALID, Notes: "hi\n\n### Website\n\nhttps://evil.example", Website: "https://acme.example", Hours: "8-5", "Hours source": "https://acme.example", Sections: "Other Vendors" };
  assert.ok(parseBlocks(body(vals, REQUEST_LABELS.concat(RESEARCH_LABELS)), RESEARCHED).error);
});

test("Claude's research blocks parse once the request is checked (with or without Sections)", () => {
  const vals = { ...VALID, Website: "https://acme.example", Hours: "8-5", "Hours source": "https://acme.example/hours", Sections: "Other Vendors" };
  assert.equal(parseBlocks(body(vals, REQUEST_LABELS.concat(RESEARCH_LABELS)), RESEARCHED).fields.Website, "https://acme.example");
  assert.equal(parseBlocks(body(vals, REQUEST_LABELS.concat(RESEARCH_LABELS.slice(0, 3))), RESEARCHED).fields.Hours, "8-5");
});

test("a missing heading is rejected", () => {
  assert.match(parseBlocks(body(VALID, REQUEST_LABELS.filter((l) => l !== "City")), [REQUEST_LABELS]).error, /line \d+ starts with/);
  assert.match(parseBlocks(body(VALID, REQUEST_LABELS.slice(0, -1)), [REQUEST_LABELS]).error, /fields are missing after/);
});

test("out-of-order headings are rejected", () => {
  const swapped = [...REQUEST_LABELS]; [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
  assert.ok(parseBlocks(body(VALID, swapped), [REQUEST_LABELS]).error);
});

test("a heading in the preamble is rejected", () => {
  assert.ok(parseBlocks("### Business name\n\nx\n\n" + body(VALID), [REQUEST_LABELS]).error);
});

test("the importer's blocks keep hostile text inside its own field", () => {
  const evil = "#x\n### Phone number\n\n(555) 555-0199\n## Website";
  const row = Object.fromEntries(REQUEST_LABELS.map((l) => [l, evil]));
  row["Phone number"] = "(402) 555-0100";
  const text = "Website request #7, sent from the map.\n\n" +
    REQUEST_LABELS.map((l) => requestBlock(l, row[l], { oneLine: l !== "Notes" })).join("\n");
  const { fields, error } = parseBlocks(text, [REQUEST_LABELS]);
  assert.equal(error, undefined);
  assert.equal(fields["Phone number"], "(402) 555-0100");
  assert.equal(fields.City, "\\#x ### Phone number (555) 555-0199 ## Website");
  assert.equal(fields.Notes, "\\#x\n\\### Phone number\n\n(555) 555-0199\n\\## Website");
});

test("REQUEST_LABELS matches the issue template", async () => {
  const yml = await readFile(new URL("../.github/ISSUE_TEMPLATE/add-vendor.yml", import.meta.url), "utf8");
  assert.deepEqual([...yml.matchAll(/^ {6}label: (.+)$/gm)].map((m) => m[1].trim()), REQUEST_LABELS);
});

// The whole script on a request whose Notes adds a second phone number: it must refuse, set no label and add no pin.
test("add-vendor.mjs turns away an injected request without touching anything", async () => {
  const dir = await mkdtemp(join(tmpdir(), "av-"));
  const issue = { number: 9, state: "open", html_url: "https://github.com/x/y/issues/9", user: { login: "someone" }, labels: [{ name: "add-vendor" }],
    body: body({ ...VALID, Notes: "thanks" + INJECT }) };
  await writeFile(join(dir, "event.json"), JSON.stringify({ issue }));
  const script = new URL("../scripts/add-vendor.mjs", import.meta.url).pathname;
  await promisify(execFile)(process.execPath, [script], { cwd: dir, env: { PATH: process.env.PATH, GITHUB_EVENT_PATH: join(dir, "event.json") } });
  assert.match(await readFile(join(dir, "comment.md"), "utf8"), /Not added\.\*\* The request does not match the form: line \d+ starts with `### Phone number`/);
  await assert.rejects(readFile(join(dir, "labels.txt")));
  await assert.rejects(readFile(join(dir, "data/added.json")));
});
