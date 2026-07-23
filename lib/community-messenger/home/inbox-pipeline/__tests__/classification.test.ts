import { describe, expect, it } from "vitest";
import { resolveMessengerHomeBucket } from "@/lib/community-messenger/home/inbox-pipeline/classification";
import type { CanonicalMessengerHomeRoom } from "@/lib/community-messenger/home/inbox-pipeline/types";

function room(extra: Partial<CanonicalMessengerHomeRoom> = {}): CanonicalMessengerHomeRoom {
  return {
    roomId: "r1",
    roomType: "direct",
    directKey: null,
    contextMeta: null,
    chatDomain: null,
    domainIdentity: null,
    title: "hello",
    avatarUrl: null,
    latestMessage: "message",
    lastMessageAt: "2026-07-13T00:00:00.000Z",
    unreadCount: 0,
    isArchived: false,
    isBlockedHidden: false,
    roomStatus: "active",
    memberCount: 2,
    ...extra,
  };
}

describe("resolveMessengerHomeBucket", () => {
  it("classifies general_friend direct with trade metadata as trade", () => {
    expect(
      resolveMessengerHomeBucket(
        room({ directKey: "u1:u2", contextMeta: { v: 1, kind: "trade", productChatId: "pc" } }),
        "u1"
      )
    ).toBe("trade");
  });

  it("keeps friend trade counterpart as trade", () => {
    expect(resolveMessengerHomeBucket(room({ directKey: "trade_pc:pc" }), "u1")).toBe("trade");
  });

  it("classifies plain friend DM as direct", () => {
    expect(resolveMessengerHomeBucket(room({ directKey: "u1:u2" }), "u1")).toBe("direct");
  });

  it("classifies store order as delivery", () => {
    expect(resolveMessengerHomeBucket(room({ directKey: "store_order:o1" }), "u1")).toBe("delivery");
  });

  it("classifies private group as group", () => {
    expect(resolveMessengerHomeBucket(room({ roomType: "private_group", memberCount: 4 }), "u1")).toBe("group");
  });

  it("excludes archived and blocked-hidden rooms", () => {
    expect(resolveMessengerHomeBucket(room({ roomStatus: "archived" }), "u1")).toBe("excluded");
    expect(resolveMessengerHomeBucket(room({ isBlockedHidden: true }), "u1")).toBe("excluded");
  });

  it("does not use title or latestMessage keyword fallback", () => {
    expect(resolveMessengerHomeBucket(room({ title: "거래 문의", latestMessage: "배달 주문" }), "u1")).toBe(
      "direct"
    );
  });

  it("prefers chatDomain over conflicting legacy directKey", () => {
    expect(
      resolveMessengerHomeBucket(
        room({ chatDomain: "store_order", domainIdentity: "so:o1", directKey: "trade_pc:pc" }),
        "u1"
      )
    ).toBe("delivery");
    expect(
      resolveMessengerHomeBucket(room({ chatDomain: "trade", domainIdentity: "trade:i:s:b", directKey: null }), "u1")
    ).toBe("trade");
  });
});
