#!/usr/bin/env node
/**
 * Phase 1 readiness — google-services.json + env keys (values never printed).
 * PASS does NOT mean delivery sent; run Admin test push after Vercel redeploy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function envSet(env, key) {
  const v = env[key] ?? process.env[key];
  if (!v || !String(v).trim() || v === '""' || v === "''") return false;
  return true;
}

// 1. google-services.json
const gsPath = path.join(root, "android/app/google-services.json");
if (!fs.existsSync(gsPath)) {
  fail("android/app/google-services.json missing — download from Firebase Console");
} else {
  try {
    const gs = JSON.parse(fs.readFileSync(gsPath, "utf8"));
    const clients = gs.client ?? [];
    const pkgOk = clients.some(
      (c) => c?.client_info?.android_client_info?.package_name === "com.dibay.app"
    );
    if (!pkgOk) {
      fail("google-services.json has no client for package com.dibay.app");
    } else {
      pass("google-services.json exists with com.dibay.app");
    }
    if (!gs.project_info?.project_id) {
      warn("google-services.json project_id empty");
    }
  } catch (e) {
    fail(`google-services.json invalid JSON: ${e instanceof Error ? e.message : e}`);
  }
}

// 2. Env keys
const env = loadEnvLocal();
const required = [
  ["PUSH_DISPATCH_ENABLED", "Must be 1 for native dispatch gate"],
];
const splitFcmEnvKeys = ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"];
const legacyFcmEnvKeys = ["FCM_SERVICE_ACCOUNT_JSON", "FCM_SERVICE_ACCOUNT_JSON_BASE64"];
const optionalIos = [
  "APNS_KEY_P8",
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_BUNDLE_ID",
  "APNS_VOIP_TOPIC",
];

for (const [key, hint] of required) {
  if (!envSet(env, key)) {
    fail(`${key} not set (.env.local or process.env) — ${hint}`);
  } else if (key === "PUSH_DISPATCH_ENABLED") {
    const v = (env[key] ?? process.env[key] ?? "").trim();
    if (v !== "1") {
      fail("PUSH_DISPATCH_ENABLED must be exactly 1");
    } else {
      pass("PUSH_DISPATCH_ENABLED=1");
    }
  } else {
    pass(`${key} is set`);
  }
}

const hasSplitFcmEnv = splitFcmEnvKeys.every((key) => envSet(env, key));
const hasLegacyFcmEnv = legacyFcmEnvKeys.some((key) => envSet(env, key));
if (!hasSplitFcmEnv && !hasLegacyFcmEnv) {
  fail("FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY not set (legacy JSON env also absent)");
} else {
  pass(hasSplitFcmEnv ? "FCM split env present" : "legacy FCM service account env present");
}

let iosReady = 0;
for (const key of optionalIos) {
  if (envSet(env, key)) iosReady += 1;
}
if (iosReady === optionalIos.length) {
  pass("APNS_* env complete (iOS push ready)");
} else if (iosReady === 0) {
  warn(`APNS_* not set (${optionalIos.length} keys) — Android-only Phase 1 OK`);
} else {
  warn(`APNS_* partial (${iosReady}/${optionalIos.length}) — iOS push may skip`);
}

// 3. FCM JSON parse smoke (no secret output)
const fcmRaw = legacyFcmEnvKeys
  .map((key) => (env[key] ?? process.env[key] ?? "").trim())
  .find(Boolean);
if (hasSplitFcmEnv) {
  const projectId = (env.FCM_PROJECT_ID ?? process.env.FCM_PROJECT_ID ?? "").trim();
  const clientEmail = (env.FCM_CLIENT_EMAIL ?? process.env.FCM_CLIENT_EMAIL ?? "").trim();
  const privateKey = (env.FCM_PRIVATE_KEY ?? process.env.FCM_PRIVATE_KEY ?? "").trim().replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    fail("FCM split env missing project id, client email, or private key");
  } else {
    pass("FCM split env parses as service account");
  }
} else if (fcmRaw) {
  const raw = fcmRaw;
  try {
    const parsed = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    if (!parsed.client_email || !parsed.private_key) {
      fail("FCM service account JSON missing client_email or private_key");
    } else {
      pass("FCM service account JSON parses as service account");
    }
  } catch {
    fail("FCM service account env is not valid JSON or base64 JSON");
  }
}

// 4. Migration file in repo
const mig = path.join(root, "supabase/migrations/20260915100000_user_devices_notification_deliveries.sql");
if (!fs.existsSync(mig)) {
  fail("migration file missing in repo");
} else {
  pass("user_devices migration file present in repo");
  console.log(
    "INFO: Apply on Supabase — SQL Editor:\n" +
      "  SELECT to_regclass('public.user_devices'), to_regclass('public.notification_deliveries');"
  );
}

console.log("\n--- Phase 1 next steps (manual) ---");
console.log("1. Vercel: same env as .env.local → redeploy");
console.log("2. Supabase: confirm user_devices + notification_deliveries exist");
console.log("3. Native app: login → register push → /admin/push-devices → test push");
console.log("4. Report last 3 notification_deliveries rows (status must be sent)");

if (failed > 0) {
  console.error(`\nverify-push-phase1-ready: ${failed} failure(s)`);
  process.exit(1);
}
console.log("\nverify-push-phase1-ready: local Phase 1 config OK (still need Admin sent verification)");
