/**
 * GATE 4 — bridge safety: legacy readers/hints must not become badge authority.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectionInputFromBadgeCountAuthorityJson } from "@/lib/notifications/apply-badge-count-authority-response";
import { resolveMemberAppIconAuthority } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import { resolveMemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import { MEMBER_NOTIFICATION_A_LOAD_LIMIT } from "@/lib/notifications/badge-authority-rebuild/load-member-notification-a-authority";
import { generalDirectRoomIdentity } from "@/lib/chat-domain/room-identity";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const MEMBER = "member-bridge-safety";

describe("bridge-safety-countNotificationEventsBadge", () => {
  it("HTTP builder documents badge fetch as non-digit bridge", () => {
    const http = read("lib/notifications/pipeline/build-domain-badge-authority-http.ts");
    expect(http).toContain("countNotificationEventsBadge");
    expect(http).toMatch(/BRIDGE[\s\S]{0,120}categoryCounts|category diagnostics/);
    expect(http).toContain("notificationA.unreadCount");
    expect(http).toContain("memberUnreadNotificationCount = notificationA.unreadCount");
  });
});

describe("bridge-safety-projection-bellTotal", () => {
  it("wrong projection.bellTotal cannot override canonical memberUnreadNotificationCount", () => {
    const input = projectionInputFromBadgeCountAuthorityJson({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
      storeOrderBuyerDeliveryUnread: 0,
      notificationAttentionTotal: 99,
      memberUnreadNotificationCount: 3,
      orphanMissedCallCount: 0,
      projection: { bellTotal: 99 },
      total: 99,
    });
    expect(input).not.toBeNull();
    expect(input!.memberUnreadNotificationCount).toBe(3);
    expect(input!.bell?.total).toBe(3);
    expect(input!.notificationAttentionTotal).toBe(3);
  });
});

describe("bridge-safety-fcm-apns-numeric-hint", () => {
  it("native adapters ignore send-time badge as launcher authority", () => {
    const android = read("android/app/src/main/java/com/dibay/app/DibayAppIconDeliveryAdapter.java");
    const ios = read("ios/App/App/Plugins/DibayAppIconDeliveryAdapter.swift");
    expect(android).toContain("fcm_hint_ignored");
    expect(android).not.toMatch(/onDomainNotificationPosted[\s\S]{0,80}apply\(context/);
    expect(ios).toContain("apns_fcm_badge_hint_ignored");
    expect(ios).not.toMatch(/apply\(appIconTotal:\s*badge\)/);
  });
});

describe("bridge-safety-a-scan-limit", () => {
  it("A load limit is explicit and App Icon remains A+B from authority objects", () => {
    expect(MEMBER_NOTIFICATION_A_LOAD_LIMIT).toBe(2000);
    const a = resolveMemberNotificationAuthorityFromRows(
      [
        {
          id: "n1",
          type: "admin_notice",
          category: "admin_notice",
          unread: true,
          read_at: null,
          dedupe_key: "n1",
          display_payload: {},
        },
      ],
      MEMBER
    );
    const b = resolveMemberConversationAuthority(MEMBER, [
      {
        memberId: MEMBER,
        roomId: "gd1",
        chatDomain: "general_direct",
        unreadMessageCount: 100,
        latestMessageId: "tip",
        leftAt: null,
        deletedAt: null,
        peerUserId: "p1",
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "p1").identityKey,
      },
    ]);
    const icon = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
      /** Member product contract: Owner O must be 0 on App Icon axis. */
      ownerOperationCount: 0,
      revision: 1,
    });
    expect(a.unreadCount).toBe(1);
    expect(b.totalUnreadRooms).toBe(1);
    expect(icon.appIconTotal).toBe(2);
    // If a caller wrongly injects Owner O, digit would drift — HTTP builder forces 0.
    const drifted = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
      ownerOperationCount: 99,
      revision: 1,
    });
    expect(drifted.appIconTotal).toBe(101);
    const http = read("lib/notifications/pipeline/build-domain-badge-authority-http.ts");
    expect(http).toContain("ownerOperationCount: 0");
  });
});
