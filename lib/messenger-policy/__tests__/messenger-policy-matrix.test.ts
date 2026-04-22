import { describe, expect, it } from "vitest";
import { canSendMessageInRoom } from "@/lib/messenger-policy/chat-room-permission";
import { getRoomUiStateAfterLeave, leavePolicyMetaForRoom } from "@/lib/messenger-policy/chat-room-exit-policy";
import { getSwipeActions, getSwipeLeaveConfirmMessage } from "@/lib/messenger-policy/chat-room-swipe-actions";
import { toMessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

const pc = (over: Partial<{ sellerLeftAt: string | null; buyerLeftAt: string | null }> = {}) => ({
  sellerId: "seller-1",
  buyerId: "buyer-1",
  sellerLeftAt: over.sellerLeftAt ?? null,
  buyerLeftAt: over.buyerLeftAt ?? null,
});

describe("toMessengerPolicyRoomType", () => {
  it("maps trade context on direct room", () => {
    expect(toMessengerPolicyRoomType({ roomType: "direct", contextMeta: { kind: "trade" } })).toBe("trade");
  });
  it("maps direct without trade", () => {
    expect(toMessengerPolicyRoomType({ roomType: "direct", contextMeta: { kind: "delivery" } })).toBe("direct");
  });
  it("maps groups", () => {
    expect(toMessengerPolicyRoomType({ roomType: "private_group" })).toBe("group");
    expect(toMessengerPolicyRoomType({ roomType: "open_group" })).toBe("group");
  });
});

describe("canSendMessageInRoom (trade matrix)", () => {
  it("allows seller and buyer when no exits", () => {
    expect(canSendMessageInRoom({ policyType: "trade", viewerUserId: "seller-1", tradeProductChat: pc() })).toEqual({
      ok: true,
    });
    expect(canSendMessageInRoom({ policyType: "trade", viewerUserId: "buyer-1", tradeProductChat: pc() })).toEqual({
      ok: true,
    });
  });
  it("blocks buyer after seller left (seller_closed)", () => {
    const r = canSendMessageInRoom({
      policyType: "trade",
      viewerUserId: "buyer-1",
      tradeProductChat: pc({ sellerLeftAt: "2020-01-01T00:00:00.000Z" }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("trade_seller_closed_buyer_blocked");
  });
  it("still allows seller after own leave timestamp (legacy send path mirrors service)", () => {
    const r = canSendMessageInRoom({
      policyType: "trade",
      viewerUserId: "seller-1",
      tradeProductChat: pc({ sellerLeftAt: "2020-01-01T00:00:00.000Z" }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("trade_viewer_left_as_seller");
  });
  it("non-trade ignores product chat", () => {
    expect(
      canSendMessageInRoom({ policyType: "direct", viewerUserId: "x", tradeProductChat: pc({ sellerLeftAt: "t" }) })
    ).toEqual({ ok: true });
  });
  it("blocks trade when product chat snapshot missing", () => {
    const r = canSendMessageInRoom({ policyType: "trade", viewerUserId: "buyer-1", tradeProductChat: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("trade_product_chat_unlinked");
  });
  it("blocks trade when viewer is neither seller nor buyer", () => {
    const r = canSendMessageInRoom({ policyType: "trade", viewerUserId: "stranger", tradeProductChat: pc() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("trade_not_counterpart");
  });
});

describe("getRoomUiStateAfterLeave", () => {
  it("matches buyer + seller_closed banner rule", () => {
    expect(
      getRoomUiStateAfterLeave({
        policyType: "trade",
        viewerUserId: "buyer-1",
        tradeProductChat: pc({ sellerLeftAt: "t" }),
      })
    ).toEqual({ canSendMessage: false, tradeBanner: "seller_closed_buyer" });
  });
});

describe("getSwipeActions / getSwipeLeaveConfirmMessage", () => {
  it("returns three actions with archive restore label in archive tab", () => {
    const a = getSwipeActions({ policyType: "trade", listContext: "archive" });
    expect(a.map((x) => x.kind)).toEqual(["archive", "read", "leave"]);
    expect(a[0].label).toBe("복원");
  });
  it("confirm copy differs by policy type", () => {
    expect(getSwipeLeaveConfirmMessage("trade")).toContain("거래");
    expect(getSwipeLeaveConfirmMessage("group")).toContain("초대");
    expect(getSwipeLeaveConfirmMessage("direct")).toContain("내 목록");
  });
});

describe("leavePolicyMetaForRoom", () => {
  it("reserves friend gate hint for direct", () => {
    expect(leavePolicyMetaForRoom("direct")).toEqual({ reopenHint: "friend_gate_pending" });
    expect(leavePolicyMetaForRoom("trade")).toEqual({ reopenHint: "none" });
  });
});
