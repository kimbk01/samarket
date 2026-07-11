#!/usr/bin/env node
/**
 * iOS voice regression suite — incoming + outgoing, 5 runs each (default).
 *
 * Run:
 *   node .qa-logs/ios-voice-regression-suite.mjs [runsPerScenario=5] [waitIncomingSec=90] [waitOutgoingSec=120]
 *
 * Runs ios-incoming-voice-regression.mjs then ios-outgoing-voice-regression.mjs sequentially.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = process.argv[2] ?? "5";
const WAIT_IN = process.argv[3] ?? "90";
const WAIT_OUT = process.argv[4] ?? "120";

function runNode(script, args) {
  const r = spawnSync("node", [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit",
    env: process.env,
  });
  return r.status ?? 1;
}

const incomingScript = path.join(ROOT, ".qa-logs", "ios-incoming-voice-regression.mjs");
const outgoingScript = path.join(ROOT, ".qa-logs", "ios-outgoing-voice-regression.mjs");

console.log("[ios-voice-suite] === INCOMING (human: iPhone Accept) ===");
const incomingCode = runNode(incomingScript, [RUNS, WAIT_IN]);

console.log("\n[ios-voice-suite] === OUTGOING (automated dial + Android accept) ===");
const outgoingCode = runNode(outgoingScript, [RUNS, WAIT_OUT]);

const incomingSummary = JSON.parse(
  fs.readFileSync(path.join(ROOT, ".qa-logs", "ios-incoming-voice-regression", "summary.json"), "utf8"),
);

const outgoingSummaryPath = path.join(
  ROOT,
  ".qa-logs",
  "ios-outgoing-voice-regression",
  "summary.json",
);
let outgoingSummary;
let outgoingSkipped = false;
if (fs.existsSync(outgoingSummaryPath)) {
  outgoingSummary = JSON.parse(fs.readFileSync(outgoingSummaryPath, "utf8"));
} else {
  outgoingSkipped = true;
  console.log("[ios-voice-suite] 발신 SKIP (summary.json 없음)");
  outgoingSummary = {
    skipped: true,
    pass: 0,
    fail: 0,
    stable: true,
    reason: "summary_missing",
  };
}

const suite = {
  at: new Date().toISOString(),
  runsPerScenario: Number(RUNS),
  incoming: incomingSummary,
  outgoing: outgoingSummary,
  outgoingSkipped,
  overallPass: incomingCode === 0 && (outgoingSkipped || outgoingCode === 0),
  overallStable: incomingSummary.stable && outgoingSummary.stable,
};
const outPath = path.join(ROOT, ".qa-logs", "ios-voice-regression-suite", "summary.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(suite, null, 2));

console.log("\n[ios-voice-suite] DONE", {
  incoming: { pass: incomingSummary.pass, fail: incomingSummary.fail, stable: incomingSummary.stable },
  outgoing: outgoingSkipped
    ? "SKIP"
    : { pass: outgoingSummary.pass, fail: outgoingSummary.fail, stable: outgoingSummary.stable },
  overallPass: suite.overallPass,
  summary: outPath,
});

process.exit(suite.overallPass ? 0 : 1);
