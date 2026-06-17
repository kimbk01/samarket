#!/usr/bin/env node
/**
 * Samsung/Android 실기기 QA — adb logcat + APK(local LAN dev server).
 * Usage: node scripts/qa/cm-room-android-device-qa.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r;
}

function lanIp() {
  const r = run("ipconfig", ["getifaddr", "en0"]);
  const ip = r.stdout?.trim();
  if (ip) return ip;
  const r2 = run("ipconfig", ["getifaddr", "en1"]);
  return r2.stdout?.trim() || "127.0.0.1";
}

function parseRoomIdFromPrepare() {
  const r = run(process.execPath, ["scripts/prepare-cm-pass0-e2e.mjs"], { env: { ...process.env, SKIP_CM_STORAGE: "1" } });
  if (r.status !== 0) throw new Error("prepare-cm-pass0-e2e failed");
  const m = r.stdout.match(/E2E_SNAPSHOT_DIAG_ROOM_ID=(\S+)/);
  const jsonLine = r.stdout.split("\n").find((l) => l.includes("E2E_SNAPSHOT_DIAG_ROOM_ID"));
  if (jsonLine) {
    try {
      const j = JSON.parse(jsonLine.slice(jsonLine.indexOf("{")));
      return j.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim() || null;
    } catch {
      /* fallthrough */
    }
  }
  return m?.[1]?.trim() || process.env.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim() || null;
}

function devicesConnected() {
  const r = run(ADB, ["devices"]);
  return (r.stdout || "")
    .split("\n")
    .filter((l) => l.endsWith("\tdevice"))
    .map((l) => l.split("\t")[0]);
}

async function captureLogcat(seconds) {
  return new Promise((resolve) => {
    const lines = [];
    const proc = spawn(ADB, ["logcat", "-v", "brief"], { stdio: ["ignore", "pipe", "pipe"] });
    const onData = (buf) => {
      const chunk = buf.toString();
      for (const line of chunk.split("\n")) {
        if (line.includes("chat-room-timeline") || line.includes("chat-room-scroll")) {
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
  const devs = devicesConnected();
  if (devs.length === 0) {
    console.error("[cm-room-device-qa] FAIL — adb device 없음");
    process.exit(1);
  }
  console.log(`[cm-room-device-qa] devices: ${devs.join(", ")}`);

  const roomId = parseRoomIdFromPrepare();
  if (!roomId) {
    console.error("[cm-room-device-qa] FAIL — room id 없음");
    process.exit(1);
  }
  console.log(`[cm-room-device-qa] roomId=${roomId}`);

  const ip = lanIp();
  const port = process.env.CAPACITOR_DEV_PORT?.trim() || process.env.PORT?.trim() || "3001";
  const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || `http://${ip}:${port}`;
  console.log(`[cm-room-device-qa] capacitor server.url=${serverUrl}`);

  const sync = run(process.execPath, ["scripts/sync-capacitor-vercel.mjs"], {
    env: { ...process.env, CAPACITOR_SERVER_URL: serverUrl },
  });
  if (sync.status !== 0) process.exit(sync.status ?? 1);

  const build = run("bash", ["-lc", "cd android && ./gradlew assembleDebug"], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);

  run(ADB, ["install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk"]);

  run(ADB, ["logcat", "-c"]);
  run(ADB, ["shell", "am", "force-stop", PKG]);
  run(ADB, ["shell", "am", "start", "-n", `${PKG}/.MainActivity`]);
  await new Promise((r) => setTimeout(r, 4000));

  const roomPath = `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
  run(ADB, [
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    `dibay://app${roomPath}`,
    PKG,
  ]);

  console.log("[cm-room-device-qa] logcat 45s… (방 수동 로그인 필요 시 앱에서 로그인 후 재진입)");
  const logLines = await captureLogcat(45);

  const events = new Set();
  for (const line of logLines) {
    const m = line.match(/\[chat-room-(?:timeline|scroll)\]\s+(\S+)/);
    if (m) events.add(m[1]);
  }

  const report = {
    device: devs[0],
    serverUrl,
    roomId,
    log_line_count: logLines.length,
    log_events: [...events],
    log_sample: logLines.slice(0, 20),
    note: "WebView console → logcat은 Chromium 태그에 따라 누락될 수 있음. chrome://inspect 병행 권장.",
  };

  const outPath = path.join(ROOT, "docs/perf/cm-room-device-qa-report.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[cm-room-device-qa] report → ${outPath}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
