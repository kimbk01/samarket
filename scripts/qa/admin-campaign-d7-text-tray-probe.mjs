#!/usr/bin/env node
/**
 * D7 — TEXT-only tray probe via Production provider (no local AuthKey).
 * Captures token/topic/env match metadata + short device log window.
 * Secrets/full tokens never printed.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, `.qa-logs/admin-campaign-d7-text-tray-${Date.now()}`);
const BASE = process.env.D7_BASE || "https://samarket.vercel.app";
const QA = process.env.GATE4_RECEIVER_ID || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const IOS_DEVICE_ROW = "ddaa405d-9289-4dd9-a1ad-6fc3fc152cac";
const DEVICE = process.env.IOS_UDID || "B01DDF12-5B2F-59C3-9B8F-3AF136851ECB";
const UDID_LEGACY = process.env.IOS_UDID_LEGACY || "00008120-000025C826F3C01E";
const DEVELOPER_DIR = process.env.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer";
const APP_PATH =
  process.env.D7_APP_PATH ||
  path.join(
    process.env.HOME,
    "Library/Developer/Xcode/DerivedData/App-fhtxzwoqzbvduhblbiygxpakrpsp/Build/Products/Debug-iphoneos/App.app"
  );

fs.mkdirSync(OUT, { recursive: true });

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readAppApsEnvironment(appPath) {
  const r = spawnSync("codesign", ["-d", "--entitlements", ":-", appPath], {
    encoding: "utf8",
    timeout: 30_000,
  });
  const blob = `${r.stdout || ""}\n${r.stderr || ""}`;
  const m = blob.match(/aps-environment<\/key>\s*<string>([^<]+)<\/string>/i);
  return m?.[1] || null;
}

function tokenFp(token) {
  if (!token) return null;
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 12);
}

async function adminCookie(sb, admin, url) {
  let session = null;
  for (const pass of [
    ...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(Boolean)),
  ]) {
    const { data } = await sb.auth.signInWithPassword({ email: "aaaa@manual.local", password: pass });
    if (data.session) {
      session = data.session;
      break;
    }
  }
  if (!session) throw new Error("admin login fail");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  let cookie = `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  )}`;
  const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  if (pr?.active_session_id) cookie += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
  return cookie;
}

function backgroundApp() {
  const env = { ...process.env, DEVELOPER_DIR, PATH: `${DEVELOPER_DIR}/usr/bin:${process.env.PATH}` };
  spawnSync(path.join(DEVELOPER_DIR, "usr/bin/devicectl"), ["device", "process", "launch", "--device", DEVICE, "com.dibay.app"], {
    encoding: "utf8",
    timeout: 60_000,
    env,
  });
  spawnSync("sleep", ["1.2"]);
  return spawnSync(
    path.join(DEVELOPER_DIR, "usr/bin/devicectl"),
    ["device", "process", "launch", "--device", DEVICE, "com.apple.Preferences"],
    { encoding: "utf8", timeout: 60_000, env }
  );
}

function analyzeLog(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8");
  const pats = {
    apsd: (text.match(/\bapsd\b/gi) || []).length,
    SpringBoard: (text.match(/\bSpringBoard\b/g) || []).length,
    usernotificationsd: (text.match(/usernotificationsd/gi) || []).length,
    DibayPushServiceExtension: (text.match(/DibayPushServiceExtension/g) || []).length,
    NotificationService: (text.match(/NotificationService/g) || []).length,
    com_dibay_app: (text.match(/com\.dibay\.app/g) || []).length,
    D7_TEXT_MARKER: (text.match(/DIBAY D7 TEXT|D7-TEXT-TRAY/g) || []).length,
    BadDeviceToken: (text.match(/BadDeviceToken/g) || []).length,
    DeviceTokenNotForTopic: (text.match(/DeviceTokenNotForTopic/g) || []).length,
    presented: (text.match(/present(ed|ing).*notification|Notification.*present/gi) || []).length,
    suppressed: (text.match(/suppress(ed|ion)|Focus.*filter|dnd/gi) || []).length,
  };
  return pats;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sb = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const appAps = readAppApsEnvironment(APP_PATH);
  const { data: row } = await admin
    .from("user_devices")
    .select(
      "id,environment,is_active,push_provider,push_token,app_version,device_id,last_seen_at,updated_at,notification_permission_status"
    )
    .eq("id", IOS_DEVICE_ROW)
    .maybeSingle();

  const report = {
    APP_APS_ENVIRONMENT: appAps,
    TOKEN_ENVIRONMENT_DB: row?.environment || null,
    TOKEN_FP: tokenFp(row?.push_token),
    TOKEN_LEN: row?.push_token?.length || 0,
    TOKEN_UPDATED_AT: row?.updated_at || null,
    TOKEN_LAST_SEEN: row?.last_seen_at || null,
    NOTIFICATION_PERMISSION_DB: row?.notification_permission_status ?? null,
    APNS_ENDPOINT: "production (Production runtime APNS_PRODUCTION authority)",
    APNS_TOPIC_CONTRACT: "APNS_BUNDLE_ID → com.dibay.app (not NSE bundle)",
    PUSH_TYPE: "alert",
    PRIORITY: "10",
    MATCH: null,
    TEXT: {},
  };

  // Entitlement is authority for token class; DB label alone is not.
  const match =
    appAps === "production" && report.APNS_ENDPOINT.startsWith("production")
      ? "PASS"
      : appAps === "development" && report.APNS_ENDPOINT.startsWith("production")
        ? "FAIL"
        : "UNKNOWN";
  report.MATCH = match;

  const cookie = await adminCookie(sb, admin, url);
  backgroundApp();
  await sleep(1500);

  const logPath = path.join(OUT, "device-window.log");
  const logProc = spawn("idevicesyslog", ["-u", UDID_LEGACY], {
    stdio: ["ignore", fs.openSync(logPath, "w"), "ignore"],
  });
  await sleep(1000);

  const marker = `D7-TEXT-TRAY-${Date.now()}`;
  const title = "DIBAY D7 TEXT";
  const body = "APNs text runtime probe";
  const createRes = await fetch(`${BASE}/api/admin/notification-campaigns`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      title: marker,
      body,
      type: "notice",
      channel: "push_only",
      target_type: "selected_users",
      target_payload: { user_ids: [QA] },
      deeplink_url: "/notifications",
      send_mode: "immediate",
      is_qa: true,
      // no image → pure text / no mutable-content intent
    }),
  });
  const createJson = await createRes.json();
  const campaignId = createJson.id || createJson.campaign?.id;
  if (!campaignId) throw new Error(`create fail ${JSON.stringify(createJson)}`);

  const sendRes = await fetch(`${BASE}/api/admin/notification-campaigns/${campaignId}/test-send`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      accept: "application/json",
      "Idempotency-Key": marker,
    },
    body: JSON.stringify({ user_ids: [QA] }),
  });
  const sendJson = await sendRes.json();
  await sleep(8000);
  try {
    logProc.kill("SIGTERM");
  } catch {
    /* ignore */
  }

  const { data: nd } = await admin
    .from("notification_deliveries")
    .select("status,provider_response,created_at,target_id")
    .eq("device_id", IOS_DEVICE_ROW)
    .eq("target_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1);
  const delivery = nd?.[0] || null;
  const pr = delivery?.provider_response || {};

  // Local payload contract of the same helper Production uses (code SSOT)
  const { buildApnsAlertBody } = await import("../../lib/push/dispatch/apns-sender-impl.ts");
  const wire = buildApnsAlertBody({ title, body, data: { routeUrl: "/notifications" } });
  const aps = wire.aps || {};

  const logHits = analyzeLog(logPath);
  report.TEXT = {
    campaignId,
    sendStatus: sendRes.status,
    sendOk: sendJson.ok === true,
    deliveryStatus: delivery?.status || null,
    apnsHttp: pr.http_status ?? null,
    apnsError: pr.error || null,
    apnsIdPresent: Boolean(pr.apns_id || pr["apns-id"]),
    payloadContract: {
      alertPresent: Boolean(aps.alert && typeof aps.alert === "object"),
      mutableContent: aps["mutable-content"] ?? null,
      sound: aps.sound ?? null,
      badge: aps.badge ?? null,
      imageUrlPresent: Boolean(wire.imageUrl || wire.push_image_url),
    },
    DEVICE_LOG_HITS: logHits,
    DEVICE_RECEIVE: logHits.D7_TEXT_MARKER > 0 || logHits.presented > 0 ? "PASS" : "NOT_PROVEN",
    TRAY: logHits.D7_TEXT_MARKER > 0 ? "PASS" : "NOT_PROVEN",
  };

  report.FIRST_BREAK =
    report.MATCH === "FAIL"
      ? "APP aps-environment=development vs Production APNs endpoint=production (DB env label is not authority)"
      : report.TEXT.apnsHttp === 200 && report.TEXT.TRAY !== "PASS"
        ? "APNs 200 but TEXT tray not proven — permission/suppression/receive path"
        : report.TEXT.apnsHttp !== 200
          ? "APNs not 200 on TEXT"
          : "NONE";

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("OUT", OUT);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
