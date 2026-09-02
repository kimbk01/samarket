#!/usr/bin/env node
/**
 * Support CUT 3 — full pipeline orchestrator (preflight → apply → verify → runtime → report).
 * Usage: node --env-file=.env.local scripts/qa/support-cut3-run-pipeline.mjs
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildConnectionString,
  loadEnvLocal,
  migrationAppliedViaRest,
  tableExistsViaRest,
  SUPPORT_TABLES,
  ORIGIN,
} from "./support-cut3-lib.mjs";

const REPORT_PATH = resolve(process.cwd(), "docs/support-center/support-cut3-runtime-close-report.json");

function runNpm(script) {
  const r = spawnSync("npm", ["run", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    script,
    exit: r.status ?? 1,
    stdout: r.stdout?.trim() || "",
    stderr: r.stderr?.trim() || "",
  };
}

function loadReport() {
  if (!existsSync(REPORT_PATH)) {
    return {
      run_id: `cut3-pipeline-${Date.now()}`,
      origin: ORIGIN,
      at: new Date().toISOString(),
      checklist: {},
      pipeline: {},
      SUPPORT_AUTHORITY: "NOT_CLOSED",
      PRODUCTION: "NOT_PROVEN",
    };
  }
  return JSON.parse(readFileSync(REPORT_PATH, "utf8"));
}

function saveReport(report) {
  mkdirSync(resolve(process.cwd(), "docs/support-center"), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
}

async function probeDbViaRest(report) {
  const tables = {};
  for (const t of SUPPORT_TABLES) {
    tables[t] = (await tableExistsViaRest(t)) ? "EXISTS" : "ABSENT";
  }
  const allExist = Object.values(tables).every((v) => v === "EXISTS");
  report.checklist.MIGRATION = allExist ? "PASS" : "NOT_PROVEN";
  report.checklist.DB_TABLES = allExist ? "PASS" : "FAIL";
  report.checklist.RLS = "NOT_PROVEN";
  report.checklist.REALTIME_PUBLICATION = "NOT_PROVEN";
  report.rest_table_probe = tables;
  report.migration_inferred = await migrationAppliedViaRest();
  return allExist;
}

async function main() {
  loadEnvLocal();
  const report = loadReport();
  report.pipeline = report.pipeline || {};
  report.at = new Date().toISOString();

  const hasPg = Boolean(buildConnectionString());
  report.pipeline.pg_credentials = hasPg ? "present" : "missing";

  // Phase 0 — preflight
  const preflight = runNpm("qa:support-cut3-migration-preflight");
  report.pipeline.preflight = { exit: preflight.exit, stdout: preflight.stdout.slice(-2000) };
  if (preflight.exit !== 0 && !hasPg) {
    report.checklist.MIGRATION = "NOT_PROVEN";
    report.checklist.DB_TABLES = "NOT_PROVEN";
    report.pipeline.preflight_blocker = "missing_db_credentials";
    await probeDbViaRest(report);
  }

  // Phase 1 — apply (only if preflight PASS or already applied via REST)
  if (hasPg && preflight.exit === 0) {
    const apply = runNpm("support:apply-cases-ssot-migration");
    report.pipeline.apply = { exit: apply.exit, stdout: apply.stdout.slice(-2000) };
    if (apply.exit === 0) {
      const post = runNpm("qa:support-cut3-migration-post-apply");
      report.pipeline.post_apply = { exit: post.exit, stdout: post.stdout.slice(-2000) };
      try {
        const parsed = JSON.parse(post.stdout);
        report.MIGRATION = parsed.MIGRATION;
        report.DB_TABLES = parsed.DB_TABLES;
        report.RLS = parsed.RLS;
        report.REALTIME_PUBLICATION = parsed.REALTIME_PUBLICATION;
        report.checklist.MIGRATION = parsed.MIGRATION;
        report.checklist.DB_TABLES = parsed.DB_TABLES;
        report.checklist.RLS = parsed.RLS;
        report.checklist.REALTIME_PUBLICATION = parsed.REALTIME_PUBLICATION;
      } catch {
        /* parse in final-report */
      }
    }
  } else if (!hasPg) {
    report.pipeline.apply = { skipped: true, reason: "missing_db_credentials" };
    await probeDbViaRest(report);
  }

  // Phase 2 — authority (always attempt — proves deploy + API)
  const authority = runNpm("qa:support-cut3-authority-runtime");
  report.pipeline.authority = { exit: authority.exit };
  if (existsSync(REPORT_PATH)) {
    Object.assign(report, JSON.parse(readFileSync(REPORT_PATH, "utf8")));
    report.pipeline = { ...report.pipeline, authority: { exit: authority.exit } };
  }

  // Phase 3 — realtime
  const realtime = runNpm("qa:support-cut3-realtime-runtime");
  report.pipeline.realtime = { exit: realtime.exit };
  if (existsSync(REPORT_PATH)) {
    const merged = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
    report.checklist = { ...report.checklist, ...merged.checklist };
    report.REALTIME = merged.REALTIME;
  }

  // Phase 4 — FAB smoke
  const fab = runNpm("qa:support-cut3-fab-surface-smoke");
  report.pipeline.fab = { exit: fab.exit };
  if (existsSync(REPORT_PATH)) {
    const merged = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
    report.checklist = { ...report.checklist, ...merged.checklist };
    report.fab_surface_detail = merged.fab_surface_detail;
  }

  // Phase 5 — device QA (NOT_PROVEN in CI)
  report.checklist.IOS = report.checklist.IOS || { status: "NOT_PROVEN", note: "no_ios_device_in_ci" };
  report.checklist.ANDROID_GESTURE =
    report.checklist.ANDROID_GESTURE || { status: "NOT_PROVEN", note: "no_android_device_in_ci" };
  report.checklist.ANDROID_3_BUTTON =
    report.checklist.ANDROID_3_BUTTON || { status: "NOT_PROVEN", note: "no_android_device_in_ci" };
  report.checklist.MOBILE_WEB =
    report.checklist.MOBILE_WEB || { status: "NOT_PROVEN", note: "playwright_mobile_only_partial" };
  report.checklist.ADMIN_DESKTOP =
    report.checklist.ADMIN_DESKTOP || { status: "NOT_PROVEN", note: "no_admin_desktop_device_in_ci" };

  runNpm("qa:support-cut3-final-report");
  if (existsSync(REPORT_PATH)) {
    const final = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
    Object.assign(report, final);
  }

  report.PRODUCTION = "NOT_PROVEN";
  report.deploy_blocker =
    report.stopped_at === "T1" && report.stop_evidence?.http === 404
      ? "support_api_not_deployed_to_production"
      : report.pipeline.preflight_blocker || null;

  saveReport(report);
  console.log(
    JSON.stringify(
      {
        SUPPORT_AUTHORITY: report.SUPPORT_AUTHORITY,
        REALTIME: report.REALTIME,
        PRODUCTION: report.PRODUCTION,
        deploy_blocker: report.deploy_blocker,
        pipeline: report.pipeline,
      },
      null,
      2
    )
  );
  process.exit(report.SUPPORT_AUTHORITY === "CLOSED" ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "PIPELINE", error: String(e?.message || e) }));
  process.exit(2);
});
