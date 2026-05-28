import { describe, expect, it } from "vitest";
import {
  collapseDuplicateStoreOrderSummaryMessages,
  finalizeStoreOrderChatDisplayMessages,
  roomHasStoreOrderTimelineMessages,
} from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

let sysSeq = 0;
function sys(content: string, meta: Record<string, unknown>): CommunityMessengerMessage {
  sysSeq += 1;
  return {
    id: `id-${sysSeq}`,
    roomId: "room-1",
    senderId: null,
    senderLabel: "시스템",
    messageType: "system",
    content,
    createdAt: "2026-05-28T00:00:00.000Z",
    clientMessageId: null,
    isMine: false,
    metadata: meta,
  };
}

describe("finalizeStoreOrderChatDisplayMessages", () => {
  it("dedupes summary only and keeps store_order status lines", () => {
    const messages = [
      sys("📋 주문 요약\n주문번호: A-1", { domain: "store_order", kind: "store_order_summary" }),
      sys("📋 주문 요약\n주문번호: A-1", { domain: "store_order", kind: "store_order_summary" }),
      sys("주문을 접수 했습니다.", { domain: "store_order", lineKind: "status", orderStatus: "accepted" }),
    ];
    const out = finalizeStoreOrderChatDisplayMessages(messages);
    expect(out).toHaveLength(2);
    expect(out.filter((m) => m.metadata?.kind === "store_order_summary")).toHaveLength(1);
    expect(out.some((m) => m.metadata?.lineKind === "status")).toBe(true);
  });

  it("matches collapseDuplicateStoreOrderSummaryMessages when no duplicate summary", () => {
    const messages = [sys("주문을 접수 했습니다.", { domain: "store_order", lineKind: "status" })];
    expect(finalizeStoreOrderChatDisplayMessages(messages)).toEqual(
      collapseDuplicateStoreOrderSummaryMessages(messages)
    );
  });

  it("detects store order timeline messages", () => {
    expect(roomHasStoreOrderTimelineMessages([])).toBe(false);
    expect(
      roomHasStoreOrderTimelineMessages([
        sys("주문 접수", { domain: "store_order", lineKind: "status" }),
      ])
    ).toBe(true);
  });
});
