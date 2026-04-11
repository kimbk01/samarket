import { describe, expect, it } from "vitest";
import {
  parseCommunityMessengerRoomContextMeta,
  serializeCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/room-context-meta";

describe("parseCommunityMessengerRoomContextMeta", () => {
  it("parses v1 trade payload", () => {
    const raw = JSON.stringify({
      v: 1,
      kind: "trade",
      headline: "상품",
      priceLabel: "12,000원",
      thumbnailUrl: "https://example.com/a.jpg",
      stepLabel: "결제 완료",
    });
    const meta = parseCommunityMessengerRoomContextMeta(raw);
    expect(meta).toEqual({
      v: 1,
      kind: "trade",
      headline: "상품",
      priceLabel: "12,000원",
      thumbnailUrl: "https://example.com/a.jpg",
      stepLabel: "결제 완료",
    });
  });

  it("returns null for plain text summary", () => {
    expect(parseCommunityMessengerRoomContextMeta("거래 안내")).toBeNull();
  });

  it("returns null for invalid json", () => {
    expect(parseCommunityMessengerRoomContextMeta("{")).toBeNull();
  });

  it("serialize + parse round-trips", () => {
    const meta = {
      v: 1 as const,
      kind: "delivery" as const,
      headline: "테스트",
      priceLabel: "₱100",
    };
    const again = parseCommunityMessengerRoomContextMeta(serializeCommunityMessengerRoomContextMeta(meta));
    expect(again).toEqual(meta);
  });
});
