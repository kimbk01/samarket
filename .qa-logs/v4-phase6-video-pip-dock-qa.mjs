#!/usr/bin/env node
/**
 * Call V4 Phase 6 — 3-platform QA scaffold (Android / iOS / Web).
 * Full manual matrix: docs/call-v4-phase6-qa.md
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), ".qa-logs", "v4-phase6-video-pip-dock");
mkdirSync(OUT_DIR, { recursive: true });

const sharedMarkers = [
  "local_video_publish",
  "remote_video_track_ready",
  "video_upgrade_applied",
  "presentation_capability_ready",
  "presentation_dock_minimize",
  "dock_expand",
];

const platformSuites = {
  android: {
    requiredDevices: 2,
    markers: [
      ...sharedMarkers,
      "android_native_active_session_started",
      "call_presentation_android_os_pip",
    ],
    scenarios: ["video_out_in", "audio_to_video_upgrade", "os_pip", "floating_dock", "g1_g5_regression"],
  },
  ios: {
    requiredDevices: 2,
    markers: [
      ...sharedMarkers,
      "ios_presentation_capability",
      "ios_background_dock_fallback",
      "ios_route_leave_floating_dock",
    ],
    scenarios: ["video_out_in", "audio_to_video_upgrade", "route_leave_dock", "background_restore", "cleanup"],
  },
  web: {
    requiredDevices: 0,
    markers: [
      ...sharedMarkers,
      "web_tab_hidden_preserve_agora",
      "web_route_leave_floating_dock",
    ],
    scenarios: ["video_out_in", "audio_to_video_upgrade", "route_leave", "tab_hidden", "no_agora_rejoin"],
  },
};

function runAdb(args) {
  return spawnSync("adb", args, { encoding: "utf8" });
}

const adbDevices = (runAdb(["devices"]).stdout || "")
  .split("\n")
  .filter((line) => line.includes("\tdevice"))
  .map((line) => line.split("\t")[0]);

const report = {
  bundle: "call-v4-phase6-video-pip-dock",
  doc: "docs/call-v4-phase6-qa.md",
  at: new Date().toISOString(),
  adbDevices,
  suites: platformSuites,
  pass: {
    android: adbDevices.length >= platformSuites.android.requiredDevices,
    ios: "manual_usb_required",
    web: "manual_browser_required",
  },
  note: "Automated gate checks device count only. Execute platform matrices manually before Phase 6 sign-off.",
};

writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass.android ? 0 : 1);
