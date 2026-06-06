import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  markPriorBuyerOrderStatusNotificationsRead,
  notifyBuyerStoreOrderOwnerStatus,
} from "@/lib/notifications/notify-store-commerce";

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async () => true),
}));

vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: vi.fn(),
}));

import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { invalidateNotificationUnreadCountCache } from "@/lib/notifications/notification-unread-count-cache";

function makeSb(updateResult: { error: null | { message: string } } = { error: null }) {
  const updateChain = {
    eq: vi.fn(function eq(this: unknown) {
      return updateChain;
    }),
    or: vi.fn(async () => updateResult),
  };
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => updateChain),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { preferred_language: "ko", store_name: "Test Store" },
          })),
        })),
      })),
    })),
    updateChain,
  } as unknown as Parameters<typeof markPriorBuyerOrderStatusNotificationsRead>[0];
}

describe("markPriorBuyerOrderStatusNotificationsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks prior unread store_order_owner_status for same order", async () => {
    const sb = makeSb();
    await markPriorBuyerOrderStatusNotificationsRead(sb, "user-1", "order-abc");
    expect(sb.from).toHaveBeenCalledWith("notifications");
    expect(invalidateNotificationUnreadCountCache).toHaveBeenCalledWith("user-1");
  });
});

describe("notifyBuyerStoreOrderOwnerStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-reads prior status rows then inserts with push_kind delivery", async () => {
    const sb = makeSb();
    await notifyBuyerStoreOrderOwnerStatus(sb, {
      buyerUserId: "user-1",
      orderId: "order-abc",
      orderNo: "SO123",
      storeId: "store-1",
      nextStatus: "preparing",
    });

    expect(invalidateNotificationUnreadCountCache).toHaveBeenCalled();
    expect(appendUserNotification).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        user_id: "user-1",
        push_kind: "delivery",
        ref_id: "order-abc",
        meta: expect.objectContaining({
          kind: "store_order_owner_status",
          order_status: "preparing",
        }),
      })
    );
  });
});
