import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { CategoryType } from "@/lib/categories/types";

function catT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

export const CATEGORY_TYPE_MESSAGE_KEYS: Record<CategoryType, MessageKey> = {
  trade: "cat_type_trade",
  service: "cat_type_service",
  community: "cat_type_community",
  feature: "cat_type_feature",
};

export const TRADE_SKIN_MESSAGE_KEYS: Record<string, MessageKey> = {
  general: "cat_skin_general",
  "used-car": "cat_skin_used_car",
  "real-estate": "cat_skin_real_estate",
  jobs: "cat_skin_jobs",
  exchange: "cat_skin_exchange",
  "rent-car": "cat_skin_rent_car",
};

export function categoryTypeLabel(type: CategoryType): string {
  return catT(CATEGORY_TYPE_MESSAGE_KEYS[type]);
}

export function tradeSkinLabel(skinKey: string): string {
  const key = TRADE_SKIN_MESSAGE_KEYS[skinKey];
  return key ? catT(key) : skinKey;
}

export const MENU_TYPE_OPTIONS = [
  { value: "trade" as const, labelKey: "cat_menu_trade" as MessageKey },
  { value: "community" as const, labelKey: "cat_menu_community" as MessageKey },
];

export const TRADE_SUBTYPE_OPTIONS = [
  { value: "general", labelKey: "cat_skin_general" as MessageKey },
  { value: "used-car", labelKey: "cat_skin_used_car" as MessageKey },
  { value: "real-estate", labelKey: "cat_skin_real_estate" as MessageKey },
  { value: "jobs", labelKey: "cat_skin_jobs" as MessageKey },
  { value: "exchange", labelKey: "cat_skin_exchange" as MessageKey },
  { value: "rent-car", labelKey: "cat_skin_rent_car" as MessageKey },
  { value: "__custom__", labelKey: "cat_skin_custom" as MessageKey },
];

export const COMMUNITY_SKIN_OPTIONS = [
  { value: "basic", labelKey: "cat_community_basic" as MessageKey },
  { value: "gallery", labelKey: "cat_community_gallery" as MessageKey },
  { value: "magazine", labelKey: "cat_community_magazine" as MessageKey },
];

export const POST_TYPE_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "normal", labelKey: "cat_post_normal" },
  { value: "community", labelKey: "cat_post_community" },
  { value: "job", labelKey: "cat_post_job" },
  { value: "real_estate", labelKey: "cat_post_real_estate" },
  { value: "car", labelKey: "cat_post_car" },
  { value: "store", labelKey: "cat_post_store" },
  { value: "service_request", labelKey: "cat_post_service_request" },
  { value: "feature", labelKey: "cat_post_feature" },
  { value: "post", labelKey: "cat_post_post" },
  { value: "request", labelKey: "cat_post_request" },
  { value: "link", labelKey: "cat_post_link" },
];

export function categoryOptionLabel(labelKey: MessageKey): string {
  return catT(labelKey);
}
