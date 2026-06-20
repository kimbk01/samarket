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
});
