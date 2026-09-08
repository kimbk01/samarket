#!/usr/bin/env node
/**
 * CUT8 — Hangup latency proof (leaveChannel reuse; no destroy-on-leave stall)
 *
 *   node scripts/qa/cut8-android-hangup-latency-proof.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  forwardCdp,
  connectWebView,
  navigateApkWebView,
  probeApkDeviceSession,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const SERIAL_A = process.env.CUT8_DEVICE_A || "8b37179f7d94";
const SERIAL_B = process.env.CUT8_DEVICE_B || "RFCY40PY2CA";
const ORIGIN = (process.env.CUT8_ORIGIN || "https://samarket.vercel.app").replace(/\/$/, "");
const CDP_A = Number(process.env.CUT8_CDP_A || 9621);
const CDP_B = Number(process.env.CUT8_CDP_B || 9622);
const OUT = path.join(ROOT, "docs/perf/cut8-android-hangup-latency-proof.json");
const LOG_A = `/tmp/cut8-hangup-latency-A.logcat`;
const LOG_B = `/tmp/cut8-hangup-latency-B.logcat`;
const KNOWN_DM_ROOM = process.env.CUT8_ROOM_ID || "c202326f-8109-4ce4-aa61-394f0a799e7d";
/** Old destroy stall was ~8000ms. Budget for cleanup_start → cleanup_done. */
const CLEANUP_BUDGET_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function sh(serial, ...args) {
  const r = adb(serial, ...args);
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}
function log(msg) {
  console.log(`[hangup-latency] ${msg}`);
}
function wake(s) {
  sh(s, "shell", "input", "keyevent", "224");
  sh(s, "shell", "input", "keyevent", "82");
}
function unlock(s) {
  wake(s);
  sh(s, "shell", "wm", "dismiss-keyguard");
  sh(s, "shell", "input", "keyevent", "82");
}
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
function startLogcat(serial, file) {
  fs.writeFileSync(file, "");
  adb(serial, "logcat", "-c");
  const child = spawn(
    ADB,
    ["-s", serial, "logcat", "-v", "time", "DIBAY_NATIVE_VOICE:I", "DIBAY_CALL:I", "*:S"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const out = fs.createWriteStream(file, { flags: "a" });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  return child;
}
function stopLogcat(child) {
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}
function tapUi(serial, resourceIdSubstring) {
  const dumpPath = `/sdcard/hangup_ui_${serial}.xml`;
  sh(serial, "shell", "uiautomator", "dump", dumpPath);
  const xml = sh(serial, "shell", "cat", dumpPath);
  const re = new RegExp(
    `resource-id="[^"]*${resourceIdSubstring}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
  );
  const m = xml.match(re);
  if (!m) return { ok: false };
  const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
  const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
  sh(serial, "shell", "input", "tap", String(x), String(y));
  return { ok: true, x, y };
}
function parseTs(line) {
  const m = line.match(/^(\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!m) return null;
  const [, md, hh, mm, ss, ms] = m;
  const [month, day] = md.split("-").map(Number);
  return new Date(2026, month - 1, day, Number(hh), Number(mm), Number(ss), Number(ms)).getTime();
}
function measure(logText, callId) {
  const lines = logText.split("\n").filter((l) => l.includes(callId));
  const pick = (re) => lines.find((l) => re.test(l)) || null;
  const cleanupStart = pick(/runtime_cleanup_start/);
  const leaveScheduled = pick(/agora_leave_scheduled/) || pick(/agora_leave_async/);
  const mandatory = pick(/mandatory_cleanup_start/);
  const owner = pick(/owner_released/);
  const finish = pick(/activity_finish/);
  const done = pick(/cleanup_done/);
  const destroyOnLeave = lines.filter((l) => /before_agora_destroy/.test(l));
  const leaveTimeout = lines.filter((l) => /agora_leave_timeout/.test(l));
  const t0 = cleanupStart ? parseTs(cleanupStart) : null;
  const tDone = done ? parseTs(done) : null;
  return {
    cleanupStart,
    leaveScheduled,
    mandatory,
    owner,
    finish,
    done,
    destroyOnLeaveCount: destroyOnLeave.length,
    leaveTimeoutCount: leaveTimeout.length,
    destroyFalse: /destroy=false/.test(leaveScheduled || ""),
    cleanupDeltaMs: t0 != null && tDone != null ? tDone - t0 : null,
    sample: lines.filter((l) =>
      /runtime_cleanup|agora_leave|mandatory_cleanup|owner_released|activity_finish|cleanup_done|before_agora_destroy|agora_leave_timeout|agora_leave_await/.test(
        l,
      ),
    ),
  };
}

async function findDmRoom(page, peerUserId) {
  return page.evaluate(
    async ({ peerId, knownRoomId }) => {
      const r = await fetch(`/api/community-messenger/rooms?limit=50`, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const j = await r.json().catch(() => ({}));
      const rooms = j?.rooms || j?.items || j?.data || j?.snapshot?.rooms || [];
      const hit = (rooms || []).find((room) => {
        const members = room.members || room.member_ids || room.participant_ids || [];
        const ids = members.map((m) => (typeof m === "string" ? m : m?.user_id || m?.id)).filter(Boolean);
        return (
          ids.includes(peerId) ||
          room.peer_user_id === peerId ||
          room.other_user_id === peerId ||
          room.peerUserId === peerId
        );
      });
      if (hit?.id) return { roomId: hit.id, via: "list" };
      if (knownRoomId) {
        const probe = await fetch(`/api/community-messenger/rooms/${knownRoomId}`, {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        if (probe.ok) return { roomId: knownRoomId, via: "known_fallback", status: probe.status };
      }
      return { roomId: null };
    },
    { peerId: peerUserId, knownRoomId: KNOWN_DM_ROOM },
  );
}

async function waitSession(callId, pred, timeoutMs) {
  const sb = admin();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await sb
      .from("community_messenger_call_sessions")
      .select("*")
      .eq("id", callId)
      .maybeSingle();
    if (data && pred(data)) return data;
    await sleep(400);
  }
  return null;
}

async function main() {
  loadEnv();
  const proof = {
    PROOF: "cut8-android-hangup-latency",
    FIX: "leaveChannel without RtcEngine.destroy on normal leave; cleanup does not await Agora",
    CLEANUP_BUDGET_MS,
    RESULT: "RUNNING",
  };

  const adbFn = (serial, ...args) => adb(serial, ...args);
  unlock(SERIAL_A);
  unlock(SERIAL_B);

  const probeA = await probeApkDeviceSession({
    adb: adbFn,
    chromium,
    serial: SERIAL_A,
    cdpPort: CDP_A,
    act: ACT,
    prod: ORIGIN,
    log,
    label: "A",
  });
  const probeB = await probeApkDeviceSession({
    adb: adbFn,
    chromium,
    serial: SERIAL_B,
    cdpPort: CDP_B,
    act: ACT,
    prod: ORIGIN,
    log,
    label: "B",
  });
  proof.probeA = { ok: probeA.ok, userId: probeA.userId, username: probeA.username };
  proof.probeB = { ok: probeB.ok, userId: probeB.userId, username: probeB.username };
  if (!probeA.ok || !probeB.ok || !probeA.userId || !probeB.userId) {
    proof.RESULT = "FAIL_AUTH";
    fs.writeFileSync(OUT, JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    process.exit(1);
  }

  const lcA = startLogcat(SERIAL_A, LOG_A);
  const lcB = startLogcat(SERIAL_B, LOG_B);
  await sleep(400);

  wake(SERIAL_A);
  sh(SERIAL_A, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  await sleep(3000);
  forwardCdp(adbFn, SERIAL_A, CDP_A);
  const { browser, page } = await connectWebView(chromium, CDP_A);
  await navigateApkWebView(page, `${ORIGIN}/community-messenger?section=chats`, 3500);

  const room = await findDmRoom(page, probeB.userId);
  proof.room = room;
  if (!room?.roomId) {
    stopLogcat(lcA);
    stopLogcat(lcB);
    proof.RESULT = "FAIL_ROOM";
    fs.writeFileSync(OUT, JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    process.exit(1);
  }

  unlock(SERIAL_B);
  sh(SERIAL_B, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  await sleep(1500);
  sh(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(800);

  const placed = await page.evaluate(
    async ({ roomId, peerUserId, peerName }) => {
      const r = await fetch(`/api/community-messenger/rooms/${roomId}/calls`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ callKind: "voice", dialIntent: "fresh" }),
      });
      const j = await r.json().catch(() => ({}));
      const callId = j?.session?.id || j?.id || null;
      if (!callId) {
        return { status: r.status, callId: null, err: j?.error || null, nativeHandoff: null };
      }
      const plugin =
        window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeCallService
          ? window.Capacitor.Plugins.NativeCallService
          : null;
      if (!plugin || typeof plugin.startNativeOutgoingEstablishment !== "function") {
        return {
          status: r.status,
          callId,
          err: j?.error || null,
          nativeHandoff: { ok: false, reason: "plugin_missing" },
        };
      }
      try {
        const nativeHandoff = await plugin.startNativeOutgoingEstablishment({
          callId,
          roomId,
          mediaType: "voice",
          peerUserId: peerUserId || "",
          peerName: peerName || "",
        });
        return { status: r.status, callId, err: j?.error || null, nativeHandoff: nativeHandoff || { ok: false } };
      } catch (e) {
        return {
          status: r.status,
          callId,
          err: j?.error || null,
          nativeHandoff: { ok: false, reason: String(e && e.message ? e.message : e) },
        };
      }
    },
    { roomId: room.roomId, peerUserId: probeB.userId, peerName: probeB.username || "qqqq" },
  );
  proof.placed = placed;
  log(`callId=${placed.callId}`);
  if (!placed.callId) {
    stopLogcat(lcA);
    stopLogcat(lcB);
    await browser.close().catch(() => {});
    proof.RESULT = "FAIL_PLACE";
    fs.writeFileSync(OUT, JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    process.exit(1);
  }

  await sleep(2000);
  let acceptTap = { ok: false };
  for (let i = 0; i < 30; i++) {
    unlock(SERIAL_B);
    acceptTap = tapUi(SERIAL_B, "native_voice_call_accept");
    if (/accept_tapped/.test(fs.readFileSync(LOG_B, "utf8"))) break;
    await sleep(700);
  }
  proof.acceptTap = acceptTap;

  const connected = await waitSession(
    placed.callId,
    (s) => s.status === "active" && !!s.connected_at,
    50000,
  );
  proof.connected = !!connected?.connected_at;
  if (!proof.connected) {
    proof.callerMeasure = measure(fs.readFileSync(LOG_A, "utf8"), placed.callId);
    stopLogcat(lcA);
    stopLogcat(lcB);
    await browser.close().catch(() => {});
    proof.RESULT = "FAIL_CONNECT";
    fs.writeFileSync(OUT, JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    process.exit(1);
  }

  await sleep(1200);
  unlock(SERIAL_A);
  let endTap = tapUi(SERIAL_A, "native_voice_call_end");
  if (!endTap.ok) {
    await page.evaluate(async (id) => {
      await fetch(`/api/community-messenger/calls/sessions/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
    }, placed.callId);
    endTap = { ok: true, via: "api_end_fallback" };
  }
  proof.endTap = endTap;

  await sleep(CLEANUP_BUDGET_MS + 800);
  const mA = measure(fs.readFileSync(LOG_A, "utf8"), placed.callId);
  proof.callerMeasure = mA;
  const topA = sh(SERIAL_A, "shell", "dumpsys", "activity", "activities");
  proof.xiaomiTopNativeVoice = /NativeVoiceCallActivity/.test(topA) ? "PRESENT" : "NONE";

  proof.CLEANUP_DELTA_MS = mA.cleanupDeltaMs;
  proof.NO_DESTROY_ON_LEAVE = mA.destroyOnLeaveCount === 0 ? "PASS" : "FAIL";
  proof.NO_LEAVE_TIMEOUT = mA.leaveTimeoutCount === 0 ? "PASS" : "FAIL";
  proof.DESTROY_FALSE_LOG = mA.destroyFalse ? "PASS" : "FAIL";
  proof.CLEANUP_WITHIN_BUDGET =
    mA.cleanupDeltaMs != null && mA.cleanupDeltaMs <= CLEANUP_BUDGET_MS ? "PASS" : "FAIL";
  proof.ACTIVITY_GONE = proof.xiaomiTopNativeVoice === "NONE" ? "PASS" : "FAIL";
  proof.RESULT =
    proof.CLEANUP_WITHIN_BUDGET === "PASS" &&
    proof.NO_DESTROY_ON_LEAVE === "PASS" &&
    proof.NO_LEAVE_TIMEOUT === "PASS" &&
    proof.ACTIVITY_GONE === "PASS" &&
    mA.done
      ? "PASS"
      : "FAIL";

  // Immediate re-dial place (cancel after join gate observed)
  const rePlace = await page.evaluate(
    async ({ roomId, peerUserId, peerName }) => {
      const r = await fetch(`/api/community-messenger/rooms/${roomId}/calls`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ callKind: "voice", dialIntent: "fresh" }),
      });
      const j = await r.json().catch(() => ({}));
      const callId = j?.session?.id || j?.id || null;
      if (!callId) return { callId: null, status: r.status, err: j?.error || null };
      const plugin = window.Capacitor?.Plugins?.NativeCallService;
      let nativeHandoff = null;
      if (plugin?.startNativeOutgoingEstablishment) {
        try {
          nativeHandoff = await plugin.startNativeOutgoingEstablishment({
            callId,
            roomId,
            mediaType: "voice",
            peerUserId: peerUserId || "",
            peerName: peerName || "",
          });
        } catch (e) {
          nativeHandoff = { ok: false, reason: String(e?.message || e) };
        }
      }
      return { callId, status: r.status, nativeHandoff };
    },
    { roomId: room.roomId, peerUserId: probeB.userId, peerName: probeB.username || "qqqq" },
  );
  proof.redialPlace = rePlace;
  if (rePlace.callId) {
    await sleep(2000);
    const logA2 = fs.readFileSync(LOG_A, "utf8");
    const redialLines = logA2.split("\n").filter((l) => l.includes(rePlace.callId));
    const awaitJoin = redialLines.find((l) => /agora_leave_await_join/.test(l));
    const joinStart = redialLines.find((l) => /caller_agora_native_join_start|agora_native_join_start/.test(l));
    let awaitJoinMs = null;
    if (awaitJoin && joinStart) {
      const tA = parseTs(awaitJoin);
      // after await, join continues on same thread — use next leave/join success if any
      const afterLeave = redialLines.find(
        (l) => parseTs(l) != null && parseTs(awaitJoin) != null && parseTs(l) >= parseTs(awaitJoin) && /audio_route_applied|join_return|local_audio_publish/.test(l),
      );
      if (afterLeave && tA != null) awaitJoinMs = parseTs(afterLeave) - tA;
    }
    proof.redial = {
      callId: rePlace.callId,
      handoffOk: !!rePlace.nativeHandoff,
      awaitJoinLine: awaitJoin || null,
      joinStartLine: joinStart || null,
      awaitJoinMs,
    };
    await page.evaluate(async (id) => {
      await fetch(`/api/community-messenger/calls/sessions/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      }).catch(() => {});
    }, rePlace.callId);
  }

  stopLogcat(lcA);
  stopLogcat(lcB);
  await browser.close().catch(() => {});
  fs.writeFileSync(OUT, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
  console.log("wrote", OUT);
  process.exit(proof.RESULT === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
