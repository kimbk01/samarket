#!/usr/bin/env node
/**
 * D6 — Android rich push image runtime (Samsung + Xiaomi).
 * Requires local debug APK with DibayFirebaseMessagingService patch.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = `D6-${Date.now()}`;
const OUT = path.join(ROOT, `.qa-logs/admin-campaign-android-image-${STAMP}`);
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const DEVICES = [
  { label: "samsung", serial: process.env.GATE4_SAMSUNG || "RFCY40PY2CA" },
  { label: "xiaomi", serial: process.env.GATE4_XIAOMI || "8b37179f7d94" },
];
const QA_USER = process.env.GATE4_RECEIVER_ID || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const VALID_IMAGE = "https://picsum.photos/800/400";
const INVALID_IMAGE = "https://invalid.example.com/no-image.jpg";

fs.mkdirSync(OUT, { recursive: true });

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8", timeout: 30_000 });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sb() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function dispatchTestPush(campaignId) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminLogin = process.env.E2E_ADMIN_USERNAME || "aaaa";
  const email = `${adminLogin}@manual.local`;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const passwords = [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
  for (const pass of passwords) {
    const { data } = await client.auth.signInWithPassword({ email, password: pass });
    if (!data.session) continue;
    const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
    const cookieName = ref ? `sb-${ref}-auth-token` : "sb-auth-token";
    let cookie = `${cookieName}=${encodeURIComponent(
      JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      })
    )}`;
    if (sk) {
      const adminSb = createClient(url, sk, { auth: { persistSession: false } });
      const { data: pr } = await adminSb
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (pr?.active_session_id) {
        cookie += `; samarket_active_session_id=${encodeURIComponent(String(pr.active_session_id))}`;
      }
    }
    const res = await fetch(`http://127.0.0.1:3010/api/admin/notification-campaigns/${campaignId}/test-send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({ user_ids: [QA_USER], idempotency_key: `${STAMP}-${campaignId}` }),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }
  return { status: 0, json: { error: "admin_login_failed" } };
}

async function createPushCampaign(pushImageUrl, label) {
  const client = sb();
  const { data: admin } = await client
    .from("admin_notification_campaigns")
    .select("created_by")
    .not("created_by", "is", null)
    .limit(1)
    .maybeSingle();
  const { data, error } = await client
    .from("admin_notification_campaigns")
    .insert({
      title: `[QA-${STAMP}] ${label}`,
      body: `Android image ${label}`,
      type: "notice",
      target_type: "selected_users",
      channel: "push_only",
      status: "draft",
      send_mode: "immediate",
      is_qa: true,
      push_image_url: pushImageUrl,
      deeplink_url: "/notifications",
      created_by: admin?.created_by,
      target_payload: {},
      create_request_id: `${STAMP}-${label}`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

async function cleanup(id) {
  const c = sb();
  await c.from("admin_notification_campaign_occurrences").delete().eq("campaign_id", id);
  await c.from("notification_campaign_deliveries").delete().eq("campaign_id", id);
  await c.from("admin_notification_campaigns").delete().eq("id", id);
}

function notificationDump(serial) {
  return adb(serial, "shell", "dumpsys", "notification", "--noredact").stdout || "";
}

function parseLatestDibay(dump) {
  // Prefer NotificationRecord blocks; avoid aggregate counters like numWithBigPicture.
  const recordRe = /NotificationRecord\([^)]*pkg=com\.dibay\.app[\s\S]*?(?=NotificationRecord\(|\n\s*mNotificationList)/g;
  const records = dump.match(recordRe) || [];
  const latest = records.length ? records[records.length - 1] : "";
  if (!latest) {
    return { found: false, bigPicture: false, bigText: false, excerpt: "" };
  }
  return {
    found: true,
    bigPicture: /android\.bigPicture|BigPictureStyle|bigPicture=/.test(latest),
    bigText: /android\.bigText|BigTextStyle|bigText=/.test(latest),
    excerpt: latest.slice(0, 800),
  };
}

async function clearNotifications(serial) {
  adb(serial, "shell", "cmd", "notification", "cancel-all", PKG);
}

async function testDevice(device, mode) {
  const label = `${device.label}-${mode}`;
  const imageUrl = mode === "valid" ? VALID_IMAGE : mode === "invalid" ? INVALID_IMAGE : null;
  let campaignId = null;
  try {
    await clearNotifications(device.serial);
    campaignId = await createPushCampaign(imageUrl, label);
    const send = await dispatchTestPush(campaignId);
    await sleep(8000);
    const dump = notificationDump(device.serial);
    fs.writeFileSync(path.join(OUT, `${label}-dump.txt`), dump);
    const parsed = parseLatestDibay(dump);
    const passVisible = parsed.found;
    const passBigPicture = mode === "valid" ? parsed.bigPicture : true;
    const passFallback = mode === "invalid" ? parsed.found && !parsed.bigPicture : true;
    return {
      label,
      sendStatus: send.status,
      visible: passVisible ? "PASS" : "FAIL",
      bigPicture: mode === "valid" ? (parsed.bigPicture ? "PASS" : "FAIL") : "N/A",
      fallback: mode === "invalid" ? (passFallback ? "PASS" : "FAIL") : "N/A",
      parsed,
    };
  } finally {
    if (campaignId) await cleanup(campaignId);
  }
}

async function main() {
  loadEnv();
  const report = { devices: {}, OUT };
  for (const device of DEVICES) {
    report.devices[device.label] = {};
    for (const mode of ["text", "valid", "invalid"]) {
      report.devices[device.label][mode] = await testDevice(device, mode);
    }
  }
  fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
