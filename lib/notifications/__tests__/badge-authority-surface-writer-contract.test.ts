/**
 * Phase 3-2 / 4 — Bottom Chat single writer + reintro bans (static).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("badge authority surface writer contracts (2026-07-31)", () => {
  it("Bottom Chat product digit reads Messenger projection only", () => {
    const hook = read("lib/chats/use-owner-hub-badge-total.ts");
    expect(hook).toContain('if (icon === "chat")');
    expect(hook).toContain("subscribeMessengerChatTabBadge");
    expect(hook).toContain("resolveMessengerChatTabBadgeCount(hasOwnerStoreRef.current)");
    // Must not pass hub breakdown into chat digit on the live path.
    expect(hook).not.toMatch(
      /icon === "chat"[\s\S]{0,200}resolveMessengerChatTabBadgeCount\([^)]+,\s*s\)/
    );
  });

  it("applyMessengerBottomChatUnread is only called from Domain hub optimistic apply", () => {
    const hub = read("lib/chats/owner-hub-badge-store.ts");
    const matches = hub.match(/applyMessengerBottomChatUnread\(/g) ?? [];
    expect(matches.length).toBe(1);
    const fnIdx = hub.indexOf("export function applyDomainAuthorityHubBadgeOptimistic");
    const callIdx = hub.indexOf("applyMessengerBottomChatUnread(");
    expect(fnIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(fnIdx);
    const nextExport = hub.indexOf("\nexport ", fnIdx + 10);
    expect(nextExport === -1 || callIdx < nextExport).toBe(true);
  });

  it("Hub publisher forwards complete Projection axes without cache arithmetic", () => {
    const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
    const hub = read("lib/chats/owner-hub-badge-store.ts");
    expect(bridge).toContain("buyerOrderAttention: projection.storeOrderCustomerUnreadRooms");
    expect(bridge).toContain("socialChatUnread: projection.socialChatUnread");
    expect(hub).toContain("buyerOrderAttention: input.buyerOrderAttention");
    expect(hub).toContain("socialChatUnread: input.socialChatUnread");
    expect(hub).not.toContain("communityMessengerUnread + philife");
    expect(hub).not.toContain("input.buyerOrderAttention != null");
  });

  it("App Icon product path forbids split shell/missedCall publish", () => {
    const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
    expect(bridge).toContain("publishDomainAppIconCompleteSnapshot");
    expect(bridge).not.toContain("publishDomainBadgeShellToSurfaceStore");
    expect(bridge).not.toContain("publishMissedCallToDomainBadgeSurface");
  });

  it("NativeBadgeSync never mirrors Bell total", () => {
    const native = read("components/push/NativeBadgeSync.tsx");
    expect(native).toContain("surface.appIconTotal");
    expect(native).not.toContain("bellTotal");
    expect(native).not.toContain("getNotificationBadgeCountSnapshot");
  });

  it("Push dispatcher uses MemberAppIconTotal for FCM (Slice 2-6)", () => {
    const push = read("lib/notifications/pipeline/notify-push-dispatcher.ts");
    expect(push).toContain("fetchDomainBadgeAuthorityPayload");
    expect(push).toContain("resolveMemberAppIconTotalForNativeFcm");
    expect(push).toContain("memberAppIconWebTotal");
    expect(push).not.toMatch(/badge_count:\s*bell/i);
  });

  it("logout resets Domain App Icon surface auth epoch", () => {
    const wipe = read("lib/auth/client-session-wipe.ts");
    expect(wipe).toContain("resetDomainBadgeSurfaceForAuthEpoch");
    expect(wipe).toContain("resetOwnerHubBadgeStoreForAuthEpoch");
  });

  it("trade Bell href and FCM trade route share CM room path", () => {
    const merge = read("lib/notifications/inbox-events-merge.ts");
    expect(merge).toContain('type === "trade_message"');
    expect(merge).toContain("buildChatRoomWebPath(roomId)");
    expect(merge).not.toContain("buildTradeLegacyChatWebPath(roomId)");

    const fcm = read("lib/push/resolve-push-route-from-fcm-data.ts");
    expect(fcm).toContain('type === "trade_message"');
    expect(fcm).toContain("buildChatRoomWebPath(roomId)");
    expect(fcm).toContain("buildGroupChatWebPath(roomId)");
    expect(fcm).not.toContain("?type=group");
  });
});
