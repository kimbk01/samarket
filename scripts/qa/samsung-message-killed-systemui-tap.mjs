#!/usr/bin/env node
/**
 * Future AUTHORIZED-ONLY entry for Samsung MESSAGE KILLED SystemUI tap.
 *
 * Uses SINGLE hierarchy SSOT from:
 *   scripts/qa/lib/samsung-message-killed-systemui-tap-harness.mjs
 *
 * DO NOT run without Owner approval for a new MESSAGE KILLED runtime.
 * This file is intentionally a thin wrapper; it does not send messages by itself.
 *
 * Usage (only when Owner authorizes runtime):
 *   node scripts/qa/samsung-message-killed-systemui-tap.mjs \
 *     --serial RFCY40PY2CA \
 *     --marker MKFC-... \
 *     --hierarchy /abs/path/shade-message-killed.xml \
 *     [--expected-title 메인관리자] \
 *     [--execute-tap]
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  captureResolveAndTapMessageChild,
  resolveExactMessageRow,
} from "./lib/samsung-message-killed-systemui-tap-harness.mjs";

function usage() {
  console.error(`Usage:
  # Resolve only against an already-captured hierarchy (same-runtime SSOT file):
  node scripts/qa/samsung-message-killed-systemui-tap.mjs --marker MARKER --hierarchy /abs/file.xml

  # Capture once + resolve (+ optional tap) under ONE hierarchyPath:
  node scripts/qa/samsung-message-killed-systemui-tap.mjs --serial SERIAL --marker MARKER --hierarchy /abs/file.xml [--execute-tap]

Forbidden: dual *-msg.xml / *-pre-tap.xml authority; textContains(알림|dibay|디바이).`);
}

function parseArgs(argv) {
  const out = { executeTap: false, capture: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute-tap") out.executeTap = true;
    else if (a === "--capture") out.capture = true;
    else if (a === "--serial") out.serial = argv[++i];
    else if (a === "--marker") out.marker = argv[++i];
    else if (a === "--hierarchy") out.hierarchy = argv[++i];
    else if (a === "--expected-title") out.expectedTitle = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown arg ${a}`);
  }
  return out;
}

function adb(args) {
  const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
  const r = spawnSync(ADB, args, { encoding: "utf8", maxBuffer: 40e6 });
  return {
    status: r.status ?? 1,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (!args.marker || !args.hierarchy) {
    usage();
    process.exit(2);
  }
  const hierarchyPath = path.resolve(args.hierarchy);
  if (!path.isAbsolute(hierarchyPath)) {
    console.error(JSON.stringify({ ok: false, reason: "hierarchy must resolve absolute" }));
    process.exit(2);
  }

  if (args.capture) {
    if (!args.serial) {
      console.error(JSON.stringify({ ok: false, reason: "serial required for --capture" }));
      process.exit(2);
    }
    const result = captureResolveAndTapMessageChild({
      adb,
      serial: args.serial,
      localHierarchyPath: hierarchyPath,
      exactMarker: args.marker,
      expectedTitle: args.expectedTitle,
      executeTap: args.executeTap === true,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  // Resolve against existing same-runtime hierarchyPath (no second dump).
  const resolve = resolveExactMessageRow({
    hierarchyPath,
    exactMarker: args.marker,
    expectedTitle: args.expectedTitle,
  });
  console.log(JSON.stringify({ ok: resolve.ok, resolve }, null, 2));
  process.exit(resolve.ok ? 0 : 1);
}

main();
