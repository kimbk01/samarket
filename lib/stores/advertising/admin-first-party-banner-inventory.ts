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
