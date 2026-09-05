#!/usr/bin/env node
/**
 * CUT I — local-only Pre-launch Reset safe fixture.
 *
 * Default ORIGIN: http://127.0.0.1:3000
 * Aborts if ORIGIN looks like production / vercel.app.
 *
 * Proves gate contract via vitest (resolvePrelaunchResetEnvGate + I-P0-11 Storage/Auth).
 * Storage/Auth phases are IMPLEMENTED for explicit objects / safe manual.local members.
 * Production execute remains ALWAYS BLOCKED — this script never runs Production deletes.
 *
 * Usage:
 *   node scripts/qa/admin-cut-i-reset-safe-fixture-local.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || process.env.ORIGIN || "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);
const OUT_DIR = resolve(process.cwd(), "docs/perf/admin-cut-i-production-e2e");
const REPORT_JSON = resolve(OUT_DIR, "reset-safe-fixture-local.json");

function looksProduction(origin) {
  const o = origin.toLowerCase();
  if (o.includes("127.0.0.1") || o.includes("localhost") || o.includes("[::1]")) return false;
  return o.includes("vercel.app") || o.includes("samarket.com") || /^https?:\/\/(?!127\.|localhost)/i.test(origin);
}

async function fetchOk(url, signal) {
  try {
    const res = await fetch(url, { method: "GET", signal, redirect: "manual" });
    return { reachable: true, status: res.status };
  } catch {
    return { reachable: false };
  }
}

async function fetchJson(url, { method, body }) {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, json: { error: String(e?.message || e) } };
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const report = {
    title: "CUT I — Pre-launch Reset safe fixture (LOCAL ONLY)",
    origin: ORIGIN,
    startedAt: new Date().toISOString(),
    aborted: false,
    vitest: null,
    httpOptional: null,
    storagePhase: "IMPLEMENTED",
    authPhase: "IMPLEMENTED_EXPLICIT_SAFE_MEMBER",
    final: "PASS",
    notes: [
      "CUT I-P0-11: Storage + Auth phases implemented for explicit entity refs / safe manual.local members.",
      "Production execute remains ALWAYS BLOCKED. This fixture does not run destructive Production deletes.",
    ],
  };

  if (looksProduction(ORIGIN)) {
    report.aborted = true;
    report.final = "BLOCKED";
    report.reason = `ORIGIN looks like production/remote (${ORIGIN}) — refuse to run local reset fixture`;
    writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
    console.error(report.reason);
    console.log(JSON.stringify({ reportPath: REPORT_JSON, final: report.final }, null, 2));
    process.exit(2);
  }

  const testFiles = [
    "lib/admin/__tests__/admin-real-operation-cut-h-prelaunch-reset.test.ts",
    "lib/admin/__tests__/admin-real-operation-cut-i-p0-11-reset-storage-auth.test.ts",
  ];
  for (const testFile of testFiles) {
    if (!existsSync(resolve(process.cwd(), testFile))) {
      report.vitest = { status: "FAIL", reason: `missing ${testFile}` };
      report.final = "FAIL";
      writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ reportPath: REPORT_JSON, final: report.final }, null, 2));
      process.exit(1);
    }
  }

  const vt = spawnSync("npx", ["vitest", "run", ...testFiles], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    cwd: process.cwd(),
    env: process.env,
  });
  const out = `${vt.stdout || ""}\n${vt.stderr || ""}`;
  const pass = vt.status === 0;

  report.vitest = {
    status: pass ? "PASS" : "FAIL",
    exitCode: vt.status,
    command: `npx vitest run ${testFiles.join(" ")}`,
    snippet: out.slice(-3000),
    covers: [
      "resolvePrelaunchResetEnvGate — production execute fail-closed",
      "production dry-run requires PRELAUNCH_RESET_PRODUCTION_DRY_RUN opt-in",
      "local execute requires PRELAUNCH_RESET_ENABLED",
      "typed confirmation plan-bound",
      "I-P0-11 Storage/Auth plan+execute + preserve contracts",
    ],
  };

  let httpProbe = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const health = await fetchOk(`${ORIGIN}/admin`, ctrl.signal);
    clearTimeout(t);
    if (health.reachable) {
      const dry = await fetchJson(`${ORIGIN}/api/admin/prelaunch-reset/dry-run`, {
        method: "POST",
        body: { preset: "TEST_CONTENT_ONLY" },
      });
      const exec = await fetchJson(`${ORIGIN}/api/admin/prelaunch-reset/execute`, {
        method: "POST",
        body: {
          preset: "TEST_CONTENT_ONLY",
          planId: "local-fixture",
          expectedHash: "local-fixture",
          typedConfirmation: "PROBE",
        },
      });
      httpProbe = {
        serverReachable: true,
        dryRun: { status: dry.status, error: dry.json?.error },
        execute: { status: exec.status, error: exec.json?.error },
        note: "Unauthenticated local HTTP probe only — auth gate expected (401/403).",
      };
    } else {
      httpProbe = { serverReachable: false, note: "Local server not up — vitest-only fixture." };
    }
  } catch (e) {
    httpProbe = { serverReachable: false, error: String(e?.message || e) };
  }

  report.httpOptional = httpProbe;
  report.final = pass ? "PASS" : "FAIL";
  report.finishedAt = new Date().toISOString();
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        reportPath: REPORT_JSON,
        final: report.final,
        vitest: report.vitest.status,
        storagePhase: report.storagePhase,
        authPhase: report.authPhase,
      },
      null,
      2
    )
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
