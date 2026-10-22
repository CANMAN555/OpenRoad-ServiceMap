import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const script = new URL("../scripts/report-vendor-update-failures.mjs", import.meta.url);
const KEYS = ["TA", "FREIGHTLINER", "VOLVO", "BOSS", "UTILITY", "PRESTIGE", "TIMPTE", "THERMOKING", "CARRIER", "FLEETPRIDE", "STM", "POMPS", "BAUER"];
const allSucceeded = Object.fromEntries(KEYS.map((k) => [`${k}_OUTCOME`, "success"]));

test("vendor updater failures are listed and make the workflow fail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendor-summary-"));
  const summary = join(dir, "summary.md");
  try {
    await assert.rejects(run(process.execPath, [script.pathname], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, ...allSucceeded, VOLVO_OUTCOME: "failure", BAUER_OUTCOME: "failure" },
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
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, ...allSucceeded },
    });
    assert.equal(await readFile(summary, "utf8"), "All vendor updater steps succeeded.\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skipped, cancelled or missing outcomes are not reported as success", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendor-summary-"));
  const summary = join(dir, "summary.md");
  const env = { ...process.env, GITHUB_STEP_SUMMARY: summary, ...allSucceeded, BOSS_OUTCOME: "skipped", STM_OUTCOME: "cancelled" };
  delete env.POMPS_OUTCOME;
  try {
    await assert.rejects(run(process.execPath, [script.pathname], { env }), (error) => error.code === 1);
    assert.equal(await readFile(summary, "utf8"), "### Vendor updater failures\n- Boss Truck Shops (skipped)\n- Southern Tire Mart (cancelled)\n- Pomp's Tire (no outcome)\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
