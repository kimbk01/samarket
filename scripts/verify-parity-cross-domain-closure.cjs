#!/usr/bin/env node
/**
 * Master order 5 — 횡단 마감 구조 lock.
 * npm run verify:parity-cross-domain-closure
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  if (r.status !== 0) {
    console.error(`verify-parity-cross-domain-closure: ${cmd} ${args.join(" ")} FAILED\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
}

run("npm", ["run", "verify:parity-gates"]);
run("npm", ["run", "verify:trade-perf-checksheet-contract"]);
run("npm", ["run", "verify:store-perf-checksheet-contract"]);
run("node", ["scripts/aggregate-parity-cross-domain-audit.mjs"]);
console.log("verify-parity-cross-domain-closure: ok");
