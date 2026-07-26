/**
 * Badge target policy contract — forbid message-sum / raw notification COUNT in badge read paths.
 * npm run verify:badge-target-policy
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function walk(dir, acc = []) {
  for (const ent of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${ent.name}`.replace(/\\/g, "/");
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "__tests__") continue;
      walk(rel, acc);
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

const regulations = read("lib/notifications/samarket-messenger-notification-regulations.ts");
const fromTargets = read("lib/chats/build-owner-hub-badge-from-targets.ts");
const policy = read("lib/notifications/badge-target-policy.ts");
const migration = read("supabase/migrations/20260606120000_notification_targets.sql");

if (!policy.includes("BADGE_TARGET_POLICY_ID")) {
  errors.push("badge-target-policy.ts: missing BADGE_TARGET_POLICY_ID");
}
if (!fromTargets.includes("chatUnread: 0")) {
  errors.push("build-owner-hub-badge-from-targets: chatUnread must be 0 (legacy message sum removed)");
}
if (regulations.includes("bd.chatUnread")) {
  errors.push("samarket-messenger-notification-regulations: must not sum chatUnread into messenger tab");
}
if (!migration.includes("count_notification_targets")) {
  errors.push("notification_targets migration: missing count_notification_targets RPC");
}
if (!migration.includes("notification_targets first")) {
  errors.push("segmented RPC migration comment: should delegate to notification_targets");
}

const badgeReadPaths = [
  "lib/chats/build-owner-hub-badge-payload.ts",
  "lib/chats/build-owner-hub-badge-from-targets.ts",
  "lib/chats/owner-hub-badge-snapshot.ts",
  "lib/notifications/fetch-segmented-unread-count-server.ts",
  "lib/notifications/samarket-messenger-notification-regulations.ts",
  "lib/delivery/owner/owner-store-badge-display-policy.ts",
  "components/layout/MainBottomNavFabSector.tsx",
];

const forbiddenInBadgeRead = [
  /sumCommunityMessengerParticipantUnread\s*\(/,
  /getCachedUserChatUnreadParts\s*\(/,
  /hub_badge_user_chat_unread_parts/,
  /SUM\s*\(\s*unread_count\s*\)/i,
];

for (const rel of badgeReadPaths) {
  const src = read(rel);
  for (const pattern of forbiddenInBadgeRead) {
    if (pattern.test(src)) {
      errors.push(`${rel}: forbidden badge read pattern ${pattern}`);
    }
  }
}

const libNotificationFiles = walk("lib/notifications").filter(
  (f) => !f.includes("notification-target-messenger-bridge") && !f.endsWith(".test.ts")
);

for (const rel of libNotificationFiles) {
  const src = read(rel);
  if (/badge.*SUM\s*\(\s*unread_count/i.test(src)) {
    errors.push(`${rel}: badge path must not SUM participant unread_count`);
  }
}

if (errors.length) {
  console.error("verify:badge-target-policy FAIL\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log("verify:badge-target-policy PASS");
