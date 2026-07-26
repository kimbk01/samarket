/**
 * @vitest-environment jsdom
 *
 * Owner FAB / Owner Header meaning LOCK.
 *
 * Owner FAB  = Owner-role store attention only
 *   orders     = orderAttention
 *   store      = inquiryAttention + ownerReviewAttention
 *   orderChat  = storeOrderChatUnread (current hub store scope)
 * Owner Header = same Owner projection sum (operations center attention)
 *
 * DO NOT include: Customer buyer_order, General/Group, Trade, App Icon total, Bell.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_HUB_BADGE_EMPTY, type OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import {
  resolveFabOwnerOrderChatBadgeCount,
  resolveFabOwnerOrdersBadgeCount,
  resolveFabOwnerStoreBadgeCount,
  resolveOwnerOperationsCenterAttentionCount,
} from "@/lib/stores/owner-store-badge-display-policy";
import {
  __resetOwnerHubBadgeStoreForTest,
  __testApplyOwnerHubBadgePayloadForTest,
  subscribeOwnerHubBadge,
} from "@/lib/chats/owner-hub-badge-store";

function ownerBreakdown(overrides: Partial<OwnerHubBadgeBreakdown> = {}): OwnerHubBadgeBreakdown {
  return {
    ...OWNER_HUB_BADGE_EMPTY,
    orderAttention: 5,
    inquiryAttention: 1,
    ownerReviewAttention: 2,
    storeOrderChatUnread: 8,
    ...overrides,
  };
}

/** Owner surface values as one tuple — used to assert "no change" across noise. */
function ownerSurfaceValues(bd: OwnerHubBadgeBreakdown) {
  return {
    fabOrders: resolveFabOwnerOrdersBadgeCount(bd),
    fabStore: resolveFabOwnerStoreBadgeCount(bd),
    fabOrderChat: resolveFabOwnerOrderChatBadgeCount(bd),
    header: resolveOwnerOperationsCenterAttentionCount(bd),
  };
}

describe("Owner FAB / Header value contract", () => {
  it("locks each Owner surface input axis", () => {
    const bd = ownerBreakdown();
    expect(resolveFabOwnerOrdersBadgeCount(bd)).toBe(5);
    expect(resolveFabOwnerStoreBadgeCount(bd)).toBe(1 + 2);
    expect(resolveFabOwnerOrderChatBadgeCount(bd)).toBe(8);
    expect(resolveOwnerOperationsCenterAttentionCount(bd)).toBe(5 + 3 + 8);
  });

  it("Customer buyer_order unread does not change Owner FAB/Header", () => {
    const before = ownerSurfaceValues(ownerBreakdown({ buyerOrderAttention: 0 }));
    const after = ownerSurfaceValues(ownerBreakdown({ buyerOrderAttention: 7 }));
    expect(after).toEqual(before);
  });

  it("General/Group messenger unread does not change Owner FAB/Header", () => {
    const before = ownerSurfaceValues(ownerBreakdown({ communityMessengerUnread: 0 }));
    const after = ownerSurfaceValues(ownerBreakdown({ communityMessengerUnread: 9 }));
    expect(after).toEqual(before);
  });

  it("Trade unread does not change Owner FAB/Header", () => {
    const before = ownerSurfaceValues(ownerBreakdown({ chatUnread: 0 }));
    const after = ownerSurfaceValues(ownerBreakdown({ chatUnread: 6 }));
    expect(after).toEqual(before);
  });

  it("App Icon aggregate axes do not change Owner FAB/Header", () => {
    const before = ownerSurfaceValues(ownerBreakdown());
    const after = ownerSurfaceValues(
      ownerBreakdown({
        /** global owner aggregate (App Icon axis) — FAB stays store-scoped */
        storeOrderOwnerUnreadRooms: 42,
        socialChatUnread: 30,
        total: 99,
      })
    );
    expect(after).toEqual(before);
  });

  it("Owner store A change does not leak into store B FAB order chat", () => {
    const storeA = ownerBreakdown({ storeOrderChatUnread: 3, storeOrderOwnerUnreadRooms: 3 });
    const storeB = ownerBreakdown({ storeOrderChatUnread: 0, storeOrderOwnerUnreadRooms: 3 });
    expect(resolveFabOwnerOrderChatBadgeCount(storeA)).toBe(3);
    expect(resolveFabOwnerOrderChatBadgeCount(storeB)).toBe(0);
  });

  it("same Owner values resolve identically (idempotent)", () => {
    const bd = ownerBreakdown();
    expect(ownerSurfaceValues(bd)).toEqual(ownerSurfaceValues(ownerBreakdown()));
  });

  it("each Owner axis change moves only its own surface value", () => {
    const base = ownerSurfaceValues(ownerBreakdown());
    const orders = ownerSurfaceValues(ownerBreakdown({ orderAttention: 6 }));
    expect(orders.fabOrders).toBe(base.fabOrders + 1);
    expect(orders.fabStore).toBe(base.fabStore);
    expect(orders.fabOrderChat).toBe(base.fabOrderChat);

    const chat = ownerSurfaceValues(ownerBreakdown({ storeOrderChatUnread: 9 }));
    expect(chat.fabOrderChat).toBe(base.fabOrderChat + 1);
    expect(chat.fabOrders).toBe(base.fabOrders);
    expect(chat.fabStore).toBe(base.fabStore);
  });
});

describe("Owner hub store notify contract (FAB/Header source)", () => {
  beforeEach(() => {
    __resetOwnerHubBadgeStoreForTest();
  });

  function hubPayload(overrides: Partial<OwnerHubBadgeBreakdown> = {}) {
    return { ok: true, ...ownerBreakdown(overrides) };
  }

  it("same payload re-apply does not notify subscribers", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload(), "network_fresh");
    const onChange = vi.fn();
    subscribeOwnerHubBadge(onChange);
    onChange.mockClear();

    __testApplyOwnerHubBadgePayloadForTest(hubPayload(), "network_fresh");
    __testApplyOwnerHubBadgePayloadForTest(hubPayload(), "network_fresh");
    expect(onChange).toHaveBeenCalledTimes(0);
  });

  it("Owner axis change notifies exactly once", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload(), "network_fresh");
    const onChange = vi.fn();
    subscribeOwnerHubBadge(onChange);
    onChange.mockClear();

    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ orderAttention: 6 }), "network_fresh");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
