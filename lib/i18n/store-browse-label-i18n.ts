import type { AppLanguageCode } from "./config";
import { resolveLocalizedAdminLabel } from "./resolve-localized-admin-label";
import { translateText, type MessageKey } from "./messages";

const STORE_PRIMARY_SLUG_KEYS: Record<string, MessageKey> = {
  restaurant: "store_browse_primary_restaurant",
  mart: "store_browse_primary_mart",
  hardware: "store_browse_primary_hardware",
  pet: "store_browse_primary_pet",
  cafe: "store_browse_primary_cafe",
  beauty: "store_browse_primary_beauty",
  academy: "store_browse_primary_academy",
  life: "store_browse_primary_life",
};

const STORE_FOOD_SUB_SLUG_KEYS: Record<string, MessageKey> = {
  korean: "store_browse_food_korean",
  chicken: "store_browse_food_chicken",
  snack: "store_browse_food_noodles",
  chinese: "store_browse_food_chinese",
  japanese: "store_browse_food_japanese",
  pizza: "store_browse_food_pizza",
  lunchbox: "store_browse_food_lunchbox",
  local: "store_browse_food_local",
  dessert: "store_browse_food_dessert",
  late_night: "store_browse_food_late_night",
};

export function resolveStorePrimaryIndustryLabel(
  lang: AppLanguageCode,
  slug: string,
  fallbackKo: string,
  nameEn?: string | null
): string {
  const key = STORE_PRIMARY_SLUG_KEYS[slug.trim().toLowerCase()];
  if (key) return translateText(lang, key);
  return resolveLocalizedAdminLabel(lang, fallbackKo, nameEn);
}

export function resolveStoreFoodSubtopicLabel(
  lang: AppLanguageCode,
  subSlug: string | undefined,
  fallbackKo: string
): string {
  if (!subSlug) return translateText(lang, "store_browse_food_all");
  const key = STORE_FOOD_SUB_SLUG_KEYS[subSlug.trim().toLowerCase()];
  if (key) return translateText(lang, key);
  return fallbackKo.trim();
}

export function resolveStoreTopicLabel(
  lang: AppLanguageCode,
  slug: string,
  fallbackKo: string,
  nameEn?: string | null
): string {
  return resolveLocalizedAdminLabel(lang, fallbackKo, nameEn);
}

/** browse/home-feed API가 ko·en 중 하나로 내려준 배달비 UI 문구 → 현재 앱 언어 */
const STORE_DELIVERY_FEE_UI_CANONICAL: Record<string, MessageKey> = {
  "배달비 무료": "store_delivery_fee_free_line",
  "배달비 무료 적용 중": "store_free_delivery_applied",
  "배달비 매장별": "store_delivery_fee_per_store",
  "배달 불가": "store_delivery_no_short",
  "배달비 착불": "store_delivery_fee_cod_line",
  "배달비 문의": "store_delivery_fee_inquire_line",
  "Free delivery": "store_delivery_fee_free_line",
  "Free delivery applied": "store_free_delivery_applied",
  "Delivery fee varies by store": "store_delivery_fee_per_store",
  "No delivery": "store_delivery_no_short",
  "COD delivery fee": "store_delivery_fee_cod_line",
  "Ask about delivery fee": "store_delivery_fee_inquire_line",
};

export function resolveStoreDeliveryFeeUILabel(
  lang: AppLanguageCode,
  raw: string | null | undefined
): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const key = STORE_DELIVERY_FEE_UI_CANONICAL[s];
  if (key) return translateText(lang, key);
  if (s.startsWith("배달비 ") || s.startsWith("Delivery fee ")) {
    const amount = s.replace(/^(배달비 |Delivery fee )/, "").trim();
    if (amount) {
      return translateText(lang, "store_delivery_fee_amount_line", { amount });
    }
  }
  if (s.startsWith("배달비:") || s.startsWith("Delivery fee:")) {
    const label = s.replace(/^(배달비:|Delivery fee:)\s*/, "").trim();
    if (label) {
      return translateText(lang, "store_delivery_fee_courier_colon", { label });
    }
  }
  return s;
}
