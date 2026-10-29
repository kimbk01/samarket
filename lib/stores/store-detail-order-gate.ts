import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 묶음3-A S-02·S-05·C-07 — 매장 상세 하단 바·장바구니 주문 CTA 공용 판정.
 *
 * - 영업 상태(영업중/준비중)는 영업시간 그대로 표시한다 (판매 권한과 무관).
 * - 주문 가능 문구·활성 주문 CTA 는 「영업 중 AND 판매 승인」일 때만.
 * - 판매 미승인 사유: 샘플 매장(`isSampleStore`) / 그 외 판매 승인 전·중지.
 *   (실제 주문 차단은 TS `store_not_selling`·DB `create_store_order_atomic` — 이 모듈은 표시만)
 */
export type StoreSalesBlockedReason = "sample" | "not_approved";

/** `salesAllowed` 를 아직 모르면(null/undefined) 막지 않는다 — 서버 주문 게이트가 최종 판정. */
export function resolveStoreSalesBlockedReason(input: {
  salesAllowed: boolean | null | undefined;
  isSampleStore: boolean | null | undefined;
}): StoreSalesBlockedReason | null {
  if (input.salesAllowed !== false) return null;
  return input.isSampleStore === true ? "sample" : "not_approved";
}

export function storeSalesBlockedMessageKey(reason: StoreSalesBlockedReason): MessageKey {
  return reason === "sample" ? "store_sample_order_blocked" : "store_sales_not_open_order_blocked";
}

export type StoreDetailCheckoutGate =
  | { canCheckout: true; blockedBy: null }
  | { canCheckout: false; blockedBy: "sales" | "closed" };

/** 상세 하단 바(카트 유무 무관) — 판매 불가 우선, 다음 영업 외 시간. */
export function resolveStoreDetailCheckoutGate(input: {
  isOpen: boolean;
  salesBlockedReason: StoreSalesBlockedReason | null | undefined;
}): StoreDetailCheckoutGate {
  if (input.salesBlockedReason) return { canCheckout: false, blockedBy: "sales" };
  if (!input.isOpen) return { canCheckout: false, blockedBy: "closed" };
  return { canCheckout: true, blockedBy: null };
}
