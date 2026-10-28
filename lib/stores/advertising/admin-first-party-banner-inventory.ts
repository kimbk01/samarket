import type { DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";

/**
 * Admin DIBAY first-party Banner inventories (QA / ops).
 * Owner sell remains HERO-only — do not use this for Owner purchase.
 * Stage 2 physical ACTIVE Banner inventories are included for fixture authority.
 * (Client-safe — Admin 작성 화면과 작성기가 같은 목록을 쓴다.)
 */
export const ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS = [
  "STORES_HOME_HERO",
  "STORES_HOME_INLINE_1",
  "STORES_CATEGORY_TOP",
] as const satisfies ReadonlyArray<DeliveryAdInventoryKey>;

export type AdminFirstPartyBannerInventoryKey =
  (typeof ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS)[number];

/**
 * 자사 전용 위치의 관리자 표시 이름 — 유료 판매 위치 라벨(`DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS`)은
 * 가격 설정 허용 목록을 겸하므로 넣지 않는다.
 */
export const ADMIN_FIRST_PARTY_ONLY_PLACEMENT_LABELS = {
  STORES_HOME_INLINE_1: { ko: "배달 홈 중간 배너", en: "Delivery home mid banner" },
  STORES_CATEGORY_TOP: { ko: "업종 목록 상단 배너", en: "Category list top banner" },
} as const satisfies Partial<Record<AdminFirstPartyBannerInventoryKey, { ko: string; en: string }>>;
