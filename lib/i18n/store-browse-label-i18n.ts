import type { AppLanguageCode } from "./config";
import { resolveLocalizedAdminLabel } from "./resolve-localized-admin-label";
import { translateText, type MessageKey } from "./messages";
import { humanizeMessageKeySlug, sanitizeUiDisplayLabel } from "./safe-ui-label";
import {
  fallbackLabelForStoreBrowseKey,
  translateStoreBrowseMessage,
} from "./store-browse-safe-label";

const humanizeStoreBrowseSlug = humanizeMessageKeySlug;
const sanitizeStoreBrowseDisplayLabel = sanitizeUiDisplayLabel;

const STORE_PRIMARY_SLUG_KEYS: Record<string, MessageKey> = {
  restaurant: "store_browse_primary_restaurant",
  mart: "store_browse_primary_mart",
  hardware: "store_browse_primary_hardware",
  pet: "store_browse_primary_pet",
  cafe: "store_browse_primary_cafe",
  beauty: "store_browse_primary_beauty",
  academy: "store_browse_primary_academy",
  life: "store_browse_primary_life",
  lifestyle: "store_browse_primary_lifestyle",
};

const STORE_FOOD_SUB_SLUG_KEYS: Record<string, MessageKey> = {
  korean: "store_browse_food_korean",
  chicken: "store_browse_food_chicken",
  snack: "store_browse_food_noodles",
  noodles: "store_browse_food_noodles",
  chinese: "store_browse_food_chinese",
  japanese: "store_browse_food_japanese",
  pizza: "store_browse_food_pizza",
  lunchbox: "store_browse_food_lunchbox",
  local: "store_browse_food_local",
  dessert: "store_browse_food_dessert",
  late_night: "store_browse_food_late_night",
};

function resolvePrimaryKey(slug: string): MessageKey | undefined {
  return STORE_PRIMARY_SLUG_KEYS[slug.trim().toLowerCase()];
}

function resolveFoodSubKey(subSlug: string): MessageKey | undefined {
  return STORE_FOOD_SUB_SLUG_KEYS[subSlug.trim().toLowerCase()];
}

export function resolveStorePrimaryIndustryLabel(
  lang: AppLanguageCode,
  slug: string,
  fallbackKo: string,
  nameEn?: string | null
): string {
  const key = resolvePrimaryKey(slug);
  if (key) {
    return translateStoreBrowseMessage(lang, key);
  }
  const admin = resolveLocalizedAdminLabel(lang, fallbackKo, nameEn);
  const fb = humanizeStoreBrowseSlug(slug);
  return sanitizeStoreBrowseDisplayLabel(admin, fb);
}

export function resolveStoreFoodSubtopicLabel(
  lang: AppLanguageCode,
  subSlug: string | undefined,
  fallbackKo: string
): string {
  if (!subSlug) {
    return translateStoreBrowseMessage(lang, "store_browse_food_all");
  }
  const key = resolveFoodSubKey(subSlug);
  if (key) {
    return translateStoreBrowseMessage(lang, key);
  }
  const ko = fallbackKo.trim();
  const fb = humanizeStoreBrowseSlug(subSlug);
  if (ko) {
    return sanitizeStoreBrowseDisplayLabel(
      lang === "en" ? resolveLocalizedAdminLabel(lang, ko, null) : ko,
      fb
    );
  }
  return fb;
}

export function resolveStoreTopicLabel(
  lang: AppLanguageCode,
  slug: string,
  fallbackKo: string,
  nameEn?: string | null
): string {
  const foodKey = resolveFoodSubKey(slug);
  if (foodKey) {
    return translateStoreBrowseMessage(lang, foodKey);
  }
  const admin = resolveLocalizedAdminLabel(lang, fallbackKo, nameEn);
  const fb = humanizeStoreBrowseSlug(slug);
  return sanitizeStoreBrowseDisplayLabel(admin, fb);
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
  if (key) return translateStoreBrowseMessage(lang, key);
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

export { fallbackLabelForStoreBrowseKey, safeStoreBrowseT } from "./store-browse-safe-label";
