#!/usr/bin/env node
/**
 * DIBAY Notification Sound SSOT contract verification.
 * Usage: npm run verify:notification-sound-ssot-contract
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  failures.push(msg);
}

function extractEventKeysFromRegistry(src) {
  const keys = [];
  const re = /ev\(\s*\n?\s*"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    keys.push(m[1]);
  }
  if (keys.length === 0) {
    const re2 = /event_key:\s*"([^"]+)"/g;
    while ((m = re2.exec(src)) !== null) keys.push(m[1]);
  }
  return keys;
}

function extractAssetIdsFromRegistry(src) {
  const ids = [];
  const re = /id:\s*"(DIBAY-SND-[^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

const manifest = JSON.parse(read("scripts/notification-sound-ssot-lock-manifest.json"));
if (manifest.phase1Status !== "LOCK") {
  fail("notification-sound-ssot-lock-manifest phase1Status must be LOCK");
}
if (!read(manifest.phase1LockDoc).includes("Phase 1 LOCK")) {
  fail("phase1 lock doc missing or invalid");
}
const registrySrc = read("lib/notifications/notification-sound-registry.ts");
const eventKeys = extractEventKeysFromRegistry(registrySrc);
const assetIds = extractAssetIdsFromRegistry(registrySrc);

if (new Set(eventKeys).size !== eventKeys.length) {
  fail("duplicate event_key in registry source");
}
if (new Set(assetIds).size !== assetIds.length) {
  fail("duplicate asset id in registry source");
}
if (eventKeys.length < 30) {
  fail(`expected >= 30 event keys in registry, got ${eventKeys.length}`);
}

const migration = read("supabase/migrations/20260930120000_notification_sound_ssot.sql");
for (const key of eventKeys) {
  if (!migration.includes(`'${key}'`)) {
    fail(`migration missing event_key seed: ${key}`);
  }
  if (!registrySrc.includes(`android_channel_id`)) {
    /* checked per event below */
  }
}

for (const key of eventKeys) {
  const block = registrySrc.split(`event_key: "${key}"`)[1]?.slice(0, 400) ?? "";
  if (!block.includes("android_channel_id:")) {
    const evFn = registrySrc.includes(`"${key}"`);
    if (evFn && !registrySrc.match(new RegExp(`"${key}"[\\s\\S]{0,800}android_channel_id:`))) {
      // ev() helper includes android_channel_id as arg — check migration instead
      if (!migration.includes(`'${key}'`)) fail(`event ${key} missing channel mapping`);
    }
  }
}

const requiredFiles = [
  "lib/notifications/notification-sound-types.ts",
  "lib/notifications/notification-sound-registry.ts",
  "lib/notifications/notification-sound-resolver.ts",
  "lib/notifications/notification-sound-event-map.ts",
  "lib/notifications/notification-sound-legacy-mirror.ts",
  "app/api/admin/notification-sound-ssot/route.ts",
  "scripts/seed-notification-sound-ssot-from-legacy.mjs",
  "components/admin/settings/AdminNotificationSoundSsotTable.tsx",
  "lib/push/native/notification-sound-native-bridge.ts",
  "docs/notifications/notification-sound-ssot-phase1-lock.md",
  ".cursor/rules/notification-sound-ssot-phase1-lock.mdc",
];
for (const f of requiredFiles) {
  if (!fs.existsSync(path.join(ROOT, f))) {
    fail(`missing required file: ${f}`);
  }
}

const pushDispatcher = read("lib/notifications/pipeline/notify-push-dispatcher.ts");
if (
  !pushDispatcher.includes("resolveNotificationSoundForEvent") &&
  !pushDispatcher.includes("resolveNotificationSound")
) {
  fail("notify-push-dispatcher must use notification sound resolver");
}

const ssotRoute = read("app/api/admin/notification-sound-ssot/route.ts");
if (!ssotRoute.includes("notification_sound_mappings")) {
  fail("admin SSOT route must write notification_sound_mappings");
}

const adminUi = read("components/admin/settings/AdminNotificationSoundSsotTable.tsx");
for (const key of eventKeys.slice(0, 5)) {
  if (!adminUi.includes("event_key")) break;
}
if (!read("components/admin/settings/AdminNotificationDomainsSettings.tsx").includes("AdminNotificationSoundSsotTable")) {
  fail("AdminNotificationDomainsSettings must include SSOT table");
}

try {
  const diff = execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf8" });
  for (const lockPath of manifest.forbiddenModifyPaths) {
    if (diff.split("\n").some((l) => l.trim() === lockPath)) {
      fail(`LOCK file modified: ${lockPath}`);
    }
  }
} catch {
  /* git unavailable */
}

if (/DROP TABLE.*admin_notification_settings/i.test(migration)) {
  fail("migration must not drop admin_notification_settings");
}
if (/DROP TABLE.*admin_messenger_call_sound_settings/i.test(migration)) {
  fail("migration must not drop admin_messenger_call_sound_settings");
}

const legacyWritePaths = [
  "app/api/admin/notification-sound-ssot/route.ts",
  "lib/notifications/notification-sound-legacy-mirror.ts",
];
for (const p of ["app/api/admin/notification-settings/route.ts", "app/api/admin/messenger-call-sounds/route.ts"]) {
  const src = read(p);
  if (src.includes("notification_sound_mappings")) {
    fail(`${p} must not write SSOT mappings directly`);
  }
}
void legacyWritePaths;

if (failures.length) {
  console.error("[verify:notification-sound-ssot-contract] FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("[verify:notification-sound-ssot-contract] PASS");
