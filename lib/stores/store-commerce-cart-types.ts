import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";

/** 클라이언트 장바구니(localStorage) — 서버 주문 시 product_id·qty·modifier로 재검증 */
export type StoreCommerceCartLine = {
  lineId: string;
  productId: string;
  title: string;
  thumbnailUrl: string | null;
  qty: number;
  /** 1개당(옵션 포함) — 줄 합계는 항상 unitPricePhp × qty */
  unitPricePhp: number;
  /** 할인 전 단가+옵션(정가 기준). 없으면 할인 표시 안 함 */
  listUnitPricePhp?: number | null;
  /** 표시용 할인율(0이면 미표시) */
  discountPercent?: number | null;
  /** 확장 옵션 와이어(pick + 수량형). 없으면 optionSelections 만 사용 */
  modifierWire?: ModifierSelectionsWire | null;
  optionSelections: Record<string, string[]>;
  optionsSummary: string;
  /** 라인 메모(가격 미반영) */
  lineNote?: string | null;
  pickupAvailable: boolean;
  localDeliveryAvailable: boolean;
  shippingAvailable: boolean;
  minOrderQty: number;
  maxOrderQty: number;
};

export type StoreCommerceCartSnapshotV1 = {
  v: 1;
  storeId: string;
  storeSlug: string;
  storeName: string;
  lines: StoreCommerceCartLine[];
};

/** 매장별 버킷 — 여러 매장 장바구니를 동시에 보관 */
export type StoreCommerceCartBucket = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  lines: StoreCommerceCartLine[];
  /** 버킷 마지막 변경(ms) */
  touchedAtMs?: number;
};

export type StoreCommerceCartSnapshotV2 = {
  v: 2;
  carts: Record<string, StoreCommerceCartBucket>;
  /** 장바구니 전체 마지막 변경(ms) — TTL */
  touchedAtMs?: number;
  /** 탭·BFCache 동기화용 단조 증가 버전 */
  generation?: number;
};

/** 장바구니 담기 결과 — UI·교체 확인과 연동 */
export type StoreCartAddResult =
  | { ok: true; reason: "added" | "merged" }
  | {
      ok: false;
      reason: "blocked_by_other_store";
      existingStoreId: string;
      existingStoreSlug: string;
      existingStoreName: string;
      existingItemCount: number;
      existingSubtotalPhp: number;
      nextStoreId: string;
    }
  | { ok: false; reason: "invalid_option" }
  | { ok: false; reason: "sold_out" }
  | { ok: false; reason: "closed_store" };

export type AddStoreCartLineInput = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  productId: string;
  title: string;
  thumbnailUrl: string | null;
  qty: number;
  /** 1개당(옵션 포함) — 줄 합계는 항상 unitPricePhp × qty */
  unitPricePhp: number;
  listUnitPricePhp?: number | null;
  discountPercent?: number | null;
  optionSelections: Record<string, string[]>;
  modifierWire?: ModifierSelectionsWire | null;
  optionsSummary: string;
  lineNote?: string | null;
  pickupAvailable: boolean;
  localDeliveryAvailable: boolean;
  shippingAvailable: boolean;
  minOrderQty: number;
  maxOrderQty: number;
  /**
   * 동일 productId 줄이 이미 있을 때 수량 처리 (장바구니는 상품당 1줄).
   * - set: 기본 — 선택 수량으로 교체(5개 담고 다시 담아도 5개)
   * - increment: 명시 시에만 누적
   */
  mergeQtyMode?: "increment" | "set";
};
