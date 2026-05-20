import type { AppLanguageCode } from "./config";
import { resolveLocalizedAdminLabel } from "./resolve-localized-admin-label";
import { translate, translateText, type MessageKey } from "./messages";
import {
  humanizeMessageKeySlug,
  looksLikeMessageKey,
  resolveSafeMessageKey,
  sanitizeUiDisplayLabel,
} from "./safe-ui-label";
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
  snack: "store_browse_food_snack",
  noodles: "store_browse_food_noodles",
  western: "store_browse_food_western",
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
  if (looksLikeMessageKey(s)) {
    return resolveSafeMessageKey(lang, s as MessageKey);
  }
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
      return translate(lang, "store_delivery_fee_courier_colon", { label });
    }
  }
  return s;
}

const STORE_PAYMENT_PART_CANONICAL: Record<string, MessageKey> = {
  GCash: "store_pay_label_gcash",
  "만나서 현금": "store_pay_display_cash_meet",
  "Cash on meet-up": "store_pay_display_cash_meet",
  "계좌이체": "store_pay_label_bank_transfer",
  "Bank transfer": "store_pay_label_bank_transfer",
  "현금(착불·만나서)": "store_pay_label_cod",
  "Cash (COD / meet-up)": "store_pay_label_cod",
  "기타": "store_pay_label_other",
  Other: "store_pay_label_other",
  "카드(배달 시 결제)": "store_pay_label_card_on_delivery",
  "Card (pay on delivery)": "store_pay_label_card_on_delivery",
  "GCash · 만나서 결제 등 (매장 확인)": "store_pay_methods_fallback",
  "GCash, cash on delivery, etc. (confirm with store)": "store_pay_methods_fallback",
};

function resolveStorePaymentPartUILabel(lang: AppLanguageCode, part: string): string {
  const p = part.trim();
  if (!p) return "";
  const key = STORE_PAYMENT_PART_CANONICAL[p];
  if (key) return translateStoreBrowseMessage(lang, key);
  if (looksLikeMessageKey(p)) return resolveSafeMessageKey(lang, p as MessageKey);
  const viaKo = translateText(lang, p);
  return viaKo !== p ? viaKo : p;
}

/** browse/home-feed API 결제 한 줄 — ko·en 혼재·레거시 구분자 보정 */
export function resolveStorePaymentMethodsUILabel(
  lang: AppLanguageCode,
  raw: string | null | undefined
): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  const key = STORE_PAYMENT_PART_CANONICAL[s];
  if (key) return translateStoreBrowseMessage(lang, key);
  const parts = s.split(/\s*[·]\s*|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) return resolveStorePaymentPartUILabel(lang, s);
  return parts.map((part) => resolveStorePaymentPartUILabel(lang, part)).join(" · ");
}

/** API `최소주문 ₱…` / `Min. order …` → 현재 언어 */
export function resolveStoreMinOrderUILabel(
  lang: AppLanguageCode,
  raw: string | null | undefined
): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const koMatch = s.match(/^최소주문\s+(.+)$/);
  if (koMatch?.[1]) {
    return translate(lang, "store_min_order_amount_colon", { amount: koMatch[1].trim() });
  }
  const enMatch = s.match(/^Min\.?\s*order\s+(.+)$/i);
  if (enMatch?.[1]) {
    return translate(lang, "store_min_order_amount_colon", { amount: enMatch[1].trim() });
  }
  const colonMatch = s.match(/^(?:최소\s*주문|Minimum order)\s*:\s*(.+)$/i);
  if (colonMatch?.[1]) {
    return translate(lang, "store_min_order_amount_colon", { amount: colonMatch[1].trim() });
  }
  return s;
}

export { fallbackLabelForStoreBrowseKey, safeStoreBrowseT } from "./store-browse-safe-label";
