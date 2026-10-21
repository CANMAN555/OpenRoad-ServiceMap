import { appendFile } from "node:fs/promises";

const updaters = [
  ["TA, Petro and TA Express", "TA_OUTCOME"],
  ["Freightliner", "FREIGHTLINER_OUTCOME"],
  ["Volvo Trucks", "VOLVO_OUTCOME"],
  ["Boss Truck Shops", "BOSS_OUTCOME"],
  ["Utility Trailer", "UTILITY_OUTCOME"],
  ["Prestige Trailers", "PRESTIGE_OUTCOME"],
  ["Timpte", "TIMPTE_OUTCOME"],
  ["Thermo King", "THERMOKING_OUTCOME"],
  ["Carrier Transicold", "CARRIER_OUTCOME"],
  ["FleetPride", "FLEETPRIDE_OUTCOME"],
  ["Southern Tire Mart", "STM_OUTCOME"],
  ["Pomp's Tire", "POMPS_OUTCOME"],
  ["Bauer Built", "BAUER_OUTCOME"],
];
// Anything but "success" (failure, cancelled, skipped, or no outcome at all) means that source was not refreshed.
const failed = updaters.filter(([, key]) => process.env[key] !== "success")
  .map(([name, key]) => process.env[key] === "failure" ? name : `${name} (${process.env[key] || "no outcome"})`);

if (failed.length) {
  const list = failed.map((name) => `- ${name}`).join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Vendor updater failures\n${list}\n`);
  console.error(`::error::Vendor updater failures: ${failed.join(", ")}`);
  process.exitCode = 1;
} else if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, "All vendor updater steps succeeded.\n");
}
