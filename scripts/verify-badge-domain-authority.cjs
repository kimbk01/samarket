/**
 * Badge domain authority — Owner hub badge is Owner domain summary input, not Bell/Bottom Chat writer.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const tab = read("lib/chats/use-owner-hub-badge-total.ts");
if (!/case "chat":[\s\S]*resolveMessengerChatTabBadgeCount/.test(tab)) {
  failures.push("Bottom Chat badge must resolve via messenger chat tab badge, not raw Owner list");
}
if (/case "chat":[\s\S]*store_order|trade_unread/.test(tab)) {
  failures.push("Bottom Chat must not sum trade/store_order unread");
}
if (
  /icon === "chat"[\s\S]*getOwnerHubBadgeSnapshot\(\)/.test(tab) &&
  /resolveMessengerChatTabBadgeCount\(hasOwnerStoreRef\.current,\s*getOwnerHubBadgeSnapshot\(\)\)/.test(
    tab
  )
) {
  failures.push("Bottom Chat getSnapshot must not read Owner hub snapshot");
}

const chatBadge = read("lib/notifications/messenger-chat-tab-badge.ts");
if (/subscribeOwnerHubBadge|getOwnerHubBadgeSnapshot/.test(chatBadge)) {
  failures.push("messenger-chat-tab-badge must not subscribe Owner hub");
}
if (!chatBadge.includes("subscribeMessengerBottomChatUnread")) {
  failures.push("messenger-chat-tab-badge must subscribe Messenger bottom-chat projection");
}
if (!chatBadge.includes("getMessengerBottomChatUnreadCount")) {
  failures.push("messenger-chat-tab-badge must read Messenger bottom-chat projection count");
}

const projection = read("lib/notifications/messenger-bottom-chat-unread-projection.ts");
if (/owner-hub-badge-store|storeOrderOwner|tradeUnread|buyerOrderAttention/.test(projection)) {
  failures.push("Messenger bottom-chat projection must not import Owner/Trade/Store aggregates");
}

const bellCandidates = [
  "lib/notifications/notification-badge-count-store.ts",
  "lib/notifications/notification-unread-badge-store.ts",
];
for (const rel of bellCandidates) {
  if (!fs.existsSync(path.join(root, rel))) continue;
  const text = read(rel);
  if (/owner-store-orders-list-cache|buyer-store-orders-list-snapshot-cache/.test(text)) {
    failures.push(`${rel}: Bell/badge store must not import Delivery order list caches`);
  }
}

const hub = read("lib/chats/owner-hub-badge-store.ts");
if (/delivery-customer:|invalidateBuyerStoreOrdersList|invalidateMeStoreOrderClientCaches/.test(hub)) {
  failures.push("owner-hub-badge-store must not write Customer delivery caches");
}

if (failures.length) {
  console.error("[verify:badge-domain-authority] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:badge-domain-authority] OK — badge writers stay domain-scoped");
