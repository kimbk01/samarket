/**
 * Phase J1–J4 — Badge/Bell/App Icon Legacy import-ban.
 * npm run verify:badge-import-ban
 *
 * LOCK formulas out of scope.
 * DO NOT ban NOTIFICATION_SYNC_POLL_MS — notification list polls still use it.
 * DO NOT ban countNotificationEventsBadge — Domain HTTP categoryCounts.
 * DO NOT ban applyNotificationBadgeProjection / NativeBadgeSync / publishDomainBadgeShellToSurfaceStore.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const DELETED_FILES = [
  "lib/notifications/tier1-admin-notice-bell-supplement.ts",
  "lib/notifications/__tests__/tier1-admin-notice-bell-supplement.test.ts",
  "lib/notifications/notification-unread-badge-store.ts",
  "lib/notifications/__tests__/notification-unread-badge-store.test.ts",
  "lib/notifications/__tests__/notification-badge-count-read-patch.test.ts",
  "hooks/useMyNotificationUnreadCount.ts",
  "hooks/useOwnerCommerceNotificationUnreadCount.ts",
  "hooks/useNotificationBadgeCount.ts",
];

const SCAN_ROOTS = ["app", "components", "hooks", "lib", "services"];

const ALLOWLIST_REL = new Set([
  "lib/chat-domain/projections/phase-h-quarantine.ts",
  "lib/chat-domain/projections/hub-r1-r4-measurement.ts",
  "lib/chat-domain/__tests__/hub-r1-r4-measurement.test.ts",
  "lib/notifications/__tests__/app-icon-domain-authority-j3.test.ts",
  "lib/chats/__tests__/owner-hub-badge-store-cm-sync.test.ts",
  "lib/notifications/__tests__/projection-authority-p0-2-contract.test.ts",
  "scripts/verify-badge-import-ban.mjs",
]);

const FORBIDDEN_PATTERNS = [
  { id: "import:tier1-admin-notice-bell-supplement", re: /tier1-admin-notice-bell-supplement/ },
  { id: "import:notification-unread-badge-store", re: /notification-unread-badge-store/ },
  { id: "import:useMyNotificationUnreadCount", re: /useMyNotificationUnreadCount/ },
  { id: "import:useOwnerCommerceNotificationUnreadCount", re: /useOwnerCommerceNotificationUnreadCount/ },
  { id: "import:hooks/useNotificationBadgeCount", re: /hooks\/useNotificationBadgeCount|@\/hooks\/useNotificationBadgeCount/ },
  { id: "call:getSurfaceNotificationUnreadStore", re: /\bgetSurfaceNotificationUnreadStore\s*\(/ },
  { id: "call:refreshActiveSurfaceNotificationUnreadStores", re: /\brefreshActiveSurfaceNotificationUnreadStores\s*\(/ },
  { id: "call:reconcileTier1BellSurfacePolling", re: /\breconcileTier1BellSurfacePolling\s*\(/ },
  { id: "call:pauseAndClearAllNotificationUnreadBadgeStores", re: /\bpauseAndClearAllNotificationUnreadBadgeStores\s*\(/ },
  { id: "call:applyCommunityMessengerUnreadOptimistic", re: /\bapplyCommunityMessengerUnreadOptimistic\s*\(/ },
  { id: "export:applyCommunityMessengerUnreadOptimistic", re: /export\s+(?:async\s+)?function\s+applyCommunityMessengerUnreadOptimistic\b/ },
  { id: "call:applyHubBadgeCmUnreadRoomCountAbsolute", re: /\bapplyHubBadgeCmUnreadRoomCountAbsolute\s*\(/ },
  { id: "export:applyHubBadgeCmUnreadRoomCountAbsolute", re: /export\s+(?:async\s+)?function\s+applyHubBadgeCmUnreadRoomCountAbsolute\b/ },
  { id: "call:syncTier1HeaderInboxUnreadFromRows", re: /\bsyncTier1HeaderInboxUnreadFromRows\s*\(/ },
  { id: "export:syncTier1HeaderInboxUnreadFromRows", re: /export\s+(?:async\s+)?function\s+syncTier1HeaderInboxUnreadFromRows\b/ },
  { id: "call:computeTier1HeaderInboxDisplayUnread", re: /\bcomputeTier1HeaderInboxDisplayUnread\s*\(/ },
  { id: "export:computeTier1HeaderInboxDisplayUnread", re: /export\s+(?:async\s+)?function\s+computeTier1HeaderInboxDisplayUnread\b/ },
  { id: "call:resolveTier1AdminNoticeBellSupplement", re: /\bresolveTier1AdminNoticeBellSupplement\s*\(/ },
  { id: "call:clearTier1AdminNoticeBellSupplementOptimistic", re: /\bclearTier1AdminNoticeBellSupplementOptimistic\s*\(/ },
  { id: "call:fetchNotificationBadgeCount", re: /\bfetchNotificationBadgeCount\b/ },
  { id: "call:applyNotificationBadgeCountFromReadResponse", re: /\bapplyNotificationBadgeCountFromReadResponse\b/ },
  { id: "call:publishDomainBadgeAuthorityShellToNav", re: /\bpublishDomainBadgeAuthorityShellToNav\b/ },
  { id: "call:publishDomainBadgeShellToAppIcon", re: /\bpublishDomainBadgeShellToAppIcon\b/ },
  { id: "call:scheduleDomainBadgeSurfaceResync", re: /\bscheduleDomainBadgeSurfaceResync\b/ },
  { id: "call:resyncNotificationBadgeAuthorityFromBadgeCount", re: /\bresyncNotificationBadgeAuthorityFromBadgeCount\b/ },
  { id: "call:resolveTier1InboxBellLegacyUnreadUrl", re: /\bresolveTier1InboxBellLegacyUnreadUrl\b/ },
  { id: "call:getRoomMissedCallBadgeCount", re: /\bgetRoomMissedCallBadgeCount\b/ },
  { id: "call:clearRoomMissedCallBadge", re: /\bclearRoomMissedCallBadge\b/ },
  { id: "call:useNotificationBadgeTotal", re: /\buseNotificationBadgeTotal\s*\(/ },
];

function walk(dirRel, acc = []) {
  const abs = join(root, dirRel);
  if (!existsSync(abs)) return acc;
  for (const ent of readdirSync(abs, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const rel = `${dirRel}/${ent.name}`.replace(/\\/g, "/");
    if (ent.isDirectory()) {
      walk(rel, acc);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(ent.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

for (const rel of DELETED_FILES) {
  if (existsSync(join(root, rel))) {
    errors.push(`deleted file still exists: ${rel}`);
  }
}

const files = SCAN_ROOTS.flatMap((d) => walk(d));
for (const rel of files) {
  if (ALLOWLIST_REL.has(rel)) continue;
  const src = readFileSync(join(root, rel), "utf8");
  for (const { id, re } of FORBIDDEN_PATTERNS) {
    if (re.test(src)) {
      errors.push(`${rel}: forbidden ${id}`);
    }
  }
}

if (errors.length) {
  console.error("verify:badge-import-ban FAIL\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log("verify:badge-import-ban PASS");
console.log(`  scanned=${files.length} deleted_files_absent=${DELETED_FILES.length}`);
