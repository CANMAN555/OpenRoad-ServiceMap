import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPinFixes, writeData } from "../scripts/lib.mjs";

async function inDataDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "pin-fixes-"));
  const previous = process.cwd();
  try {
    process.chdir(dir);
    await mkdir("data");
    return await fn(dir);
  } finally {
    process.chdir(previous);
    await rm(dir, { recursive: true, force: true });
  }
}

test("valid corrections are applied only when the address still matches", async () => {
  await inDataDir(async () => {
    await writeFile("data/pin-fixes.json", JSON.stringify({
      "brand:1": { address: "1 Main St", lat: 41.25, lon: -95.93, why: "verified" },
    }));
    const stores = [{ id: "1", address: "1 Main St", lat: 40, lon: -94 }, { id: "2", address: "2 Main St", lat: 39, lon: -93 }];
    assert.equal(await applyPinFixes("brand", stores), 1);
    assert.deepEqual(stores.map(({ lat, lon, geo }) => [lat, lon, geo]), [
      [41.25, -95.93, "checked"],
      [39, -93, undefined],
    ]);
  });
});

test("a missing pin-fixes file is the supported no-corrections case", async () => {
  await inDataDir(async () => {
    const warnings = [];
    const warn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      assert.equal(await applyPinFixes("brand", []), 0);
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(warnings, ["No data/pin-fixes.json; pins not corrected"]);
  });
});

test("malformed corrections reject before writeData replaces existing vendor data", async () => {
  await inDataDir(async () => {
    const previous = '{"stores":[{"id":"old"}]}\n';
    await writeFile("data/pin-fixes.json", "{not json");
    await writeFile("data/brand.json", previous);
    await assert.rejects(writeData("brand", { stores: [{ id: "new" }] }, 1), /Could not parse data\/pin-fixes\.json/);
    assert.equal(await readFile("data/brand.json", "utf8"), previous);
  });
});

test("a read error other than missing file is not treated as an empty fix set", async () => {
  await inDataDir(async () => {
    await mkdir("data/pin-fixes.json");
    await assert.rejects(applyPinFixes("brand", []), /Could not read data\/pin-fixes\.json/);
  });
});

test("one malformed correction rejects before any store is changed", async () => {
  await inDataDir(async () => {
    await writeFile("data/pin-fixes.json", JSON.stringify({
      "brand:1": { address: "1 Main St", lat: 41, lon: -95, why: "verified" },
      "brand:2": { address: "2 Main St", lat: "42", lon: -96, why: "invalid latitude type" },
    }));
    const stores = [{ id: "1", address: "1 Main St", lat: 40, lon: -94 }];
    await assert.rejects(applyPinFixes("brand", stores), /Invalid pin correction "brand:2"/);
    assert.deepEqual(stores, [{ id: "1", address: "1 Main St", lat: 40, lon: -94 }]);
  });
});
