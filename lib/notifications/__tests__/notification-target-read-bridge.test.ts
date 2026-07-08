import { beforeEach, describe, expect, it, vi } from "vitest";

const clearMessengerRoomNotificationTargetAfterRead = vi.fn();
const clearNotificationTarget = vi.fn();

vi.mock("@/lib/notifications/notification-target-messenger-bridge", () => ({
  clearMessengerRoomNotificationTargetAfterRead: (...args: unknown[]) =>
    clearMessengerRoomNotificationTargetAfterRead(...args),
}));

vi.mock("@/lib/notifications/notification-targets", () => ({
  clearNotificationTarget: (...args: unknown[]) => clearNotificationTarget(...args),
}));

import {
  clearNotificationTargetsAfterRoomRead,
  clearNotificationTargetsAfterThreadRead,
} from "@/lib/notifications/notification-target-read-bridge";

function tradeTargetQuery(data: Array<{ target_id: string }> = [{ target_id: "post-1:seller-1:buyer-1" }]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    like: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe("notification-target-read-bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMessengerRoomNotificationTargetAfterRead.mockResolvedValue(undefined);
    clearNotificationTarget.mockResolvedValue(undefined);
  });

  it("delegates room read target clear to messenger bridge", async () => {
    const sb = {} as never;
    await clearNotificationTargetsAfterRoomRead(sb, "user-1", "room-1");
    expect(clearMessengerRoomNotificationTargetAfterRead).toHaveBeenCalledWith(
      sb,
      "user-1",
      "room-1"
    );
  });

  it("clears buyer and owner order targets for order detail read", async () => {
    const sb = {} as never;
    await clearNotificationTargetsAfterThreadRead(sb, "user-1", {
      threadId: "order-1",
      threadType: "order",
      readReason: "order_detail_opened",
    });
    expect(clearNotificationTarget).toHaveBeenCalledWith(sb, {
      userId: "user-1",
      targetType: "buyer_order",
      targetId: "order-1",
    });
    expect(clearNotificationTarget).toHaveBeenCalledWith(sb, {
      userId: "user-1",
      targetType: "owner_order",
      targetId: "order-1",
    });
  });

  it("clears community post target for community detail read", async () => {
    const sb = {} as never;
    await clearNotificationTargetsAfterThreadRead(sb, "user-1", {
      threadId: "post-1",
      threadType: "community_post",
      readReason: "community_post_opened",
    });
    expect(clearNotificationTarget).toHaveBeenCalledWith(sb, {
      userId: "user-1",
      targetType: "community_post",
      targetId: "post-1",
    });
  });

  it("delegates chat room thread read to messenger bridge", async () => {
    const sb = {} as never;
    await clearNotificationTargetsAfterThreadRead(sb, "user-1", {
      threadId: "room-1",
      threadType: "chat_room",
      readReason: "chat_room_visible",
    });
    expect(clearMessengerRoomNotificationTargetAfterRead).toHaveBeenCalledWith(
      sb,
      "user-1",
      "room-1"
    );
  });

  it("clears unread trade targets that belong to the opened product", async () => {
    const query = tradeTargetQuery([
      { target_id: "post-1:seller-1:buyer-1" },
      { target_id: "post-1:seller-2:buyer-2" },
    ]);
    const sb = { from: vi.fn(() => query) };
    await clearNotificationTargetsAfterThreadRead(sb as never, "user-1", {
      threadId: "post-1",
      threadType: "trade_room",
      readReason: "trade_detail_opened",
    });
    expect(sb.from).toHaveBeenCalledWith("notification_targets");
    expect(query.like).toHaveBeenCalledWith("target_id", "post-1:%");
    expect(clearNotificationTarget).toHaveBeenCalledWith(sb, {
      userId: "user-1",
      targetType: "trade",
      targetId: "post-1:seller-1:buyer-1",
    });
    expect(clearNotificationTarget).toHaveBeenCalledWith(sb, {
      userId: "user-1",
      targetType: "trade",
      targetId: "post-1:seller-2:buyer-2",
    });
  });
});
