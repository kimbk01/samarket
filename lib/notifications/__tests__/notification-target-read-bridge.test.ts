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
  clearNotificationTargetsForLegacyInboxRow,
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
    expect(clearNotificationTarget).toHaveBeenCalledWith(sb, {
      userId: "user-1",
      targetType: "chat_room",
      targetId: "room-1",
    });
    expect(clearMessengerRoomNotificationTargetAfterRead).toHaveBeenCalledWith(
      sb,
      "user-1",
      "room-1"
    );
  });

  it("always clears chat_room target before messenger bridge even for trade-linked rooms", async () => {
    const sb = {} as never;
    clearMessengerRoomNotificationTargetAfterRead.mockImplementation(async () => {
      await clearNotificationTarget(sb, {
        userId: "user-1",
        targetType: "trade",
        targetId: "post-1:seller-1:buyer-1",
      });
    });
    await clearNotificationTargetsAfterRoomRead(sb, "user-1", "room-trade-1");
    expect(clearNotificationTarget).toHaveBeenNthCalledWith(1, sb, {
      userId: "user-1",
      targetType: "chat_room",
      targetId: "room-trade-1",
    });
    expect(clearMessengerRoomNotificationTargetAfterRead).toHaveBeenCalledWith(
      sb,
      "user-1",
      "room-trade-1"
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

  function tradeDetailSb(opts: {
    targets: string[];
    chats: Array<{ seller_id: string; buyer_id: string; community_messenger_room_id: string }>;
    unreadRooms: string[];
  }) {
    const targetQuery = tradeTargetQuery(opts.targets.map((target_id) => ({ target_id })));
    const chatQuery = { select: vi.fn(() => chatQuery), eq: vi.fn(async () => ({ data: opts.chats, error: null })) };
    const partQuery = {
      select: vi.fn(() => partQuery),
      eq: vi.fn(() => partQuery),
      in: vi.fn(() => partQuery),
      gt: vi.fn(async () => ({ data: opts.unreadRooms.map((room_id) => ({ room_id })), error: null })),
    };
    const sb = {
      from: vi.fn((table: string) =>
        table === "notification_targets" ? targetQuery : table === "product_chats" ? chatQuery : partQuery
      ),
    };
    return { sb, targetQuery };
  }

  it("clears trade targets of the opened product that have no unread chat", async () => {
    const { sb, targetQuery } = tradeDetailSb({
      targets: ["post-1:seller-1:buyer-1", "post-1:seller-1:buyer-2"],
      chats: [
        { seller_id: "seller-1", buyer_id: "buyer-1", community_messenger_room_id: "room-1" },
        { seller_id: "seller-1", buyer_id: "buyer-2", community_messenger_room_id: "room-2" },
      ],
      unreadRooms: [],
    });
    await clearNotificationTargetsAfterThreadRead(sb as never, "user-1", {
      threadId: "post-1",
      threadType: "trade_room",
      readReason: "trade_detail_opened",
    });
    expect(targetQuery.like).toHaveBeenCalledWith("target_id", "post-1:%");
    expect(clearNotificationTarget).toHaveBeenCalledTimes(2);
    expect(clearNotificationTarget).toHaveBeenCalledWith(sb, {
      userId: "user-1",
      targetType: "trade",
      targetId: "post-1:seller-1:buyer-2",
    });
  });

  it("P-5: product detail open keeps trade targets whose chat still has unread messages", async () => {
    const { sb } = tradeDetailSb({
      targets: ["post-1:seller-1:buyer-1", "post-1:seller-1:buyer-2"],
      chats: [
        { seller_id: "seller-1", buyer_id: "buyer-1", community_messenger_room_id: "room-1" },
        { seller_id: "seller-1", buyer_id: "buyer-2", community_messenger_room_id: "room-2" },
      ],
      unreadRooms: ["room-2"],
    });
    await clearNotificationTargetsAfterThreadRead(sb as never, "user-1", {
      threadId: "post-1",
      threadType: "trade_room",
      readReason: "trade_detail_opened",
    });
    expect(clearNotificationTarget).toHaveBeenCalledTimes(1);
    expect(clearNotificationTarget).toHaveBeenCalledWith(sb, {
      userId: "user-1",
      targetType: "trade",
      targetId: "post-1:seller-1:buyer-1",
    });
  });

  it("clears legacy buyer order target from commerce row", async () => {
    const sb = {} as never;
    await clearNotificationTargetsForLegacyInboxRow(sb, "user-1", {
      notification_type: "commerce",
      ref_id: "ord-1",
      meta: { kind: "store_order_owner_status", order_id: "ord-1" },
    });
    expect(clearNotificationTarget).toHaveBeenCalledWith(sb, {
      userId: "user-1",
      targetType: "buyer_order",
      targetId: "ord-1",
    });
  });
});
