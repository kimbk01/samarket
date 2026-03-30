import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";

/** 클라이언트 장바구니(localStorage) — 서버 주문 시 product_id·qty·modifier로 재검증 */
export type StoreCommerceCartLine = {
  lineId: string;
  productId: string;
  title: string;
  thumbnailUrl: string | null;
  qty: number;
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
};

export type StoreCommerceCartSnapshotV2 = {
  v: 2;
  carts: Record<string, StoreCommerceCartBucket>;
};
