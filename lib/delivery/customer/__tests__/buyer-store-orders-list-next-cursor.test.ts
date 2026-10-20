/** 내정보 주문 내역 더 보기 — 응답 본문에 next_cursor 전달 */
import { describe, expect, it } from "vitest";
import { buildBuyerStoreOrdersListResponseBody } from "@/lib/delivery/customer/buyer-store-orders-list-snapshot-assemble";

describe("buildBuyerStoreOrdersListResponseBody", () => {
  it("다음 페이지 커서를 그대로 내려준다", () => {
    expect(buildBuyerStoreOrdersListResponseBody([], "2026-10-20T00:00:00.000000Z|abc")).toEqual({
      ok: true,
      orders: [],
      next_cursor: "2026-10-20T00:00:00.000000Z|abc",
    });
  });

  it("마지막 페이지는 null", () => {
    expect(buildBuyerStoreOrdersListResponseBody([]).next_cursor).toBeNull();
  });
});
