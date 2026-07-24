/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyNotificationBadgeProjection,
} from "@/lib/messenger/contracts/domain-badge-authority-product-bridge";
import { buildNotificationBadgeProjection, EMPTY_NON_CHAT_EVENT_ATTENTION } from "@/lib/notifications/build-notification-badge-projection";
import {
  getNotificationBadgeCountSnapshot,
  resetNotificationBadgeCountStoreForTests,
  patchNotificationBadgeCountSnapshot,
} from "@/lib/notifications/notification-badge-count-store";
import { getAppIconBadgeProjection } from "@/lib/chat-domain/projections/app-icon-badge-projection";
import "@/lib/notifications/notification-badge-count-store";

describe("Bell vs App Icon separation + poll revision", () => {
  beforeEach(() => {
    resetNotificationBadgeCountStoreForTests();
  });

  it("K. App Icon is not Bell total mirror", () => {
    const projection = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 0, trade: 1, store_order: 0 },
      orphanMissedCall: 1,
      nonChatEventAttention: {
        ...EMPTY_NON_CHAT_EVENT_ATTENTION,
        adminNotice: 4,
      },
    });
    applyNotificationBadgeProjection(projection, { applyBell: true, projectionVersionMs: 1000 });
    const bell = getNotificationBadgeCountSnapshot();
    const appIcon = getAppIconBadgeProjection();
    expect(bell?.total).toBe(2 + 1 + 1 + 4);
    expect(appIcon?.totalUnread).toBe(2 + 1 + 1); // messenger+trade+orphan
    expect(appIcon?.source).not.toBe("bell_mirror");
    expect(appIcon?.totalUnread).not.toBe(bell?.total);
  });

  it("H. stale poll version does not overwrite newer realtime", () => {
    const newer = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 3, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    applyNotificationBadgeProjection(newer, { applyBell: true, projectionVersionMs: 5000 });
    expect(getNotificationBadgeCountSnapshot()?.total).toBe(3);

    const stale = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    const applied = patchNotificationBadgeCountSnapshot(stale.bell, "network", 1000);
    expect(applied).toBe(false);
    expect(getNotificationBadgeCountSnapshot()?.total).toBe(3);
  });
});
