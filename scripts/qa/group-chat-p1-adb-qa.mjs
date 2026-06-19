#!/usr/bin/env node
/**
 * Group Chat P1 — APK WebView CDP + prod API QA (extends P0 preflight).
 * FAIL if logcat contains unknown_type_fallback type=group_message
 * Usage: node scripts/qa/group-chat-p1-adb-qa.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  assertForegroundApk,
  ensureApkWebViewLogin,
  openUrlInApkWebView,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const CDP_PORT_A = Number(process.env.GROUP_P1_CDP_PORT_A || 9232);
const CDP_PORT_B = Number(process.env.GROUP_P1_CDP_PORT_B || 9233);
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
const SERIAL_A = process.env.GROUP_P1_DEVICE_A?.trim() || process.env.GROUP_P0_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.GROUP_P1_DEVICE_B?.trim() || process.env.GROUP_P0_DEVICE_B?.trim() || "RFCY40PY2CA";
const PROD = process.env.GROUP_P1_PROD?.trim() || process.env.GROUP_P0_PROD?.trim() || "https://samarket.vercel.app";
const LOGIN_A = process.env.GROUP_P1_LOGIN_A?.trim() || process.env.GROUP_P0_LOGIN_A?.trim() || "aaaa";
const LOGIN_B = process.env.GROUP_P1_LOGIN_B?.trim() || process.env.GROUP_P0_LOGIN_B?.trim() || "qqqq";
const OUT_LOG = path.join(ROOT, "docs/perf/group-chat-p1-adb-qa-run.log");
const OUT_JSON = path.join(ROOT, "docs/perf/group-chat-p1-adb-qa-report.json");
const FCM_TAGS = "DIBAY_FCM DIBAY_PUSH DIBAY_PUSH_REGISTER DIBAY_NOTIFY DIBAY_NOTIFICATION ReactNativeJS";
const QA_MODE = "2-device-limited-qa";

function loadEnvLocal() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function log(line) {
  const msg = `[group-p1-qa] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT_LOG, msg + "\n");
}

function adb(serial, ...args) {
  const r = spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function signInCookie(login) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message ?? "no session"}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  let cookie = `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(session))}`;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", data.session.user.id).maybeSingle();
    if (pr?.active_session_id) cookie += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
  }
  return { cookie, userId: data.session.user.id };
}

async function prodFetch(pathname, cookie, init = {}) {
  const res = await fetch(`${PROD}${pathname}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Cookie: cookie, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text: text.slice(0, 1200) };
}

function logcatDump(serial) {
  return adb(serial, "logcat", "-d", "-s", ...FCM_TAGS.split(" ")).stdout;
}

function supabaseAdmin() {
  loadEnvLocal();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function resolveProfileUserId(login) {
  const sb = supabaseAdmin();
  const username = login.includes("@") ? login.split("@")[0] : login;
  const { data, error } = await sb.from("profiles").select("id, username, nickname").eq("username", username).maybeSingle();
  if (error || !data?.id) throw new Error(`profile ${username}: ${error?.message ?? "not found"}`);
  return { userId: String(data.id), nickname: data.nickname ?? username };
}

async function main() {
  fs.writeFileSync(OUT_LOG, "");
  const report = {
    qaMode: QA_MODE,
    prod: PROD,
    devices: { A: SERIAL_A, B: SERIAL_B },
    checks: {},
    evidence: {},
    failures: [],
    verdict: "PENDING",
    at: new Date().toISOString(),
  };

  log(`P1 QA start prod=${PROD} A=${SERIAL_A} B=${SERIAL_B}`);

  const { cookie: cookieA, userId: userA } = await signInCookie(LOGIN_A);
  const { cookie: cookieB, userId: userB } = await signInCookie(LOGIN_B);
  const profileB = await resolveProfileUserId(LOGIN_B);

  log("--- APK WebView preflight (shared P0 path) ---");
  const preflightA = await ensureApkWebViewLogin({
    adb,
    chromium,
    serial: SERIAL_A,
    cdpPort: CDP_PORT_A,
    act: ACT,
    pkg: PKG,
    prod: PROD,
    login: LOGIN_A,
    expectedUserId: userA,
    loadEnv: loadEnvLocal,
    password: PASSWORD,
    log,
    label: "A",
  });
  const preflightB = await ensureApkWebViewLogin({
    adb,
    chromium,
    serial: SERIAL_B,
    cdpPort: CDP_PORT_B,
    act: ACT,
    pkg: PKG,
    prod: PROD,
    login: LOGIN_B,
    expectedUserId: userB,
    loadEnv: loadEnvLocal,
    password: PASSWORD,
    log,
    label: "B",
    restartForFcm: true,
  });
  report.checks.apkPreflightA = preflightA.ok;
  report.checks.apkPreflightB = preflightB.ok;
  if (!preflightA.ok || !preflightB.ok) {
    report.verdict = "REOPEN";
    report.failures.push("APK preflight failed");
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");

  log("--- create private_group ---");
  const createRes = await prodFetch("/api/community-messenger/groups/create", cookieA, {
    method: "POST",
    body: JSON.stringify({
      groupType: "private_group",
      title: `GROUP QA P1 ${Date.now()}`,
      memberIds: [userB],
    }),
  });
  const roomId = createRes.json?.roomId ?? createRes.json?.room_id ?? null;
  report.checks.groupCreate = createRes.status === 200 && createRes.json?.ok === true && !!roomId;
  report.evidence.groupCreate = createRes;
  if (!roomId) {
    report.verdict = "FAIL";
    report.failures.push("group create failed");
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    process.exit(1);
  }
  log(`roomId=${roomId}`);
  await sleep(2000);

  const groupBase = `/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}`;

  log("--- send + mention ---");
  const mentionNick = profileB.nickname?.trim() || LOGIN_B;
  const sendRes = await prodFetch(`/api/community-messenger/rooms/${roomId}/messages`, cookieA, {
    method: "POST",
    body: JSON.stringify({
      content: `P1 mention @${mentionNick} ping ${Date.now()}`,
      clientMessageId: `group-p1-mention-${Date.now()}`,
    }),
  });
  const messageId = sendRes.json?.message?.id ?? sendRes.json?.messageId ?? null;
  report.checks.mentionSend = sendRes.status === 200 && sendRes.json?.ok === true && !!messageId;
  report.evidence.mentionSend = sendRes;

  log("--- pin message ---");
  const pinRes = await prodFetch(`${groupBase}/pinned-message`, cookieA, {
    method: "PATCH",
    body: JSON.stringify({ messageId }),
  });
  report.checks.pinMessage = pinRes.status === 200 && pinRes.json?.ok === true;
  report.evidence.pinMessage = pinRes;

  log("--- read counts batch ---");
  const readRes = await prodFetch(`${groupBase}/media`, cookieB, {
    method: "POST",
    body: JSON.stringify({ messageIds: messageId ? [messageId] : [] }),
  });
  report.checks.readCountBatch =
    readRes.status === 200 &&
    readRes.json?.ok === true &&
    readRes.json?.readCounts &&
    typeof readRes.json.readCounts === "object";
  report.evidence.readCountBatch = readRes;

  log("--- profile ---");
  const profileGet = await prodFetch(`${groupBase}/profile`, cookieA, { method: "GET" });
  const profilePatch = await prodFetch(`${groupBase}/profile`, cookieA, {
    method: "PATCH",
    body: JSON.stringify({ title: `GROUP QA P1 patched ${Date.now()}` }),
  });
  report.checks.groupProfile =
    profileGet.status === 200 &&
    profileGet.json?.ok === true &&
    profilePatch.status === 200 &&
    profilePatch.json?.ok === true;
  report.evidence.groupProfile = { get: profileGet, patch: profilePatch };

  log("--- invite link ---");
  const inviteGet = await prodFetch(`${groupBase}/invite-link`, cookieA, { method: "GET" });
  const inviteRegen = await prodFetch(`${groupBase}/regenerate-link`, cookieA, { method: "POST" });
  report.checks.inviteLink =
    inviteGet.status === 200 &&
    inviteGet.json?.ok === true &&
    inviteRegen.status === 200 &&
    inviteRegen.json?.ok === true &&
    Boolean(inviteRegen.json?.inviteUrl);
  report.evidence.inviteLink = { get: inviteGet, regen: inviteRegen };

  log("--- media album ---");
  const mediaGet = await prodFetch(`${groupBase}/media?filter=all`, cookieA, { method: "GET" });
  report.checks.mediaAlbum =
    mediaGet.status === 200 && mediaGet.json?.ok === true && mediaGet.json?.page != null;
  report.evidence.mediaAlbum = mediaGet;

  log("--- FCM group_message (no unknown_type_fallback) ---");
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
  adb(SERIAL_B, "logcat", "-c");
  const fcmSend = await prodFetch(`/api/community-messenger/rooms/${roomId}/messages`, cookieA, {
    method: "POST",
    body: JSON.stringify({
      content: `GROUP P1 FCM ${Date.now()}`,
      clientMessageId: `group-p1-fcm-${Date.now()}`,
    }),
  });
  await sleep(12000);
  const bLog = logcatDump(SERIAL_B);
  const unknownFallback = /unknown_type_fallback.*group_message/i.test(bLog);
  const fcmTypeOk = /data_type_detected type=group_message/i.test(bLog) || /type=group/i.test(bLog);
  report.checks.fcmNoUnknownFallback = !unknownFallback;
  report.checks.fcmGroupMessageRoute = fcmSend.status === 200 && fcmTypeOk && !unknownFallback;
  report.evidence.fcmLogcatB = bLog.split("\n").filter(Boolean).slice(-40).join("\n");
  if (unknownFallback) report.failures.push("unknown_type_fallback type=group_message in logcat");

  log("--- APK room entry ---");
  await openUrlInApkWebView({
    adb,
    chromium,
    serial: SERIAL_A,
    cdpPort: CDP_PORT_A,
    act: ACT,
    prod: PROD,
    url: `${PROD}/community-messenger/rooms/${encodeURIComponent(roomId)}?type=group`,
    log,
    label: "A-room",
  });
  await sleep(3000);
  adb(SERIAL_A, "shell", "uiautomator", "dump", "/sdcard/window_dump.xml");
  const uiXml = adb(SERIAL_A, "shell", "cat", "/sdcard/window_dump.xml").stdout;
  try {
    assertForegroundApk(uiXml, "A-room", PKG);
    report.checks.apkRoomEntry = true;
  } catch {
    report.checks.apkRoomEntry = uiXml.includes(PKG);
  }
  report.evidence.uiDumpA = uiXml.slice(0, 1500);

  const required = [
    "groupCreate",
    "mentionSend",
    "pinMessage",
    "readCountBatch",
    "groupProfile",
    "inviteLink",
    "mediaAlbum",
    "fcmNoUnknownFallback",
    "fcmGroupMessageRoute",
    "apkPreflightA",
    "apkPreflightB",
    "apkRoomEntry",
  ];
  const passCount = required.filter((k) => report.checks[k] === true).length;
  report.summary = { pass: passCount, total: required.length };
  report.verdict = passCount === required.length ? "ACCEPT/CLOSE" : "FAIL";
  log(`verdict=${report.verdict} ${passCount}/${required.length}`);
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  process.exit(report.verdict === "ACCEPT/CLOSE" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
