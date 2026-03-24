/** 클라이언트 장바구니(localStorage) — 서버 주문 시 product_id·qty·option_selections로 재검증 */
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
  optionSelections: Record<string, string[]>;
  optionsSummary: string;
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
