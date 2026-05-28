import { describe, expect, it } from "vitest";
import {
  estimateMessengerTimelineRowPx,
  MESSENGER_STORE_ORDER_OPS_ROW_ESTIMATE_PX,
  MESSENGER_STORE_ORDER_SUMMARY_ROW_ESTIMATE_PX,
} from "@/lib/store-order-chat/messenger-timeline-row-estimate";

describe("estimateMessengerTimelineRowPx", () => {
  it("uses tall estimate for order summary system messages", () => {
    const px = estimateMessengerTimelineRowPx({
      messageType: "system",
      content: "📋 주문 요약\n주문번호: 1",
      metadata: { domain: "store_order", kind: "store_order_summary" },
    });
    expect(px).toBe(MESSENGER_STORE_ORDER_SUMMARY_ROW_ESTIMATE_PX);
  });

  it("uses ops estimate for store_order status lines", () => {
    const px = estimateMessengerTimelineRowPx({
      messageType: "system",
      content: "주문 접수",
      metadata: { domain: "store_order", lineKind: "status" },
    });
    expect(px).toBe(MESSENGER_STORE_ORDER_OPS_ROW_ESTIMATE_PX);
  });
});
