/**
 * 묶음3-A S-02·S-03·S-05·C-03b·C-04·C-07·C-08 — 순수 판정 계약.
 */
import { describe, expect, it } from "vitest";
import {
  resolveStoreDiscoveryBrowseDisplayStatus,
  resolveStoreDiscoveryEligibility,
  resolveStoreDiscoveryHomeDisplayStatus,
  type StoreDiscoveryEligibilityInput,
} from "@/lib/stores/store-discovery-eligibility";
import { flattenStoreListSalesPermission } from "@/lib/stores/store-list-sales-permission";
import {
  resolveStoreDetailCheckoutGate,
  resolveStoreSalesBlockedReason,
  storeSalesBlockedMessageKey,
} from "@/lib/stores/store-detail-order-gate";
import { shouldReleaseStoreMenuFocusEntry } from "@/lib/stores/store-menu-focus-entry-release";
import { resolveStoreMenuBoardEmptyKind } from "@/lib/stores/store-menu-board-empty-kind";
import { buyerOrderCompleteHeadline } from "@/lib/stores/store-order-process-model";
import { translate } from "@/lib/i18n/messages";
import type { MenuSection } from "@/lib/stores/group-store-products-by-menu";
import { hydrateStorePublicFromApiJson } from "@/lib/stores/store-public-page-hydrate";
import { parseStoreCartHeadFromPublicJson } from "@/lib/stores/store-cart-checkout-perf";

/** 24시간 영업(항상 open) — is_open=true + 영업시간 미설정 */
const openAllDay: Pick<StoreDiscoveryEligibilityInput, "business_hours_json" | "is_open"> = {
  business_hours_json: null,
  is_open: true,
};
const closedManually: Pick<StoreDiscoveryEligibilityInput, "business_hours_json" | "is_open"> = {
  business_hours_json: null,
  is_open: false,
};

describe("S-02 — 샘플 ≠ 영업 종료 (목록 상태·정렬)", () => {
  it("샘플(판매 미승인) 영업시간 중 → 표시 open · 정렬은 영업 매장과 같음 · 주문 불가", () => {
    const sample = resolveStoreDiscoveryEligibility({
      ...openAllDay,
      sales_allowed: false,
      is_sample_store: true,
      delivery_available: true,
    });
    const real = resolveStoreDiscoveryEligibility({
      ...openAllDay,
      sales_allowed: true,
      delivery_available: true,
    });
    expect(sample.orderable).toBe(false);
    expect(sample.browseDisplayStatus).toBe("open");
    expect(sample.homeDisplayStatus).toBe("open");
    expect(sample.rank).toBe(real.rank);
  });
  it("샘플 영업 외 시간 → closed (영업시간 그대로)", () => {
    const input = { ...closedManually, sales_allowed: false, is_sample_store: true, delivery_available: true };
    expect(resolveStoreDiscoveryBrowseDisplayStatus(input)).toBe("closed");
    expect(resolveStoreDiscoveryHomeDisplayStatus(input)).toBe("closed");
    expect(resolveStoreDiscoveryEligibility(input).orderable).toBe(false);
  });
  it("실매장 판매 중지(샘플 아님) → 기존대로 closed · 최하위(rank 5) — 불변", () => {
    const e = resolveStoreDiscoveryEligibility({
      ...openAllDay,
      sales_allowed: false,
      is_sample_store: false,
      delivery_available: true,
    });
    expect(e.state).toBe("closed");
    expect(e.rank).toBe(5);
    expect(e.orderable).toBe(false);
    expect(e.browseDisplayStatus).toBe("closed");
    expect(e.homeDisplayStatus).toBe("closed");
  });
  it("is_sample_store 생략(구 경로) → 기존 동작", () => {
    const e = resolveStoreDiscoveryEligibility({ ...openAllDay, sales_allowed: false, delivery_available: true });
    expect(e.rank).toBe(5);
  });
});

describe("S-03 — 목록 행 store_kind → is_sample_store (원문 제거)", () => {
  it("embed + store_kind 평탄화", () => {
    const row = flattenStoreListSalesPermission({
      id: "s1",
      store_kind: "sample",
      store_sales_permissions: { allowed_to_sell: false, sales_status: "pending" },
    });
    expect(row).toEqual({ id: "s1", sales_allowed: false, is_sample_store: true });
    expect(row).not.toHaveProperty("store_kind");
  });
  it("실매장 / store_kind 없는 행", () => {
    expect(flattenStoreListSalesPermission({ id: "s2", store_kind: "real" })).toEqual({
      id: "s2",
      is_sample_store: false,
    });
    expect(flattenStoreListSalesPermission({ id: "s3", sales_allowed: true })).toEqual({
      id: "s3",
      sales_allowed: true,
    });
  });
});

describe("S-02·S-05·C-07 — 주문 CTA 판정", () => {
  it("판매 미승인 사유", () => {
    expect(resolveStoreSalesBlockedReason({ salesAllowed: false, isSampleStore: true })).toBe("sample");
    expect(resolveStoreSalesBlockedReason({ salesAllowed: false, isSampleStore: false })).toBe("not_approved");
    expect(resolveStoreSalesBlockedReason({ salesAllowed: true, isSampleStore: true })).toBeNull();
    expect(resolveStoreSalesBlockedReason({ salesAllowed: null, isSampleStore: false })).toBeNull();
    expect(storeSalesBlockedMessageKey("sample")).toBe("store_sample_order_blocked");
    expect(storeSalesBlockedMessageKey("not_approved")).toBe("store_sales_not_open_order_blocked");
  });
  it("하단 바(카트 유무 무관): 판매 불가 → 영업 외 → 가능", () => {
    expect(resolveStoreDetailCheckoutGate({ isOpen: true, salesBlockedReason: "sample" })).toEqual({
      canCheckout: false,
      blockedBy: "sales",
    });
    expect(resolveStoreDetailCheckoutGate({ isOpen: false, salesBlockedReason: null })).toEqual({
      canCheckout: false,
      blockedBy: "closed",
    });
    expect(resolveStoreDetailCheckoutGate({ isOpen: true, salesBlockedReason: null })).toEqual({
      canCheckout: true,
      blockedBy: null,
    });
  });
  it("샘플 안내 문구는 「샘플 매장」, 실매장 미승인은 「판매 승인 전」 (ko)", () => {
    expect(translate("ko", "store_sample_store_badge")).toBe("샘플 매장 · 실제 주문 불가");
    expect(translate("ko", "store_sample_order_blocked")).toContain("샘플 매장");
    expect(translate("ko", "store_sales_not_open_order_blocked")).toContain("판매 승인 전");
  });
});

