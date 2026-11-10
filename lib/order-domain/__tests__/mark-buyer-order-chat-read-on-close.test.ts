import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readOrderChatMock = vi.fn();
vi.mock("@/lib/order-domain/read-order-chat", () => ({
  readOrderChat: (...args: unknown[]) => readOrderChatMock(...args),
}));

import { markBuyerOrderChatReadOnOrderClosed } from "@/lib/order-domain/mark-buyer-order-chat-read-on-close";

type Rows = { order: unknown; participant: unknown };

function fakeSb(rows: Rows) {
  return {
    from(table: string) {
      const data = table === "store_orders" ? rows.order : rows.participant;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data, error: null }),
      };
      return chain;
    },
  } as never;
}

describe("주문 종료 시 고객 채팅·알림 읽음 (Owner 2026-11-10 「알림도 읽음 처리」)", () => {
  beforeEach(() => {
    readOrderChatMock.mockReset();
    readOrderChatMock.mockResolvedValue({ ok: true, participantUnreadAfter: 0 });
  });

  it("완료·취소·환불이면 고객 역할로 readOrderChat 1회", async () => {
    for (const status of ["completed", "cancelled", "refunded"]) {
      readOrderChatMock.mockClear();
      const res = await markBuyerOrderChatReadOnOrderClosed(
        fakeSb({ order: { community_messenger_room_id: "room-1" }, participant: { left_at: null } }),
        { orderId: "order-1", buyerUserId: "buyer-1", nextStatus: status }
      );
      expect(res).toEqual({ ok: true, skipped: false, participantUnreadAfter: 0 });
      expect(readOrderChatMock).toHaveBeenCalledTimes(1);
      expect(readOrderChatMock.mock.calls[0]![1]).toEqual({
        userId: "buyer-1",
        orderId: "order-1",
        roomId: "room-1",
        role: "customer",
      });
    }
  });

  it("진행 중 상태는 건드리지 않는다", async () => {
    for (const status of ["pending", "accepted", "preparing", "delivering", "cancel_requested", "refund_requested"]) {
      const res = await markBuyerOrderChatReadOnOrderClosed(
        fakeSb({ order: { community_messenger_room_id: "room-1" }, participant: { left_at: null } }),
        { orderId: "order-1", buyerUserId: "buyer-1", nextStatus: status }
      );
      expect(res).toEqual({ ok: true, skipped: true, reason: "not_closed" });
    }
    expect(readOrderChatMock).not.toHaveBeenCalled();
  });

  it("고객이 나간 방·방 없는 주문은 건드리지 않는다", async () => {
    expect(
      await markBuyerOrderChatReadOnOrderClosed(fakeSb({ order: { community_messenger_room_id: "room-1" }, participant: null }), {
        orderId: "order-1",
        buyerUserId: "buyer-1",
        nextStatus: "completed",
      })
    ).toEqual({ ok: true, skipped: true, reason: "buyer_not_in_room" });
    expect(
      await markBuyerOrderChatReadOnOrderClosed(
        fakeSb({ order: { community_messenger_room_id: "room-1" }, participant: { left_at: "2026-11-10T00:00:00Z" } }),
        { orderId: "order-1", buyerUserId: "buyer-1", nextStatus: "completed" }
      )
    ).toEqual({ ok: true, skipped: true, reason: "buyer_not_in_room" });
    expect(
      await markBuyerOrderChatReadOnOrderClosed(fakeSb({ order: { community_messenger_room_id: null }, participant: null }), {
        orderId: "order-1",
        buyerUserId: "buyer-1",
        nextStatus: "completed",
      })
    ).toEqual({ ok: true, skipped: true, reason: "no_room" });
    expect(readOrderChatMock).not.toHaveBeenCalled();
  });

  it("상태 전환 함수에서 알림·채팅 안내를 쓴 뒤에 호출한다", () => {
    const src = readFileSync(join(process.cwd(), "lib/stores/apply-store-order-status-transition.ts"), "utf8");
    const notifyAt = src.indexOf("await notifyBuyerOnStatusTransition(sb, {");
    const appendAt = src.indexOf("await appendStoreOrderMessengerStatusTransition(");
    const readAt = src.indexOf("await markBuyerOrderChatReadOnOrderClosed(");
    expect(notifyAt).toBeGreaterThan(0);
    expect(appendAt).toBeGreaterThan(notifyAt);
    expect(readAt).toBeGreaterThan(appendAt);
  });
});
