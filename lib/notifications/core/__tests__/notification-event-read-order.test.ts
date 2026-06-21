import { describe, expect, it, vi } from "vitest";
import { markOrderNotificationEventsRead } from "@/lib/notifications/core/notification-event-repository";

function fakeOrderReadSb(rows: Array<{ id: string }> = [{ id: "evt-1" }]) {
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

describe("markOrderNotificationEventsRead", () => {
  it("marks order and delivery notification_events read by order id without legacy notifications", async () => {
    const sb = fakeOrderReadSb([{ id: "evt-order-1" }, { id: "evt-order-2" }]);

    const count = await markOrderNotificationEventsRead(sb as never, "user-1", "order-abc");

    expect(count).toBe(2);
    expect(sb.from).toHaveBeenCalledWith("notification_events");
    expect(sb.q.in).toHaveBeenCalledWith("category", ["order_status", "delivery_status"]);
    expect(sb.q.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(sb.q.eq).toHaveBeenCalledWith("unread", true);
    expect(sb.q.is).toHaveBeenCalledWith("read_at", null);
    expect(sb.q.or).toHaveBeenCalledWith(
      expect.stringContaining("display_payload->>legacyRefId.eq.order-abc")
    );
  });
});
