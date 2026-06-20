import { describe, expect, it } from "vitest";
import {
  categoryForEventType,
  eventTypeForMessageRoomKind,
} from "@/lib/notifications/core/notification-policy";

describe("notification policy p0 mapping", () => {
  it("maps store order room kind to store_order_message", () => {
    expect(eventTypeForMessageRoomKind("store_order")).toBe("store_order_message");
  });

  it("maps granular p0 event types into categories", () => {
    expect(categoryForEventType("trade_status")).toBe("trade_status");
    expect(categoryForEventType("order_status")).toBe("order_status");
    expect(categoryForEventType("delivery_status")).toBe("delivery_status");
    expect(categoryForEventType("admin_marketing_banner")).toBe("admin_marketing_banner");
    expect(categoryForEventType("incoming_call_signal")).toBe("incoming_call_signal");
  });
});
