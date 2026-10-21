import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const script = new URL("../scripts/report-vendor-update-failures.mjs", import.meta.url);

test("vendor updater failures are listed and make the workflow fail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendor-summary-"));
  const summary = join(dir, "summary.md");
  try {
    await assert.rejects(run(process.execPath, [script.pathname], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, TA_OUTCOME: "success", VOLVO_OUTCOME: "failure", BAUER_OUTCOME: "failure" },
    }), (error) => error.code === 1 && /Volvo Trucks, Bauer Built/.test(error.stderr));
    assert.equal(await readFile(summary, "utf8"), "### Vendor updater failures\n- Volvo Trucks\n- Bauer Built\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("successful vendor updater outcomes produce a success summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendor-summary-"));
  const summary = join(dir, "summary.md");
  try {
    await run(process.execPath, [script.pathname], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, TA_OUTCOME: "success", VOLVO_OUTCOME: "success" },
    });
    assert.equal(await readFile(summary, "utf8"), "All vendor updater steps succeeded.\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
