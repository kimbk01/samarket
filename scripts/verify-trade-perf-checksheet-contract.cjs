#!/usr/bin/env node
/**
 * Trade+community checksheet — 구조 lock (당근급 회귀 방지).
 * npm run verify:trade-perf-checksheet-contract
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

function run(script) {
  const r = spawnSync("npm", ["run", script], { cwd: root, encoding: "utf8", stdio: "pipe" });
  if (r.status !== 0) {
    console.error(`verify-trade-perf-checksheet-contract: ${script} FAILED\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
}

run("verify:trade-hot-path-contract");
run("verify:trade-primary-tab-transition");
console.log("verify-trade-perf-checksheet-contract: ok");
