#!/usr/bin/env node
/**
 * Chat read + badge SSOT static contract — route-only read 금지, thread read 연동.
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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const routeSync = read("components/push/NotificationRouteReadSync.tsx");
if (routeSync.includes("postNotificationRoomRead")) {
  fail("NotificationRouteReadSync must not call postNotificationRoomRead");
} else {
  pass("NotificationRouteReadSync has no postNotificationRoomRead");
}
if (!routeSync.includes("isNotificationReadDeferredChatRoomPath")) {
  fail("NotificationRouteReadSync must use isNotificationReadDeferredChatRoomPath");
} else {
  pass("NotificationRouteReadSync defers chat room read via policy helper");
}
if (routeSync.includes("/room-read") || routeSync.includes("room-read")) {
  fail("NotificationRouteReadSync must not call room-read API");
} else {
  pass("NotificationRouteReadSync has no room-read API call");
}

const chatDetail = read("components/chats/ChatDetailView.tsx");
if (!chatDetail.includes("tradeChatBootstrapReady") || !chatDetail.includes("postNotificationThreadRead")) {
  fail("ChatDetailView must gate trade read on bootstrap ready and sync notification_events");
} else {
  pass("ChatDetailView trade read gated with postNotificationThreadRead");
}
const mountOnlyRead =
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*fetch\(`\/api\/chat\/rooms\/\$\{room\.id\}\/read`/.test(chatDetail);
if (mountOnlyRead) {
  fail("ChatDetailView must not mount-only read without bootstrap gate");
} else {
  pass("ChatDetailView has no mount-only room read anti-pattern");
}

const cmHome = read("components/community-messenger/CommunityMessengerHome.tsx");
if (!cmHome.includes("postNotificationThreadRead")) {
  fail("CommunityMessengerHome markRoomRead must call postNotificationThreadRead on success");
} else {
  pass("CommunityMessengerHome manual mark_read syncs notification_events");
}

const cmEffect = read("lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts");
if (!cmEffect.includes("await postNotificationThreadRead")) {
  fail("use-messenger-room-open-mark-read-effect must await postNotificationThreadRead");
} else {
  pass("CM room open mark-read awaits notification thread read");
}
if (
  /notificationThreadReadDoneRef\.current\s*=\s*true;[\s\S]*(void\s+)?postNotificationThreadRead/.test(
    cmEffect
  )
) {
  fail("notificationThreadReadDoneRef must not be set before postNotificationThreadRead succeeds");
} else {
  pass("CM notification read done ref set only after API success path");
}

if (failed > 0) {
  console.error(`\nverify:notification-read-badge-contract — ${failed} failure(s)`);
  process.exit(1);
}
console.log("\nverify:notification-read-badge-contract — all checks passed");
process.exit(0);
