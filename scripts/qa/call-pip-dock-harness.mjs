#!/usr/bin/env node
/**
 * Call PiP/Dock QA harness — phase 1: Vitest probes + usage/report.
 *
 * Usage:
 *   node scripts/qa/call-pip-dock-harness.mjs
 *   node scripts/qa/call-pip-dock-harness.mjs --scenario unit-probes
 *   node scripts/qa/call-pip-dock-harness.mjs --scenario structural
 *   node scripts/qa/call-pip-dock-harness.mjs --scenario full-dock-cycle --iterations 100
 *
 * Browser/CDP (phase 2 — 수동·Playwright):
 *   CALL_QA_SESSION_ID=<uuid> npx playwright test tests/e2e/call-pip-dock-stability.spec.ts
 *
 * APK loop (phase 3 — Maestro/adb):
 *   QA_DEVICE_SERIAL=<serial> npm run qa:call-pip-dock -- --scenario apk-smoke --iterations 20
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const scenario = readArg("--scenario")?.trim() || "unit-probes";
const iterations = Math.max(1, Number.parseInt(readArg("--iterations") || "1", 10) || 1);
const jsonOut = hasFlag("--json");

const PROBE_TEST = "lib/community-messenger/__tests__/call-pip-dock-probes.test.ts";
const RELATED_TESTS = [
  PROBE_TEST,
  "lib/community-messenger/__tests__/call-android-os-pip-layout.test.ts",
  "lib/community-messenger/__tests__/call-dock-presentation.test.ts",
  "lib/community-messenger/__tests__/call-presentation-ownership.test.ts",
];

const REQUIRED_FILES = [
  "lib/community-messenger/qa/call-pip-dock-probes.ts",
  PROBE_TEST,
  "scripts/qa/call-pip-dock-harness.mjs",
  "components/layout/providers/GlobalCallDockHost.tsx",
  "components/community-messenger/call-ui/AndroidOsPipSafeCallView.tsx",
];

function runVitest(paths) {
  const r = spawnSync("npx", ["vitest", "run", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    ok: r.status === 0,
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function structuralCheck() {
  const missing = REQUIRED_FILES.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  return { ok: missing.length === 0, missing };
}

function printUsage() {
  console.log(`Call PiP/Dock QA harness

Scenarios:
  unit-probes       Run Vitest probe + presentation SSOT tests (default)
  structural        Verify probe/harness files exist
  full-dock-cycle   Alias for unit-probes (iterations recorded in report; browser loop = phase 2)
  all               structural + unit-probes

Options:
  --iterations N    Target loop count for report metadata (default 1)
  --json            Print JSON verdict only

Phase 2 (Playwright — not run by this script):
  CALL_QA_SESSION_ID=<uuid> npx playwright test tests/e2e/call-pip-dock-stability.spec.ts

Phase 3 (APK — not run by this script):
  QA_DEVICE_SERIAL=<serial> node scripts/qa/p4-active-call-adb-qa.mjs
  + window.__dibayCallPipDockProbes in WebView CDP
`);
}

function buildReport(extra = {}) {
  return {
    scenario,
    iterations,
    pass: extra.pass ?? 0,
    fail: extra.fail ?? 0,
    maxPositionDeltaPx: extra.maxPositionDeltaPx ?? 0,
    videoRecreateCount: extra.videoRecreateCount ?? 0,
    failures: extra.failures ?? [],
    phase: extra.phase ?? "vitest-probes",
    ...extra,
  };
}

function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    process.exit(0);
  }

  const failures = [];
  let pass = 0;
  let fail = 0;

  if (scenario === "structural" || scenario === "all") {
    const structural = structuralCheck();
    if (structural.ok) {
      pass += 1;
    } else {
      fail += 1;
      failures.push(`missing files: ${structural.missing.join(", ")}`);
    }
  }

  if (scenario === "unit-probes" || scenario === "full-dock-cycle" || scenario === "all") {
    const vitest = runVitest(RELATED_TESTS);
    if (vitest.ok) {
      pass += 1;
    } else {
      fail += 1;
      failures.push(`vitest exit ${vitest.status}`);
      if (vitest.stderr.trim()) failures.push(vitest.stderr.trim().split("\n").slice(-3).join(" | "));
    }
  }

  if (!["unit-probes", "structural", "full-dock-cycle", "all", "apk-smoke"].includes(scenario)) {
    fail += 1;
    failures.push(`unknown scenario: ${scenario}`);
  }

  if (scenario === "apk-smoke") {
    failures.push("apk-smoke requires phase 3 Maestro/adb loop — use p4-active-call-adb-qa + CDP probes");
    fail += 1;
  }

  const report = buildReport({
    pass,
    fail,
    failures,
    ok: fail === 0,
    note:
      scenario === "full-dock-cycle"
        ? `${iterations}-iteration browser loop is phase 2; this run validates probe contract only`
        : undefined,
  });

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("[call-pip-dock-harness]", JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exit(1);
    }
  }
}

main();
