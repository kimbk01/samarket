import { describe, expect, it } from "vitest";
import { serializeCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import { roomSummaryIsTradeOrDeliveryContextMetaOnly } from "@/lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation";

describe("roomSummaryIsTradeOrDeliveryContextMetaOnly", () => {
  it("hides trade JSON in summary even for friend-direct legacy rows", () => {
    const summary = serializeCommunityMessengerRoomContextMeta({
      v: 1,
      kind: "trade",
      headline: "거래",
      productChatId: "2ca7dbbf-c9cf-4ae9-9b84-000000000001",
    });
    expect(
      roomSummaryIsTradeOrDeliveryContextMetaOnly({
        summary,
        contextMeta: null,
      })
    ).toBe(true);
  });

  it("allows human-readable direct room summary", () => {
    expect(
      roomSummaryIsTradeOrDeliveryContextMetaOnly({
        summary: "친구와 나누는 대화",
        contextMeta: null,
      })
    ).toBe(false);
  });

  it("hides when contextMeta kind is trade", () => {
    expect(
      roomSummaryIsTradeOrDeliveryContextMetaOnly({
        summary: "",
        contextMeta: { v: 1, kind: "trade", headline: "거래" },
      })
    ).toBe(true);
  });
});
