#!/usr/bin/env node
/**
 * CUT G — Tablet Landscape hard-lock gate (artifact + anchor).
 * Does NOT replace runtime geometry probe.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`OK: ${msg}`);

const anchor = "lib/admin/admin-real-operation-cut-g-tablet-landscape-hard-lock.ts";
const doc = "docs/dibay-admin-real-operation-cut-g-tablet-landscape-hard-lock.md";
const probe = "scripts/qa/admin-cut-g-tablet-landscape-runtime.mjs";
const report = "docs/perf/admin-cut-g-tablet-landscape-runtime/cut-g-report.json";

for (const f of [anchor, doc, probe, report]) {
  if (!existsSync(resolve(root, f))) fail(`missing ${f}`);
}

const a = read(anchor);
for (const s of [
  "ADMIN_REAL_OPERATION_CUT_G_LOCKED = true",
  'token: "--sam-bp-lg-min"',
  "width: 1024",
  "height: 768",
  "codeReadyIsNotPass: true",
  'cutFPlacementMapActiveEligibility: "DEFERRED_TO_CUT_I"',
  'financeProductionE2E: "NOT_PROVEN"',
]) {
  if (!a.includes(s)) fail(`anchor missing: ${s}`);
}

const r = JSON.parse(read(report));
if (r.cut !== "CUT_G_TABLET_LANDSCAPE_RUNTIME_CLOSE") fail("report cut id mismatch");
if (r.viewportAuthority?.tabletLandscape?.width !== 1024) fail("report viewport width");
if (r.productionClaimForbidden !== true) fail("must forbid Production claim");
if (r.routes?.T1_SHELL_ACTION_CENTER?.geometry?.pageOverflowX === true) {
  fail("T1 document overflow");
}
if (r.carry?.CUT_F_P1_PLACEMENT_MAP_ACTIVE_ELIGIBILITY !== "DEFERRED_TO_CUT_I") {
  fail("CUT F P1 must remain deferred to CUT I");
}

ok("CUT G Tablet Landscape hard lock (artifact present; runtime verdict in report)");
process.exit(0);
