import type { CategoryType } from "@/lib/categories/types";
import type { MessageKey } from "@/lib/i18n/messages";

const TYPE_KEYS: Record<CategoryType, MessageKey> = {
  trade: "admin_cat_type_trade",
  service: "admin_cat_type_service",
  community: "admin_cat_type_community",
  feature: "admin_cat_type_feature",
};

const TRADE_SUBTYPE_KEYS: Record<string, MessageKey> = {
  general: "admin_cat_subtype_general",
  "used-car": "admin_cat_subtype_used_car",
  "real-estate": "admin_cat_subtype_realestate",
  jobs: "admin_cat_subtype_jobs",
  exchange: "admin_cat_subtype_exchange",
  "rent-car": "admin_cat_subtype_rent_car",
  __custom__: "admin_cat_subtype_custom",
};

const MENU_TYPE_KEYS: Record<"trade" | "community", MessageKey> = {
  trade: "admin_cat_menu_type_trade",
  community: "admin_cat_menu_type_community",
};

const SKIN_KEYS: Record<string, MessageKey> = {
  basic: "admin_cat_skin_basic",
  gallery: "admin_cat_skin_gallery",
  magazine: "admin_cat_skin_magazine",
};

const POST_TYPE_KEYS: Record<string, MessageKey> = {
  normal: "admin_cat_post_normal",
  community: "admin_cat_post_community",
  job: "admin_cat_post_job",
  real_estate: "admin_cat_post_real_estate",
  car: "admin_cat_post_car",
  store: "admin_cat_post_store",
  service_request: "admin_cat_post_service_request",
  feature: "admin_cat_post_feature",
  post: "admin_cat_post_post",
  request: "admin_cat_post_request",
  link: "admin_cat_post_link",
};

export function adminCategoryTypeLabelKey(type: CategoryType): MessageKey {
  return TYPE_KEYS[type] ?? "admin_cat_type_trade";
}

export function adminTradeSubtypeLabelKey(value: string): MessageKey {
  return TRADE_SUBTYPE_KEYS[value] ?? "admin_cat_subtype_custom";
}

export function adminMenuTypeLabelKey(value: "trade" | "community"): MessageKey {
  return MENU_TYPE_KEYS[value];
}

export function adminCommunitySkinLabelKey(value: string): MessageKey {
  return SKIN_KEYS[value] ?? "admin_cat_skin_basic";
}

export function adminPostTypeLabelKey(value: string): MessageKey {
  return POST_TYPE_KEYS[value] ?? "admin_cat_post_normal";
}
