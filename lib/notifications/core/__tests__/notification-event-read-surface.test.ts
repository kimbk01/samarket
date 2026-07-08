import { describe, expect, it, vi } from "vitest";
import {
  markCommunityPostNotificationEventsRead,
  markNotificationEventsReadByThread,
  markTradeStatusNotificationEventsReadByProductId,
} from "@/lib/notifications/core/notification-event-repository";

function fakeReadSb(rows: Array<{ id: string }> = [{ id: "evt-1" }]) {
  const q = {
    update: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    is: vi.fn(() => q),
    or: vi.fn(() => q),
    select: vi.fn(async () => ({ data: rows, error: null })),
  };
  return {
    from: vi.fn(() => q),
    q,
  };
}

describe("markCommunityPostNotificationEventsRead", () => {
  it("marks community_activity events by post id payload fields", async () => {
    const sb = fakeReadSb([{ id: "evt-community-1" }]);

    const count = await markCommunityPostNotificationEventsRead(sb as never, "user-1", "post-abc");

    expect(count).toBe(1);
    expect(sb.q.in).toHaveBeenCalledWith("category", ["community_activity"]);
    expect(sb.q.or).toHaveBeenCalledWith(
      expect.stringContaining("display_payload->>legacyRefId.eq.post-abc")
    );
    expect(sb.q.or).toHaveBeenCalledWith(
      expect.stringContaining("display_payload->legacyMeta->>post_id.eq.post-abc")
    );
  });
});

describe("markTradeStatusNotificationEventsReadByProductId", () => {
  it("marks trade_status events by product id payload fields", async () => {
    const sb = fakeReadSb([{ id: "evt-trade-1" }]);

    const count = await markTradeStatusNotificationEventsReadByProductId(
      sb as never,
      "user-1",
      "product-xyz"
    );

    expect(count).toBe(1);
    expect(sb.q.in).toHaveBeenCalledWith("category", ["trade_status"]);
    expect(sb.q.or).toHaveBeenCalledWith(
      expect.stringContaining("display_payload->legacyMeta->>product_id.eq.product-xyz")
    );
    expect(sb.q.or).toHaveBeenCalledWith(
      expect.stringContaining("display_payload->>legacyRefId.eq.product-xyz")
    );
  });
});

describe("markNotificationEventsReadByThread", () => {
  it("matches room_id and legacyMeta room aliases for trade chat", async () => {
    const sb = fakeReadSb([{ id: "evt-room-1" }]);

    const count = await markNotificationEventsReadByThread(sb as never, "user-1", "room-1", {
      categories: ["trade_message"],
    });

    expect(count).toBe(1);
    expect(sb.q.or).toHaveBeenCalledWith(
      expect.stringContaining("display_payload->>legacyRefId.eq.room-1")
    );
    expect(sb.q.or).toHaveBeenCalledWith(
      expect.stringContaining("display_payload->legacyMeta->>product_chat_id.eq.room-1")
    );
  });
});