describe("C-14 — 판매 미승인 주문 거절 문구", () => {
  it("「잠시 중지·잠시 후 다시」 문구가 아님", () => {
    const ko = translate("ko", "store_err_store_not_selling");
    expect(ko).not.toContain("잠시");
    expect(ko).toContain("판매 승인 전");
    expect(translate("en", "store_err_store_not_selling")).not.toMatch(/try again later/i);
  });
});

describe("S-01·S-05 — 클라이언트 파싱", () => {
  it("legacy hydrate: menuOpen(메뉴) / canSell(판매) 분리", () => {
    const h = hydrateStorePublicFromApiJson({
      ok: true,
      store: { id: "s1", slug: "demo", store_name: "Demo" },
      products: [],
      meta: { canSell: false, menuOpen: true, isSampleStore: true },
    });
    expect(h.canSell).toBe(true);
    expect(h.salesAllowed).toBe(false);
    expect(h.isSampleStore).toBe(true);
  });
  it("legacy hydrate: 구 응답(menuOpen 없음)은 canSell 로 메뉴 판정", () => {
    const h = hydrateStorePublicFromApiJson({
      ok: true,
      store: { id: "s1", slug: "demo", store_name: "Demo" },
      products: [],
      meta: { canSell: true },
    });
    expect(h.canSell).toBe(true);
    expect(h.salesAllowed).toBe(true);
    expect(h.isSampleStore).toBe(false);
  });
  it("카트 헤더: meta canSell·isSampleStore 반영, 없으면 sales_allowed 미설정", () => {
    const head = parseStoreCartHeadFromPublicJson(
      "demo",
      { id: "s1", store_name: "Demo" },
      { canSell: false, isSampleStore: true }
    );
    expect(head.sales_allowed).toBe(false);
    expect(head.is_sample_store).toBe(true);
    const unknown = parseStoreCartHeadFromPublicJson("demo", { id: "s1", store_name: "Demo" }, {});
    expect(unknown.sales_allowed).toBeUndefined();
  });
});

describe("C-03b — 포커스 대상 없으면 포커스 준비 해제", () => {
  const sections = [
    { heading: "A", items: [{ id: "p-1" }] },
  ] as unknown as MenuSection[];
  it("메뉴 로딩 중에는 해제하지 않음", () => {
    expect(shouldReleaseStoreMenuFocusEntry({ menusLoading: true, focusProductId: "p-x", sections: [] })).toBe(
      false
    );
  });
  it("빈 메뉴판 → 해제 (이전: 판정 생략으로 고착)", () => {
    expect(shouldReleaseStoreMenuFocusEntry({ menusLoading: false, focusProductId: "p-1", sections: [] })).toBe(
      true
    );
  });
  it("대상 상품 없음 / id 없음 → 해제, 대상 있음 → 유지", () => {
    expect(shouldReleaseStoreMenuFocusEntry({ menusLoading: false, focusProductId: "p-x", sections })).toBe(true);
    expect(shouldReleaseStoreMenuFocusEntry({ menusLoading: false, focusProductId: null, sections })).toBe(true);
    expect(shouldReleaseStoreMenuFocusEntry({ menusLoading: false, focusProductId: "p-1", sections })).toBe(false);
  });
});

describe("C-04 — 빈 메뉴 문구", () => {
  it("검색어 있을 때만 「검색 결과 없음」", () => {
    expect(resolveStoreMenuBoardEmptyKind({ menuQueryActive: true })).toBe("search_no_results");
    expect(resolveStoreMenuBoardEmptyKind({ menuQueryActive: false })).toBe("no_items");
  });
});

describe("C-08 — 주문 완료 화면 상태 문구 (SSOT)", () => {
  it("pending=접수, completed=완료", () => {
    expect(buyerOrderCompleteHeadline("pending", "local_delivery", "ko")).toEqual({
      label: translate("ko", "store_order_accepted"),
      tone: "success",
    });
    expect(buyerOrderCompleteHeadline("completed", "pickup", "ko").label).toBe(
      translate("ko", "store_order_completed")
    );
  });
  it("취소·환불은 「접수되었습니다」가 아니라 구매자 상태 라벨(terminal)", () => {
    for (const st of ["cancelled", "cancel_requested", "refund_requested", "refunded"]) {
      const h = buyerOrderCompleteHeadline(st, "local_delivery", "ko");
      expect(h.tone).toBe("terminal");
      expect(h.label).not.toBe(translate("ko", "store_order_accepted"));
      expect(h.label.length).toBeGreaterThan(0);
    }
  });
  it("진행 상태는 진행 단계 라벨(progress)", () => {
    const h = buyerOrderCompleteHeadline("preparing", "local_delivery", "ko");
    expect(h.tone).toBe("progress");
    expect(h.label).not.toBe("preparing");
  });
});
