#!/usr/bin/env node
/**
 * Production server for prod_same_region measurement (no dev:measure / HMR).
 * Usage: npm run build && npm run start:prod-measure
 */
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const env = {
  ...process.env,
  NODE_ENV: "production",
  SAMARKET_PROD_PERF_MEASURE: "1",
  NEXT_PUBLIC_SAMARKET_PROD_PERF_MEASURE: "1",
};

if (!env.OWNER_DASHBOARD_PERF_ENV) {
  const base = (env.SAMARKET_BASE_URL ?? "http://127.0.0.1:3000").toLowerCase();
  if (!base.includes("localhost") && !base.includes("127.0.0.1")) {
    env.OWNER_DASHBOARD_PERF_ENV = "prod_same_region";
    env.SAMARKET_DEPLOYMENT_SAME_REGION = "1";
  }
}

console.info("[start-prod-measure] SAMARKET_PROD_PERF_MEASURE=1 — logs: perf-real-api-cost, cm-unread-deep-breakdown, owner-dashboard-waterfall");
console.info("[start-prod-measure] Redirect stdout to file: SAMARKET_PROD_PERF_LOG_FILE=./.perf-prod-measure.log npm run start:prod-measure");

const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "start"], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
