import { describe, expect, it } from "vitest";
import {
  buildDeliveryChatListRowModel,
  formatDeliveryChatListTimestamp,
  parseStoreDisplayNameFromDeliveryHeadline,
} from "@/lib/community-messenger/delivery-chat-list/view-model";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

describe("formatDeliveryChatListTimestamp", () => {
  it("YYYY-MM-DD 와 HH:mm 분리", () => {
    const out = formatDeliveryChatListTimestamp("2026-05-21T23:00:00+09:00");
    expect(out.dateLine).toMatch(/^2026-05-21$/);
    expect(out.timeLine).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("parseStoreDisplayNameFromDeliveryHeadline", () => {
  it("headline 앞 매장명", () => {
    expect(parseStoreDisplayNameFromDeliveryHeadline("카페 A · 주문 1001")).toBe("카페 A");
  });
});

describe("buildDeliveryChatListRowModel", () => {
  it("delivery meta 로 매장·주문·상태", () => {
    const room = {
      id: "r1",
      summary: "",
      contextMeta: {
        v: 1 as const,
        kind: "delivery" as const,
        storeDisplayName: "맛집",
        storeId: "store-1",
        orderNo: "ORD-9",
        stepLabel: "preparing",
        thumbnailUrl: "https://cdn.example/logo.jpg",
      },
    } as unknown as CommunityMessengerRoomSummary;
    const m = buildDeliveryChatListRowModel(room);
    expect(m?.storeId).toBe("store-1");
    expect(m?.storeName).toBe("맛집");
    expect(m?.orderNo).toBe("ORD-9");
    expect(m?.orderStatusLabel).toBeTruthy();
    expect(m?.storeThumbnailUrl).toContain("logo.jpg");
  });
});
