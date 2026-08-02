import { describe, expect, it } from "vitest";
import { projectionInputFromBadgeCountAuthorityJson } from "@/lib/notifications/apply-badge-count-authority-response";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";

describe("badge-count orphanMissedCallCount → App Icon B_missed wire", () => {
  it("maps top-level orphanMissedCallCount to memberMissedCallCount; Bell stays A_member", () => {
    const input = projectionInputFromBadgeCountAuthorityJson({
      authority: "domain_badge",
      notificationAttentionTotal: 2,
      orphanMissedCallCount: 1,
      domainUnreadRooms: {
        general_direct: 1,
        group: 0,
        trade: 1,
        store_order: 0,
      },
      storeOrderBuyerDeliveryUnread: 1,
      storeOrderOwnerChatUnread: 9,
      domainAppIcon: {
        messenger: 1,
        trade: 1,
        storeOrder: 1,
        // overloaded wire — must not replace explicit orphan field
        missedCall: 99,
      },
    });
    expect(input).not.toBeNull();
    expect(input!.notificationAttentionTotal).toBe(2);
    expect(input!.orphanMissedCall).toBe(1);
    expect(input!.memberMissedCallCount).toBe(1);
    expect(input!.bell?.total).toBe(2);

    const projection = buildNotificationBadgeProjection(input!);
    expect(projection.bellTotal).toBe(2);
    // A(2) + GD(1) + Trade(1) + Customer(1) + orphan(1) = 6; owner rooms excluded
    expect(projection.appIconTotal).toBe(6);
    expect(projection.appIcon.storeOrder).toBe(1);
  });

  it("without orphanMissedCallCount does not invent B_missed from icon.missedCall when A is present", () => {
    const input = projectionInputFromBadgeCountAuthorityJson({
      notificationAttentionTotal: 3,
      domainUnreadRooms: {
        general_direct: 0,
        group: 0,
        trade: 0,
        store_order: 0,
      },
      storeOrderBuyerDeliveryUnread: 0,
      domainAppIcon: { messenger: 0, trade: 0, storeOrder: 0, missedCall: 7 },
    });
    expect(input!.orphanMissedCall).toBe(0);
    expect(input!.memberMissedCallCount).toBeUndefined();
    const projection = buildNotificationBadgeProjection(input!);
    expect(projection.bellTotal).toBe(3);
    expect(projection.appIconTotal).toBe(3);
  });
});
