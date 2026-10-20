import { describe, expect, it } from "vitest";
import {
  isStoreOrderCancelReasonValid,
  MEMBER_ORDER_TAB_VALUES,
  resolveStoreOrderDetailCtaPlan,
  resolveStoreOrderMutationErrorKey,
  resolveStoreOrdersLoadErrorKey,
  storeOrderSeedStatusLabel,
} from "@/lib/mypage/my-store-orders-ui";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import {
  buildStoreOrderDetailSeedFromPostSuccess,
  type StoreOrderDetailSeed,
} from "@/lib/stores/store-order-detail-seed-cache";

describe("S30 주문 내역 — 탭·오류 문구", () => {
  it("탭 집합 = 설계 3탭 + 기존 [전체] (C4, X18)", () => {
    expect(MEMBER_ORDER_TAB_VALUES).toEqual(["all", "active", "done", "issue"]);
  });

  it("서버 오류 코드는 사용자 문구 키로만 바뀐다 — 코드 원문 노출 없음", () => {
    expect(resolveStoreOrderMutationErrorKey("cancel", "cannot_cancel_after_accepted")).toBe(
      "mypage_comp_orders_cancel_err_short"
    );
    expect(resolveStoreOrderMutationErrorKey("cancel", "db_exploded")).toBe("mypage_oa_cancel_failed");
    expect(resolveStoreOrderMutationErrorKey("request_cancel", "cannot_request_cancel")).toBe(
      "mypage_comp_cancel_req_err_cannot"
    );
    expect(resolveStoreOrderMutationErrorKey("request_cancel", "cancel_reason_required")).toBe(
      "mypage_comp_cancel_req_reason_required"
    );
    expect(resolveStoreOrderMutationErrorKey("request_cancel", "weird")).toBe("mypage_oa_request_failed");
    expect(resolveStoreOrderMutationErrorKey("hide", "buyer_hide_schema_missing")).toBe(
      "mypage_comp_orders_hide_schema_missing"
    );
    expect(resolveStoreOrderMutationErrorKey("hide", undefined)).toBe("mypage_oa_hide_failed");
    expect(resolveStoreOrdersLoadErrorKey("supabase_unconfigured")).toBe("mypage_comp_orders_supabase_unconfigured");
    expect(resolveStoreOrdersLoadErrorKey("network_error")).toBe("mypage_oa_orders_load_failed");
  });
});

describe("S31 주문 상세 — 하단 고정 CTA 매트릭스(1주 + 1보조)", () => {
  const base = { chatDisabled: false, hasStore: true, canReorder: true };

  it("진행중 → 주 [주문 채팅] · 보조 [매장 보기]", () => {
    expect(
      resolveStoreOrderDetailCtaPlan({ ...base, orderStatus: "preparing", canBuyerCancel: false, canRequestCancel: false })
    ).toEqual({ primary: "order_chat", secondary: "view_store" });
  });

  it("결제 전 취소 가능 → 주 [주문 취소](확인 시트)", () => {
    expect(
      resolveStoreOrderDetailCtaPlan({ ...base, orderStatus: "pending", canBuyerCancel: true, canRequestCancel: false })
    ).toEqual({ primary: "cancel_order", secondary: "view_store" });
  });

  it("결제 후 취소 요청 가능 → 주 [취소 요청](사유 시트) · 보조 [주문 채팅]", () => {
    expect(
      resolveStoreOrderDetailCtaPlan({ ...base, orderStatus: "accepted", canBuyerCancel: false, canRequestCancel: true })
    ).toEqual({ primary: "request_cancel", secondary: "order_chat" });
  });

  it("완료 → 주 [재주문] · 보조 [주문 내역서]; 재주문 불가면 내역서가 주", () => {
    expect(
      resolveStoreOrderDetailCtaPlan({ ...base, orderStatus: "completed", canBuyerCancel: false, canRequestCancel: false })
    ).toEqual({ primary: "reorder", secondary: "receipt" });
    expect(
      resolveStoreOrderDetailCtaPlan({
        ...base,
        canReorder: false,
        orderStatus: "completed",
        canBuyerCancel: false,
        canRequestCancel: false,
      })
    ).toEqual({ primary: "receipt", secondary: null });
  });

  it("채팅 불가·매장 없음 → 주문 목록 보기만", () => {
    expect(
      resolveStoreOrderDetailCtaPlan({
        orderStatus: "cancelled",
        canBuyerCancel: false,
        canRequestCancel: false,
        chatDisabled: true,
        hasStore: false,
        canReorder: false,
      })
    ).toEqual({ primary: "order_list", secondary: null });
  });

  it("취소 요청 사유 2~500자만 활성", () => {
    expect(isStoreOrderCancelReasonValid(" ")).toBe(false);
    expect(isStoreOrderCancelReasonValid("a")).toBe(false);
    expect(isStoreOrderCancelReasonValid("늦어요")).toBe(true);
    expect(isStoreOrderCancelReasonValid("x".repeat(500))).toBe(true);
    expect(isStoreOrderCancelReasonValid("x".repeat(501))).toBe(false);
  });
});

describe("S31 시드 상태 문구 — 수령 방식 반영 (Part D SSOT)", () => {
  const seed = (ft?: string): StoreOrderDetailSeed => ({
    ...buildStoreOrderDetailSeedFromPostSuccess({
      orderId: "o1",
      order_no: "N1",
      payment_amount: 100,
      store_id: "s1",
      store_name: "S",
      fulfillment_type: ft,
    }),
  });

  it("시드 작성 시 수령 방식이 저장된다", () => {
    expect(seed("pickup").fulfillment_type).toBe("pickup");
    expect(seed(undefined)).not.toHaveProperty("fulfillment_type");
  });

  it("시드 라벨 = 상세 본문과 같은 SSOT(buyerOrderStatusLabel(status, lang, fulfillment))", () => {
    for (const ft of ["pickup", "local_delivery", "shipping"]) {
      for (const status of ["pending", "ready_for_pickup", "completed"]) {
        const s = { ...seed(ft), order_status: status };
        expect(storeOrderSeedStatusLabel(s, "ko", "NEUTRAL")).toBe(buyerOrderStatusLabel(status, "ko", ft));
      }
    }
  });

  it("수령 방식 없는 구 시드 — 배달/픽업 문구가 다르면 중립 문구(픽업에 배달 문구 금지)", () => {
    const old = { order_status: "ready_for_pickup" };
    const d = buyerOrderStatusLabel("ready_for_pickup", "ko", "local_delivery");
    const p = buyerOrderStatusLabel("ready_for_pickup", "ko", "pickup");
    expect(storeOrderSeedStatusLabel(old, "ko", "NEUTRAL")).toBe(d === p ? d : "NEUTRAL");
    const pending = buyerOrderStatusLabel("pending", "ko", "local_delivery");
    const pendingPickup = buyerOrderStatusLabel("pending", "ko", "pickup");
    expect(storeOrderSeedStatusLabel({ order_status: "pending" }, "ko", "NEUTRAL")).toBe(
      pending === pendingPickup ? pending : "NEUTRAL"
    );
  });
});
