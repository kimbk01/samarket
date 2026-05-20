import type { AppLanguageCode } from "./config";
import { translate, type MessageKey } from "./messages";
import {
  humanizeMessageKeySlug,
  looksLikeMessageKey,
  sanitizeUiDisplayLabel,
} from "./safe-ui-label";

/** 번역 누락·DB에 key 문자열이 들어온 경우 UI에 쓸 짧은 영문 라벨 */
export const STORE_BROWSE_LABEL_FALLBACK_EN: Partial<Record<MessageKey, string>> = {
  store_browse_primary_fallback: "Store",
  store_browse_primary_restaurant: "Restaurant",
  store_browse_primary_mart: "Mart",
  store_browse_primary_hardware: "Hardware",
  store_browse_primary_pet: "Pet",
  store_browse_primary_cafe: "Cafe",
  store_browse_primary_beauty: "Beauty",
  store_browse_primary_academy: "Academy",
  store_browse_primary_life: "Services",
  store_browse_primary_lifestyle: "Lifestyle",
  store_browse_food_all: "All",
  store_browse_food_korean: "Korean",
  store_browse_food_chicken: "Chicken",
  store_browse_food_noodles: "Noodles",
  store_browse_food_chinese: "Chinese",
  store_browse_food_japanese: "Japanese",
  store_browse_food_pizza: "Pizza",
  store_browse_food_snack: "Snacks",
  store_browse_food_lunchbox: "Lunch",
  store_browse_food_local: "Local",
  store_browse_food_dessert: "Dessert",
  store_browse_food_late_night: "Late night",
};

export const looksLikeStoreBrowseI18nKey = looksLikeMessageKey;

export function humanizeStoreBrowseSlug(slug: string): string {
  return humanizeMessageKeySlug(slug);
}

export function fallbackLabelForStoreBrowseKey(key: MessageKey): string {
  return STORE_BROWSE_LABEL_FALLBACK_EN[key] ?? humanizeMessageKeySlug(key);
}

export const sanitizeStoreBrowseDisplayLabel = sanitizeUiDisplayLabel;

export function translateStoreBrowseMessage(
  lang: AppLanguageCode,
  key: MessageKey,
  fallbackLabel: string = fallbackLabelForStoreBrowseKey(key)
): string {
  const raw = translate(lang, key).trim();
  if (!raw || raw === key || looksLikeMessageKey(raw)) {
    return fallbackLabel;
  }
  return raw;
}

export function safeStoreBrowseT(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  key: MessageKey,
  fallbackLabel: string = fallbackLabelForStoreBrowseKey(key)
): string {
  return sanitizeUiDisplayLabel(t(key), fallbackLabel);
}
