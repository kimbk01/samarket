#!/usr/bin/env node
/**
 * Delivery/store checksheet — 구조 lock (배민급 회귀 방지).
 * npm run verify:store-perf-checksheet-contract
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

function run(script) {
  const r = spawnSync("npm", ["run", script], { cwd: root, encoding: "utf8", stdio: "pipe" });
  if (r.status !== 0) {
    console.error(`verify-store-perf-checksheet-contract: ${script} FAILED\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
}

run("verify:stores-home-hub-contract");
run("verify:store-cart-sheet-contract");
console.log("verify-store-perf-checksheet-contract: ok");
