import { describe, expect, it } from "vitest";
import { canSendMessageInRoom } from "@/lib/messenger-policy/chat-room-permission";
import { evaluateTradeMessagingForMessengerRoom } from "@/lib/messenger-policy/load-trade-product-chat-exit-for-room";
import { getRoomUiStateAfterLeave, leavePolicyMetaForRoom } from "@/lib/messenger-policy/chat-room-exit-policy";
import { getSwipeActions, getSwipeLeaveConfirmI18nKey } from "@/lib/messenger-policy/chat-room-swipe-actions";
import { toMessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

const pc = (
  over: Partial<{
    sellerLeftAt: string | null;
    buyerLeftAt: string | null;
    tradeFlowStatus: string | null;
    chatMode: string | null;
  }> = {}
) => ({
  sellerId: "seller-1",
  buyerId: "buyer-1",
  sellerLeftAt: over.sellerLeftAt ?? null,
  buyerLeftAt: over.buyerLeftAt ?? null,
  tradeFlowStatus: over.tradeFlowStatus ?? null,
  chatMode: over.chatMode ?? null,
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
  it("allows trade context when product chat snapshot missing (server guards ledger)", () => {
    const ev = evaluateTradeMessagingForMessengerRoom({
      viewerUserId: "buyer-1",
      roomType: "direct",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1", postId: "post-1" },
      tradeProductChat: null,
    });
    expect(ev.canSendMessage).toBe(true);
  });
  it("blocks trade when viewer is neither seller nor buyer", () => {
    const r = canSendMessageInRoom({ policyType: "trade", viewerUserId: "stranger", tradeProductChat: pc() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("trade_not_counterpart");
  });
  it("blocks seller and buyer when trade_flow_status is not chatting", () => {
    const snap = pc({ tradeFlowStatus: "seller_marked_done" });
    for (const uid of ["seller-1", "buyer-1"]) {
      const r = canSendMessageInRoom({ policyType: "trade", viewerUserId: uid, tradeProductChat: snap });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("trade_flow_not_chatting");
    }
  });
  it("blocks both when chat_mode is limited", () => {
    const r = canSendMessageInRoom({
      policyType: "trade",
      viewerUserId: "seller-1",
      tradeProductChat: pc({ chatMode: "limited" }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("trade_chat_mode_locked");
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

describe("getSwipeActions / getSwipeLeaveConfirmI18nKey", () => {
  it("returns three actions with archive restore label in archive tab", () => {
    const a = getSwipeActions({ policyType: "trade", listContext: "archive" });
    expect(a.map((x) => x.kind)).toEqual(["archive", "read", "leave"]);
    expect(a[0].labelKey).toBe("cm_ui_swipe_restore");
  });
  it("confirm key differs by policy type", () => {
    expect(getSwipeLeaveConfirmI18nKey("trade")).toBe("cm_ui_leave_confirm_trade");
    expect(getSwipeLeaveConfirmI18nKey("group")).toBe("cm_ui_leave_confirm_group");
    expect(getSwipeLeaveConfirmI18nKey("direct")).toBe("cm_ui_leave_confirm_direct");
  });
});

describe("leavePolicyMetaForRoom", () => {
  it("reserves friend gate hint for direct", () => {
    expect(leavePolicyMetaForRoom("direct")).toEqual({ reopenHint: "friend_gate_pending" });
    expect(leavePolicyMetaForRoom("trade")).toEqual({ reopenHint: "none" });
  });
});
