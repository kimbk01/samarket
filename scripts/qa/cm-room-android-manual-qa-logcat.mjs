#!/usr/bin/env node
/**
 * Samsung 실기기 수동 QA 중 structured log 캡처.
 * Usage: node scripts/qa/cm-room-android-manual-qa-logcat.mjs [seconds=120]
 *
 * WebView console → logcat 파이프는 기기/OS마다 불안정합니다.
 * 누락 시 chrome://inspect → WebView → Console 병행.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const SECONDS = Math.max(10, Number(process.argv[2] || 120) || 120);

const REQUIRED = [
  "near_bottom_false",
  "near_bottom_true",
  "new_messages_chip_show",
  "new_messages_chip_hide",
  "keyboard_resize_anchor_keep",
  "composer_height_changed",
  "initial_anchor_bottom",
];

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8" });
}

async function captureLogcat(seconds) {
  return new Promise((resolve) => {
    const lines = [];
    const proc = spawn(ADB, ["logcat", "-v", "brief"], { stdio: ["ignore", "pipe", "pipe"] });
    const onData = (buf) => {
      const chunk = buf.toString();
      for (const line of chunk.split("\n")) {
        if (
          line.includes("chat-room-scroll") ||
          line.includes("chat-room-timeline") ||
          line.includes("Capacitor/Console")
        ) {
          lines.push(line.trim());
        }
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    setTimeout(() => {
      proc.kill("SIGTERM");
      resolve(lines);
    }, seconds * 1000);
  });
}

async function main() {
  const devs = run(ADB, ["devices"]).stdout
    ?.split("\n")
    .filter((l) => l.endsWith("\tdevice"))
    .map((l) => l.split("\t")[0]) ?? [];
  if (devs.length === 0) {
    console.error("[manual-qa-logcat] FAIL — adb device 없음");
    process.exit(1);
  }

  console.log(`[manual-qa-logcat] device=${devs[0]} capture=${SECONDS}s — 수동 QA 진행 중…`);
  run(ADB, ["logcat", "-c"]);

  const logLines = await captureLogcat(SECONDS);
  const events = new Set();
  for (const line of logLines) {
    const m = line.match(/\[chat-room-(?:timeline|scroll)\]\s+(\S+)/);
    if (m) events.add(m[1]);
    const cap = line.match(/chat-room-(?:timeline|scroll)[^\s]*\s+(\S+)/i);
    if (cap) events.add(cap[1]);
  }

  const missing = REQUIRED.filter((e) => !events.has(e));
  const report = {
    captured_at: new Date().toISOString(),
    device: devs[0],
    seconds: SECONDS,
    log_line_count: logLines.length,
    log_events: [...events].sort(),
    required_missing: missing,
    log_sample: logLines.slice(-40),
    note: "logcat 0건이면 chrome://inspect Console 사용. dev server: NEXT_PUBLIC_MESSENGER_PERF_TRACE=1 :3001",
  };

  const outPath = path.join(ROOT, "docs/perf/cm-room-manual-qa-logcat.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[manual-qa-logcat] → ${outPath}`);
  console.log(JSON.stringify({ log_events: report.log_events, required_missing: missing }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
