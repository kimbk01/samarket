#!/usr/bin/env node
/**
 * CUT7 — Android duplicate audible incoming alert measure (BG Voice first).
 * Captures RingOwner ring_start + device channel sound + RingtonePlayer starts.
 *
 *   KIND=voice|video STATE=BG|LOCKED \
 *     node scripts/qa/cut7-android-dup-audible-measure.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { forwardCdp, connectWebView } from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const SERIAL_A = "8b37179f7d94";
const SERIAL_B = "RFCY40PY2CA";
const PKG = "com.dibay.app";
const ROOM = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const CDP_PORT = Number(process.env.CUT7_CDP_PORT || 9580);
const KIND = (process.env.KIND || "voice").toLowerCase() === "video" ? "video" : "voice";
const STATE = (process.env.STATE || "BG").toUpperCase() === "LOCKED" ? "LOCKED" : "BG";
const PHASE = process.env.PHASE || "before";
const OUT = path.join(ROOT, `docs/perf/cut7-android-dup-audible-${KIND}-${STATE.toLowerCase()}-${PHASE}.json`);
const LOG = `/tmp/cut7-dup-${KIND}-${STATE}-${PHASE}.logcat`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function sh(serial, ...args) {
  const r = adb(serial, ...args);
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}
function dumpChannels() {
  const raw = sh(SERIAL_B, "shell", "dumpsys", "notification", "--noredact");
  const voice = raw.match(
    /NotificationChannel\{mId='dibay_native_voice_incoming[^']*'[\s\S]*?mSound=[^,]+[\s\S]*?mImportance=\d+/,
  );
  const video = raw.match(
    /NotificationChannel\{mId='dibay_native_video_incoming[^']*'[\s\S]*?mSound=[^,]+[\s\S]*?mImportance=\d+/,
  );
  const parse = (block) => {
    if (!block) return null;
    const id = (block.match(/mId='([^']+)'/) || [])[1] || null;
    const sound = (block.match(/mSound=([^,]+)/) || [])[1] || null;
    const importance = Number((block.match(/mImportance=(\d+)/) || [])[1] || NaN);
    const vib = /mVibrationEnabled=true/.test(block);
    const bypass = /mBypassDnd=true/.test(block);
    return { id, sound, importance, vibrationEnabled: vib, bypassDnd: bypass, raw: block.slice(0, 280) };
  };
  // Also capture ALL matching channel ids
  const all = [];
  const re = /NotificationChannel\{mId='(dibay_native_(?:voice|video)_incoming[^']*)'[\s\S]*?mSound=([^,]+)[\s\S]*?mImportance=(\d+)/g;
  let m;
  while ((m = re.exec(raw))) {
    all.push({ id: m[1], sound: m[2], importance: Number(m[3]) });
  }
  return { voice: parse(voice?.[0]), video: parse(video?.[0]), all };
}
function wake(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
}
function unlockB() {
  wake(SERIAL_B);
  adb(SERIAL_B, "shell", "wm", "dismiss-keyguard");
  adb(SERIAL_B, "shell", "input", "keyevent", "82");
}
function bgB() {
  unlockB();
  adb(SERIAL_B, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  sleep(1500);
  adb(SERIAL_B, "shell", "input", "keyevent", "3"); // HOME
}
function lockB() {
  unlockB();
  adb(SERIAL_B, "shell", "input", "keyevent", "26");
}

async function main() {
  const channelsBefore = dumpChannels();
  console.log("channels", JSON.stringify(channelsBefore.all, null, 2));

  if (STATE === "LOCKED") lockB();
  else bgB();
  await sleep(800);

  adb(SERIAL_B, "logcat", "-c");
  fs.writeFileSync(LOG, "");
  const lc = spawnSync(
    "sh",
    [
      "-c",
      `${ADB} -s ${SERIAL_B} logcat -v time DIBAY_CALL:I DIBAY_NATIVE_VOICE:I DIBAY_NATIVE_VIDEO:I RingtonePlayer:I *:S > "${LOG}" 2>&1 & echo $!`,
    ],
    { encoding: "utf8" },
  );
  const lcPid = (lc.stdout || "").trim();

  wake(SERIAL_A);
  adb(SERIAL_A, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  await sleep(4000);
  forwardCdp(adb, SERIAL_A, CDP_PORT);
  const { browser, page } = await connectWebView(chromium, CDP_PORT);
  await page.evaluate((u) => {
    window.location.href = u;
  }, "https://samarket.vercel.app/community-messenger");
  await sleep(3000);

  const placed = await page.evaluate(
    async ({ roomId, kind }) => {
      const r = await fetch(`/api/community-messenger/rooms/${roomId}/calls`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callKind: kind, dialIntent: "fresh" }),
      });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, callId: j?.session?.id || j?.id || null };
    },
    { roomId: ROOM, kind: KIND },
  );
  console.log("placed", placed);
  await sleep(8000);

  const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  const callSlice = placed.callId
    ? log
        .split("\n")
        .filter((l) => l.includes(placed.callId) || l.includes(placed.callId.replace(/-/g, "").slice(0, 8)))
        .join("\n")
    : log;
  const full = log;
  const ringStart = (full.match(/ring_start/g) || []).length;
  const ringOwner = /IncomingCallRingOwner|source=ring_owner|source=native_foreground/.test(full);
  const notifPost =
    (full.match(/incoming_notification_post_done/g) || []).length +
    (full.match(/incoming_notification_post_start/g) || []).length;
  const rpPlay = (full.match(/RingtonePlayer.*(play|start)/gi) || []).length;
  const focused = sh(SERIAL_B, "shell", "dumpsys", "activity", "activities").match(
    /mResumedActivity:.*?([\w./]+)/,
  );
  const top = focused?.[1] || null;
  const presented =
    /NativeVoiceCallActivity|NativeVideoCallActivity|incoming_notification_post_done|fullscreen_intent/.test(full) ||
    /nativevoice|nativevideo/i.test(String(top || ""));

  // cancel leftover
  if (placed.callId) {
    await page.evaluate(async (id) => {
      await fetch(`/api/community-messenger/calls/sessions/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    }, placed.callId).catch(() => {});
  }
  await browser.close().catch(() => {});
  if (lcPid) spawnSync("kill", [lcPid]);

  const channels = dumpChannels();
  const ch = KIND === "voice" ? channels.voice : channels.video;
  // Prefer v2 if present
  const activeCh =
    channels.all.find((c) => c.id?.includes(KIND === "voice" ? "voice_incoming" : "video_incoming") && c.id.includes("_v2")) ||
    channels.all.find((c) => c.id?.includes(KIND === "voice" ? "voice_incoming" : "video_incoming")) ||
    ch;

  const channelSoundNonNull =
    activeCh?.sound && activeCh.sound !== "null" && !/sound=null/.test(String(activeCh.sound));
  const audibleEstimate =
    ringStart >= 1 && (channelSoundNonNull || rpPlay >= 2) ? 2 : ringStart >= 1 ? 1 : 0;

  const out = {
    HEAD: spawnSync("git", ["rev-parse", "--short=9", "HEAD"], { encoding: "utf8", cwd: ROOT }).stdout.trim(),
    PHASE,
    KIND,
    STATE,
    CALL_ID: placed.callId,
    ROOM_ID: ROOM,
    DEVICE: SERIAL_B,
    channelsBefore: channelsBefore.all,
    channelsAfterDump: channels.all,
    activeChannel: activeCh,
    RingOwner_start_count: ringStart,
    ringOwnerEvidence: ringOwner,
    notification_post_markers: notifPost,
    RingtonePlayer_events: rpPlay,
    channel_sound: activeCh?.sound || null,
    channel_importance: activeCh?.importance ?? null,
    audible_alert_estimate: audibleEstimate,
    presentation: presented ? "PASS" : "FAIL",
    focusedTop: top,
    sample: full
      .split("\n")
      .filter((l) => /ring_start|notification_post|RingtonePlayer|channel/i.test(l))
      .slice(0, 40),
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ CALL_ID: out.CALL_ID, audible: audibleEstimate, channel_sound: out.channel_sound, ringStart, rpPlay, presentation: out.presentation }, null, 2));
  console.log("wrote", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
