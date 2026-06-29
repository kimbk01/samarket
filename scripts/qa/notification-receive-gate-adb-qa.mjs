#!/usr/bin/env node
/**
 * ADB QA — receiveReady=false blocks Native Runtime handleIncoming.
 *
 * Requires debug APK on connected device. Revokes POST_NOTIFICATIONS, fires debug incoming,
 * asserts incoming_blocked_notification_permission and absence of native voice incoming_fcm log.
 *
 * Usage:
 *   node scripts/qa/notification-receive-gate-adb-qa.mjs
 *   NOTIF_GATE_SERIAL=RFCY40PY2CA node scripts/qa/notification-receive-gate-adb-qa.mjs
 *   NOTIF_GATE_SKIP_REVOKE=1 node scripts/qa/notification-receive-gate-adb-qa.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const SERIAL = process.env.NOTIF_GATE_SERIAL?.trim() || "";
const SKIP_REVOKE = process.env.NOTIF_GATE_SKIP_REVOKE === "1";
const OUT = path.join(ROOT, "docs/perf/notification-receive-gate-adb-qa.log");
const OUT_JSON = path.join(ROOT, "docs/perf/notification-receive-gate-adb-qa-report.json");

const TAGS = "DIBAY_FCM DIBAY_CALL NativeVoiceCall NativeVideoCall";

function adb(...args) {
  const base = SERIAL ? [ADB, "-s", SERIAL, ...args] : [ADB, ...args];
  const r = spawnSync(base[0], base.slice(1), { encoding: "utf8" });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
}

function log(line) {
  const msg = `[notification-receive-gate-qa] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT, msg + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function devices() {
  const { stdout } = adb("devices");
  return stdout
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p[1] === "device")
    .map((p) => p[0]);
}

async function main() {
  fs.writeFileSync(OUT, "");
  const report = {
    ok: false,
    serial: SERIAL || null,
    steps: [],
    assertions: {},
  };

  const connected = devices();
  if (connected.length === 0) {
    log("FAIL — no adb device");
    report.steps.push({ step: "device", ok: false, detail: "no device" });
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    process.exit(1);
  }
  if (!SERIAL && connected.length > 1) {
    log(`WARN — multiple devices; using ${connected[0]}`);
  }

  const callId = `notif-gate-${Date.now()}`;
  report.callId = callId;

  log("clear logcat");
  adb("logcat", "-c");
  report.steps.push({ step: "logcat_clear", ok: true });

  if (!SKIP_REVOKE) {
    log("revoke POST_NOTIFICATIONS");
    const revoke = adb("shell", "pm", "revoke", PKG, "android.permission.POST_NOTIFICATIONS");
    report.steps.push({
      step: "revoke_post_notifications",
      ok: revoke.status === 0,
      detail: (revoke.stdout + revoke.stderr).trim(),
    });
  } else {
    log("SKIP revoke (NOTIF_GATE_SKIP_REVOKE=1)");
    report.steps.push({ step: "revoke_post_notifications", ok: true, skipped: true });
  }

  await sleep(500);

  log(`broadcast debug incoming callId=${callId}`);
  const broadcast = adb(
    "shell",
    "am",
    "broadcast",
    "-a",
    "com.dibay.DEBUG_INCOMING_CALL",
    "-n",
    `${PKG}/.DibayCallDebugCommandReceiver`,
    "--es",
    "callId",
    callId,
    "--es",
    "callType",
    "audio",
  );
  report.steps.push({
    step: "debug_incoming_broadcast",
    ok: broadcast.status === 0,
    detail: (broadcast.stdout + broadcast.stderr).trim(),
  });

  await sleep(2500);

  log("read logcat");
  const logcat = adb("logcat", "-d", "-s", ...TAGS.split(/\s+/));
  const text = logcat.stdout + logcat.stderr;

  const blocked = text.includes("incoming_blocked_notification_permission");
  const blockedFcm = text.includes("[call-push] incoming_blocked_notification_permission");
  const runtimeVoice = text.includes("incoming_fcm_received") && text.includes(callId);
  const runtimeHandle =
    text.includes("NativeVoiceCallRuntime") || (text.includes("incoming_fcm_received") && text.includes(callId));

  report.assertions = {
    incoming_blocked_notification_permission: blocked,
    fcm_log_blocked_marker: blockedFcm,
    native_voice_incoming_fcm_received_absent: !runtimeVoice,
    runtime_handle_incoming_absent: !runtimeHandle,
  };

  const ok =
    blocked &&
    blockedFcm &&
    !runtimeVoice &&
    report.steps.every((s) => s.ok !== false);

  report.ok = ok;
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  log(`assert incoming_blocked_notification_permission: ${blocked ? "PASS" : "FAIL"}`);
  log(`assert no native voice incoming_fcm_received for ${callId}: ${!runtimeVoice ? "PASS" : "FAIL"}`);
  log(`overall: ${ok ? "PASS" : "FAIL"}`);

  if (!SKIP_REVOKE) {
    log("restore POST_NOTIFICATIONS grant");
    adb("shell", "pm", "grant", PKG, "android.permission.POST_NOTIFICATIONS");
  }

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
