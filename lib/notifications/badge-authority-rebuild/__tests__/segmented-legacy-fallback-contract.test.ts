/**
 * Gate 3 Step 13 — Segmented legacy fallback removed; canonical authority paths stay independent.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SEGMENTED_UNREAD_LEGACY_FALLBACK_DELETED,
} from "@/lib/notifications/fetch-segmented-unread-count-server";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import { resolveMemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import { resolveMemberAppIconAuthority } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { generalDirectRoomIdentity } from "@/lib/chat-domain/room-identity";
import { resolveStoreOwnerAuthority } from "@/lib/notifications/badge-authority-rebuild/store-owner-c-authority";
import { storeBadgeIdentity } from "@/lib/notifications/badge-authority-rebuild/badge-recipient-identity";

const root = process.cwd();
const MEMBER = "member-seg-1";

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Gate3 Step13 Segmented Legacy Fallback DELETE", () => {
  it("marker present; legacy COUNT helpers and notifications fallback removed", () => {
    expect(SEGMENTED_UNREAD_LEGACY_FALLBACK_DELETED).toBe(
      "gate3_step13_segmented_legacy_fallback_deleted"
    );
    const src = read("lib/notifications/fetch-segmented-unread-count-server.ts");
    expect(src).toContain("SEGMENTED_UNREAD_LEGACY_FALLBACK_DELETED");
    expect(src).not.toContain("countNotificationUnreadSegmentedLegacy");
    expect(src).not.toContain("countOwnerStoreCommerceUnreadServer");
    expect(src).not.toContain("countConsumerUnreadNoChatServer");
    expect(src).not.toContain("countBottomNavUnreadServer");
    expect(src).not.toContain('from("notifications")');
    expect(src).not.toContain("isRpcMissing");
    // RPC-only: error must throw, not fall through
    expect(src).toMatch(/if\s*\(\s*error\s*\)\s*\{\s*throw error/);
  });

  it("route unread_count_only uses segmented server without reintroducing legacy helpers", () => {
    const route = read("app/api/me/notifications/route.ts");
    expect(route).toContain("countNotificationUnreadSegmentedServer");
    expect(route).not.toContain("countNotificationUnreadSegmentedLegacy");
    expect(route).toContain("no legacy notifications COUNT");
  });

  it("product badge-count builder does not import segmented unread server", () => {
    const http = read("lib/notifications/pipeline/build-domain-badge-authority-http.ts");
    expect(http).not.toContain("fetch-segmented-unread-count-server");
    expect(http).not.toContain("countNotificationUnreadSegmentedServer");
    const store = read("lib/notifications/notification-badge-count-store.ts");
    expect(store).toContain("/api/me/notifications/badge-count");
    expect(store).not.toContain("countNotificationUnreadSegmentedServer");
  });

  it("Tier1 surface unread stays on badge_surface / notification_targets", () => {
    const tier1 = read("lib/notifications/resolve-tier1-bell-surface.ts");
    expect(tier1).toContain('sp.set("badge_surface", surface)');
    expect(tier1).not.toContain("exclude_owner_store_commerce");
  });

  it("A/B/C/App Icon resolve without segmented path", () => {
    const a = resolveMemberNotificationAuthorityFromRows(
      [
        {
          id: "a1",
          user_id: MEMBER,
          unread: true,
          read_at: null,
          type: "admin_notice",
          category: "admin_notice",
          dedupe_key: "admin:a1",
          display_payload: {},
        },
      ],
      MEMBER
    );
    const b = resolveMemberConversationAuthority(MEMBER, [
      {
        roomId: "r1",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "peer").identityKey,
        peerUserId: "peer",
        memberId: MEMBER,
      },
    ]);
    const icon = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
      revision: 1,
    });
    expect(icon.appIconTotal).toBe(a.unreadCount + b.totalUnreadRooms);

    const storeId = "store-seg-1";
    const sid = storeBadgeIdentity(storeId);
    expect(sid.ok).toBe(true);
    if (!sid.ok) return;
    const c = resolveStoreOwnerAuthority({
      storeId,
      operational: {
        pendingOrderActions: 2,
        refundActions: 0,
        cancelActions: 0,
        openInquiryActions: 0,
      },
      chatRooms: [],
      revision: 1,
    });
    expect(c).not.toBeNull();
    expect(c!.storeKey).toBe(sid.identity.key);
    expect(c!.cOperational).toBe(2);
    expect(icon.appIconTotal).toBe(a.unreadCount + b.totalUnreadRooms);
  });
});
