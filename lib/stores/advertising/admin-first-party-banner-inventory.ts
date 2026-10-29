/**
 * Admin DIBAY first-party Banner inventories — 클라이언트·서버 공용 상수 (B-03: 등록 화면 지면 선택지 = writer 허용 지면).
 * Owner sell remains HERO-only — do not use this for Owner purchase.
 */
import type { DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";

export const ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS = [
  "STORES_HOME_HERO",
  "STORES_HOME_INLINE_1",
  "STORES_CATEGORY_TOP",
] as const satisfies ReadonlyArray<DeliveryAdInventoryKey>;

export type AdminFirstPartyBannerInventoryKey =
  (typeof ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS)[number];
