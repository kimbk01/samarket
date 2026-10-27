import { describe, expect, it } from "vitest";
import { resolveAndroidPriorityForData } from "@/lib/push/dispatch/fcm-sender-impl";

describe("fcm sender android priority policy", () => {
  it("keeps incoming call push as high", () => {
    expect(resolveAndroidPriorityForData({ call_push_kind: "incoming_call" })).toBe("high");
  });

  it("uses normal priority for admin marketing", () => {
    expect(
      resolveAndroidPriorityForData({
        type: "notification",
        category: "admin_marketing_banner",
      })
    ).toBe("normal");
  });

  it("keeps chat/order/trade as high priority", () => {
    expect(resolveAndroidPriorityForData({ type: "chat_message" })).toBe("high");
    expect(resolveAndroidPriorityForData({ type: "trade_message" })).toBe("high");
    expect(resolveAndroidPriorityForData({ type: "order_status" })).toBe("high");
  });

  it("F1: status alerts (FCM type notification) use the event type in category", () => {
    expect(resolveAndroidPriorityForData({ type: "notification", category: "trade_status" })).toBe("high");
    expect(resolveAndroidPriorityForData({ type: "notification", category: "order_status" })).toBe("high");
    expect(resolveAndroidPriorityForData({ type: "notification", category: "delivery_status" })).toBe("high");
  });

  it("F1: other notification categories keep their current priority", () => {
    expect(resolveAndroidPriorityForData({ type: "notification", category: "community_activity" })).toBe("normal");
    expect(resolveAndroidPriorityForData({ type: "notification", category: "admin_notice" })).toBe("normal");
  });
});
