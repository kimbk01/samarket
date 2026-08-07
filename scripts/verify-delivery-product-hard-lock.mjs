#!/usr/bin/env node
/**
 * DIBAY Delivery Product HARD LOCK — run all frozen contract gates.
 * @see docs/dibay-delivery-product-hard-lock.md
 */
import { spawnSync } from "node:child_process";

const gates = [
  "verify:store-order-status-writer-authority",
  "verify:store-order-create-atomicity",
  "verify:store-order-recovery-integrity",
  "verify:store-order-structure-optimization",
  "verify:store-order-repo-cleanup",
];

let failed = 0;
for (const g of gates) {
  console.log(`\n--- ${g} ---`);
  const r = spawnSync("npm", ["run", g], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    failed += 1;
    console.error(`FAIL: ${g}`);
  }
}

if (failed) {
  console.error(`\nFAIL: delivery-product-hard-lock (${failed}/${gates.length} gates failed)`);
  process.exit(1);
}
console.log(`\nPASS: delivery-product-hard-lock (${gates.length}/${gates.length})`);
process.exit(0);
