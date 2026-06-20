/**
 * 주문 채팅 메신저 방 진입 계약 — 회귀 검증 (정적).
 * npm run verify:store-order-messenger-room-entry
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(msg) {
  console.error(`[verify:store-order-messenger-room-entry] ${msg}`);
  process.exit(1);
}

const entry = read("lib/store-order-chat/store-order-messenger-room-entry-client.ts");
const ownerSlide = read("components/business/owner/OwnerStoreOrderChatSlidePanel.tsx");
const authority = read("lib/community-messenger/room/messenger-room-initial-snapshot-authority.ts");
const ensureBootstrap = read("lib/stores/store-order-ensure-chat-with-bootstrap.ts");

if (!entry.includes("parseEmbeddedRoomSnapshot")) {
  fail("entry client must parse ensure roomSnapshot via parseEmbeddedRoomSnapshot");
}
if (!entry.includes("peekRoomSnapshot")) {
  fail("entry client must peek cache before bootstrap (buyer 1-RTT path)");
}
if (!entry.includes("onShellReady")) {
  fail("entry client must support onShellReady before bootstrap fetch (owner instant shell)");
}
if (!entry.includes("instantContextMeta")) {
  fail("entry client must accept instantContextMeta for cm_ctx ensure fast path");
}
if (!entry.includes("assertStoreOrderRoomBootstrapHasTimelineSeed")) {
  fail("entry client must assert delivery room timeline seed");
}
if (/,\s*order\?\.community_messenger_room_id/.test(ownerSlide)) {
  fail("OwnerStoreOrderChatSlidePanel must not depend on order.community_messenger_room_id in effect deps");
}
if (!authority.includes("pickRichestAuthoritativeRoomSnapshot")) {
  fail("missing pickRichestAuthoritativeRoomSnapshot (incomplete seed authoritative ban)");
}
if (!authority.includes("isAuthoritativeMessengerRoomEntrySnapshot")) {
  fail("missing isAuthoritativeMessengerRoomEntrySnapshot entry contract");
}
if (!ensureBootstrap.includes("hydrateStoreOrderRoomFullMessageHistory")) {
  fail("ensure+bootstrap must hydrate full message history on server");
}

const timeline = read(
  "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx"
);
const layoutMode = read("lib/community-messenger/room/messenger-timeline-layout-mode.ts");
if (!layoutMode.includes("resolveUseDirectMessengerTimelineLayout")) {
  fail("missing resolveUseDirectMessengerTimelineLayout (delivery timeline regression guard)");
}
if (timeline.includes("cappedVirtualRows.length === 0")) {
  fail("useDirectTimelineLayout must not use cappedVirtualRows.length === 0 (fallback absolute regression)");
}
if (!timeline.includes("resolveUseDirectMessengerTimelineLayout")) {
  fail("timeline must use resolveUseDirectMessengerTimelineLayout");
}
if (timeline.includes("mt-auto flex w-full flex-col space-y-2.5")) {
  fail("mt-auto timeline anchor must not return (empty viewport on entry)");
}
if (!read("lib/community-messenger/room/use-messenger-room-store-order-dock-scroll-anchor.ts").includes("prev === 0")) {
  fail("store order dock anchor must skip scroll on first chrome measure");
}

const phase2Header = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
if (!phase2Header.includes("useStoreOrderDeliveryMessengerHeader")) {
  fail("Phase2 header must wire useStoreOrderDeliveryMessengerHeader for delivery rooms");
}
if (!phase2Header.includes("StoreOrderDeliveryMessengerHeaderBlock")) {
  fail("Phase2 header must render StoreOrderDeliveryMessengerHeaderBlock");
}
if (!phase2Header.includes("useOwnerOrderChatSlideHost")) {
  fail("Phase2 header must prefer owner slide closeSlide on back");
}
if (ownerSlide.includes("OwnerStoreOrderChatSlideOrderBanner")) {
  fail("OwnerStoreOrderChatSlidePanel must not render OwnerStoreOrderChatSlideOrderBanner");
}
if (ownerSlide.includes("OwnerStoreOrderModalSellerToolbar")) {
  fail("OwnerStoreOrderChatSlidePanel must not render OwnerStoreOrderModalSellerToolbar");
}
if (!read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2StoreOrderChrome.tsx").includes(
  "resolveDeliveryChromePrimaryLabel"
)) {
  fail("delivery chrome must use resolveDeliveryChromePrimaryLabel for role-based headline");
}
const bootstrapGate = read("components/community-messenger/room/CommunityMessengerRoomBootstrapGate.tsx");
if (!bootstrapGate.includes("canMountCommunityMessengerRoomClient")) {
  fail("BootstrapGate must gate RoomClient mount on authoritative bootstrap snapshot");
}
if (!bootstrapGate.includes("CommunityMessengerRoomStableEntryShell")) {
  fail("BootstrapGate must show entry shell while bootstrap pending");
}
if (bootstrapGate.includes("resolveInstantStoreOrderMessengerEntrySnapshot")) {
  fail("BootstrapGate must not mount RoomClient with instant incomplete shell snapshot");
}
if (!ownerSlide.includes("StoreDeliveryBufferingSpinner")) {
  fail("OwnerStoreOrderChatSlidePanel must use StoreDeliveryBufferingSpinner instead of connecting text");
}
if (ownerSlide.includes("store_owner_chat_connecting")) {
  fail("OwnerStoreOrderChatSlidePanel must not show store_owner_chat_connecting text while loading");
}

console.log("[verify:store-order-messenger-room-entry] ok");
