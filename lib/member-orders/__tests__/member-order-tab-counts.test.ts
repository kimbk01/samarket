/** 내 주문 탭 개수 — 전체 주문 기준, 숨긴 주문 제외 */
import { describe, expect, it } from "vitest";
import { countMemberOrderTabs } from "@/lib/member-orders/member-order-tab-status";
import { loadBuyerStoreOrderTabCounts } from "@/lib/delivery/customer/load-buyer-store-order-tab-counts";

describe("member order tab counts", () => {
  it("상태별 탭 분류", () => {
    expect(countMemberOrderTabs(["pending", "delivering", "completed", "refunded", "cancel_requested"])).toEqual({
      all: 5,
      active: 2,
      done: 1,
      issue: 2,
    });
  });

  it("숨긴 주문 제외, 조회 실패는 오류", async () => {
    const sb = (orders: unknown, ordersError: unknown = null) =>
      ({
        from: (table: string) => ({
          select: () => ({
            eq: async () =>
              table === "store_orders"
                ? { data: orders, error: ordersError }
                : { data: [{ order_id: "o2" }], error: null },
          }),
        }),
      }) as never;
    const ok = await loadBuyerStoreOrderTabCounts(
      sb([
        { id: "o1", order_status: "completed" },
        { id: "o2", order_status: "completed" },
        { id: "o3", order_status: "pending" },
      ]),
      "u1"
    );
    expect(ok).toEqual({ ok: true, counts: { all: 2, active: 1, done: 1, issue: 0 } });
    expect((await loadBuyerStoreOrderTabCounts(sb(null, { message: "x" }), "u1")).ok).toBe(false);
  });
});
