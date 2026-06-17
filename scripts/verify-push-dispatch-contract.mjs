#!/usr/bin/env node
/**
 * Push dispatch contract — no Realtime-only killed-state paths; dispatch module exists.
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

const requiredFiles = [
  "lib/push/dispatch/dispatch-push-for-user.ts",
  "lib/push/dispatch/load-active-push-targets.ts",
  "lib/push/dispatch/web-push-sender.ts",
  "lib/push/dispatch/fcm-sender.ts",
  "lib/push/dispatch/apns-sender.ts",
  "lib/push/send-community-messenger-call-canceled-push.ts",
  "lib/notifications/community-social-inapp-notify.ts",
  "app/api/me/devices/register/route.ts",
  "app/api/me/devices/deactivate/route.ts",
  "supabase/migrations/20260915100000_user_devices_notification_deliveries.sql",
  "lib/push/dispatch/apns-sender-impl.ts",
  "lib/push/dispatch/voip-apns-sender-impl.ts",
  "lib/push/native/register-native-push-client.ts",
  "app/api/admin/push/devices/route.ts",
  "app/api/admin/push/test/route.ts",
  "app/admin/push-devices/page.tsx",
  "android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java",
  "ios/App/App/Push/VoIPPushRegistry.swift",
  "ios/App/App/Push/CallKitProvider.swift",
  "docs/push-device-qa-checklist.md",
  "lib/platform/deep-link-routes.ts",
];

for (const rel of requiredFiles) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  else pass(`exists ${rel}`);
}

const pse = fs.readFileSync(path.join(root, "lib/notifications/publish-notification-side-effect.ts"), "utf8");
if (!pse.includes("trySendPushForNotification") || !pse.includes("dispatch")) {
  fail("publish-notification-side-effect must use push dispatch");
} else {
  pass("publish-notification-side-effect wired to dispatch");
}

const legacySend = fs.readFileSync(path.join(root, "app/api/chat/room/[roomId]/send/route.ts"), "utf8");
if (legacySend.includes('from("notifications").insert') && !legacySend.includes("notifyTradeChatInAppForRecipients")) {
  fail("legacy trade send route still uses direct notifications.insert without notifyTradeChatInAppForRecipients");
} else if (!legacySend.includes("notifyTradeChatInAppForRecipients")) {
  fail("legacy trade send route missing notifyTradeChatInAppForRecipients");
} else {
  pass("legacy trade send uses notifyTradeChatInAppForRecipients");
}

const service = fs.readFileSync(path.join(root, "lib/community-messenger/service.ts"), "utf8");
if (
  !service.includes("sendWebPushForCommunityMessengerCallTerminal") &&
  !service.includes("sendWebPushForCommunityMessengerCallCanceled")
) {
  fail("service.ts missing call terminal dismiss push");
} else {
  pass("call terminal dismiss push hooked in service.ts");
}

const likeRoute = fs.readFileSync(path.join(root, "app/api/community/posts/[postId]/like/route.ts"), "utf8");
if (!likeRoute.includes("notifyCommunityPostLikeReceived")) {
  fail("like route missing community social notify");
} else {
  pass("community like notify wired");
}

if (failed > 0) {
  console.error(`\nverify-push-dispatch-contract: ${failed} failure(s)`);
  process.exit(1);
}
console.log("\nverify-push-dispatch-contract: all checks passed");
