#!/usr/bin/env node
/**
 * 4 Domain file-lock (Phase B–J).
 * - trash / Phase J deleted path restore FAIL
 * - applyCommunityMessengerUnreadOptimistic caller freeze
 * - SegmentShellLayout import FAIL (file deleted — any import fails)
 * - remaining REMOVE chrome (Pass1ComposerShell) must still exist until callers=0
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const FORBIDDEN_RESTORE = [
  "lib/community-messenger/realtime/domain-room-state-store.ts",
  "lib/community-messenger/realtime/reduce-domain-room-event.ts",
  "lib/notifications/build-notification-badge-projection.ts",
  "lib/messenger/contracts/domain-badge-surface-store.ts",
  "lib/chat-domain/chat-domain.ts",
  "components/community-messenger/room/CommunityMessengerRoomSegmentShellLayout.tsx",
  "components/community-messenger/room/CommunityMessengerRoomStableEntryShellLight.tsx",
  "components/community-messenger/room/CommunityMessengerRoomRouteEntryShell.tsx",
  "components/community-messenger/room/CommunityMessengerRoomPass0Shell.tsx",
  "components/community-messenger/room/CommunityMessengerRoomPass1StableShell.tsx",
  "components/community-messenger/room/CommunityMessengerRoomStableEntryShell.tsx",
];

const OPTIMISTIC_DEF = "lib/chats/owner-hub-badge-store.ts";
const OPTIMISTIC_CALLERS_ALLOWED = new Set([
  "lib/community-messenger/notifications/use-cm-participants-hub-sync.ts",
]);

const SEGMENT_LAYOUT_IMPORT_RE =
  /from\s+["'][^"']*CommunityMessengerRoomSegmentShellLayout["']|from\s+["']@\/components\/community-messenger\/room\/CommunityMessengerRoomSegmentShellLayout["']/;

/** Phase J slice-2 deleted shells — any import FAIL */
const DELETED_CHROME_IMPORT_RE =
  /CommunityMessengerRoom(RouteEntryShell|Pass0Shell|Pass1StableShell|StableEntryShell)\b/;

const FREEZE_MODULE = "lib/chat-domain/four-domain-freeze.ts";

const REMAINING_CHROME_MUST_EXIST = [
  "components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell.tsx",
];

let failed = false;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === ".next") continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) out.push(abs);
  }
  return out;
}

if (!fs.existsSync(path.join(ROOT, FREEZE_MODULE))) {
  fail(`missing freeze module: ${FREEZE_MODULE}`);
}

for (const rel of FORBIDDEN_RESTORE) {
  if (fs.existsSync(path.join(ROOT, rel))) {
    fail(`forbidden restore present: ${rel}`);
  }
}

const optimisticRe = /\bapplyCommunityMessengerUnreadOptimistic\s*\(/;
const scanRoots = ["lib", "components", "app", "hooks"].map((d) => path.join(ROOT, d));
for (const root of scanRoots) {
  for (const abs of walk(root)) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (rel.includes("/__tests__/") || rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
    if (rel === OPTIMISTIC_DEF) continue;
    const src = fs.readFileSync(abs, "utf8");
    if (!optimisticRe.test(src)) continue;
    if (!OPTIMISTIC_CALLERS_ALLOWED.has(rel)) {
      fail(
        `applyCommunityMessengerUnreadOptimistic caller not in freeze: ${rel} (allowed: ${[...OPTIMISTIC_CALLERS_ALLOWED].join(", ")})`,
      );
    }
  }
}

for (const root of [...scanRoots, path.join(ROOT, "tests")]) {
  for (const abs of walk(root)) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (rel.includes("/__tests__/") || rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
    const src = fs.readFileSync(abs, "utf8");
    if (SEGMENT_LAYOUT_IMPORT_RE.test(src)) {
      fail(`SegmentShellLayout import after Phase J delete: ${rel}`);
    }
    if (DELETED_CHROME_IMPORT_RE.test(src)) {
      // Allow string mentions in comments / lock scripts themselves
      if (rel === "scripts/verify-chat-domain-file-lock.cjs") continue;
      if (rel === "lib/chat-domain/room-chrome/phase-i-remove-prep.ts") continue;
      if (rel === "lib/chat-domain/four-domain-freeze.ts") continue;
      // Type-only / instrumentation name leftovers without component import are OK if not importing the module
      if (
        /from\s+["'][^"']*CommunityMessengerRoom(RouteEntryShell|Pass0Shell|Pass1StableShell|StableEntryShell)["']/.test(
          src,
        )
      ) {
        fail(`deleted chrome shell import after Phase J slice-2: ${rel}`);
      }
    }
  }
}

{
  const freezeSrc = fs.readFileSync(path.join(ROOT, FREEZE_MODULE), "utf8");
  for (const d of ["general_direct", "group", "trade", "store_order"]) {
    if (!freezeSrc.includes(`"${d}"`)) fail(`freeze missing domain: ${d}`);
  }
  if (!freezeSrc.includes("buildStoreOrderRoomIdentity")) {
    fail("freeze missing buildStoreOrderRoomIdentity (Phase C room UNIQUE)");
  }
}

{
  const createOrFind = "lib/chat-domain/create-or-find/index.ts";
  if (!fs.existsSync(path.join(ROOT, createOrFind))) {
    fail(`missing Phase C create/find: ${createOrFind}`);
  }
  const promoted =
    "supabase/migrations/20261001120000_cm_rooms_chat_domain_identity.sql";
  if (!fs.existsSync(path.join(ROOT, promoted))) {
    fail(`missing promoted Phase C migration: ${promoted}`);
  }
  const envelope = "lib/chat-domain/realtime/domain-realtime-envelope.ts";
  if (!fs.existsSync(path.join(ROOT, envelope))) {
    fail(`missing Phase E envelope: ${envelope}`);
  }
  const roomRead = "lib/chat-domain/room-read/domain-room-read-version.ts";
  if (!fs.existsSync(path.join(ROOT, roomRead))) {
    fail(`missing Phase F room-read: ${roomRead}`);
  }
  const pushRoute = "lib/chat-domain/push/domain-room-route.ts";
  if (!fs.existsSync(path.join(ROOT, pushRoute))) {
    fail(`missing Phase G push route: ${pushRoute}`);
  }
  for (const rel of [
    "lib/chat-domain/projections/hub-badge-projection.ts",
    "lib/chat-domain/projections/bell-badge-projection.ts",
    "lib/chat-domain/projections/app-icon-badge-projection.ts",
    "lib/chat-domain/list/general-direct-list-writer.ts",
  ]) {
    if (!fs.existsSync(path.join(ROOT, rel))) fail(`missing Phase H writer: ${rel}`);
  }
  const roomChrome = "lib/chat-domain/room-chrome/domain-room-chrome.ts";
  if (!fs.existsSync(path.join(ROOT, roomChrome))) {
    fail(`missing Phase I room-chrome: ${roomChrome}`);
  }
  for (const rel of REMAINING_CHROME_MUST_EXIST) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      fail(`remaining chrome REMOVE candidate missing (cutover before delete): ${rel}`);
    }
  }
}

if (failed) {
  console.error("verify:chat-domain-file-lock FAILED");
  process.exit(1);
}
console.log("verify:chat-domain-file-lock PASS");
process.exit(0);
